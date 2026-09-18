#!/usr/bin/env python3
"""Create a deterministic, credential-free M1 validation source archive.

Only the three certified migrations, explicitly declared assignment/contact candidates,
runtime contract and M1 tests/fixtures are included. No repository config,
environment, git directory, data dump, production
manifest, provider token or dependency installation is copied.
"""
import argparse
import gzip
import hashlib
import io
import json
import pathlib
import subprocess
import sys
import tarfile

sys.dont_write_bytecode = True
from candidate_plan import CANDIDATE_MIGRATIONS_BY_SUITE, all_candidate_migrations, candidate_migrations_for

REPO = pathlib.Path(__file__).resolve().parents[3]
MIGRATIONS = (
    "20260917154844_m1_runtime_authority_foundation.sql",
    "20260917154854_m1_private_capabilities.sql",
    "20260917154905_m1_command_receipts_events.sql",
)
MANIFEST_NAME = "m1-validation-source-manifest.json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("--suite", help="restrict candidate artifacts to one existing integration suite")
    args = parser.parse_args()
    output = args.output.resolve()
    if output.is_relative_to(REPO):
        raise SystemExit("Refusing to write validation archive inside the repository")
    if args.suite and args.suite not in {path.name for path in (REPO / "tests/m1").glob("*.integration.test.mjs")}:
        raise SystemExit("Suite must be an existing integration basename under tests/m1")
    candidates = candidate_migrations_for(args.suite) if args.suite else all_candidate_migrations()
    selected = [REPO / "supabase/migrations" / name for name in (*MIGRATIONS, *candidates)]
    selected += [REPO / "supabase/functions/_shared/crm-runtime/contracts.mjs"]
    assignment_contract = REPO / "supabase/functions/_shared/crm-runtime/assignment-contracts.mjs"
    if assignment_contract.is_file():
        selected.append(assignment_contract)
    contact_contract = REPO / "supabase/functions/_shared/crm-runtime/contact-next-action-contracts.mjs"
    if contact_contract.is_file():
        selected.append(contact_contract)
    selected += sorted((REPO / "tests/m1").glob("*.mjs"))
    for directory, suffixes in (("harness", {".py", ".mjs", ".c", ".md"}), ("fixtures", {".sql", ".json", ".py"})):
        selected += sorted(path for path in (REPO / "tests/m1" / directory).rglob("*") if path.is_file() and path.suffix in suffixes)
    entries = {}
    for path in selected:
        if path.is_symlink() or not path.resolve().is_relative_to(REPO) or not path.is_file():
            raise SystemExit(f"Unsafe or missing allowlisted source: {path}")
        entries[str(path.relative_to(REPO))] = path.read_bytes()
    clean_env = {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"}
    revision = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, env=clean_env,
                              check=True, capture_output=True, text=True).stdout.strip()
    dirty = subprocess.run(["git", "status", "--porcelain", "--untracked-files=normal", "--", *entries],
                           cwd=REPO, env=clean_env, check=True, capture_output=True, text=True).stdout.splitlines()
    manifest = {
        "schema": "crm-m1-validation-source/1", "git_base_revision": revision,
        "source_has_uncommitted_changes": bool(dirty), "changed_paths": sorted(dirty),
        "scope": "M1-01/M1-02/M1-03 regression and explicitly declared assignment/contact candidate validation; no production",
        "candidate_migrations_by_suite": ({args.suite: candidates} if args.suite else CANDIDATE_MIGRATIONS_BY_SUITE),
        "files": [{"path": name, "sha256": hashlib.sha256(content).hexdigest(), "size": len(content)}
                  for name, content in sorted(entries.items())],
    }
    manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    entries[MANIFEST_NAME] = manifest_bytes
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as archive:
            for name, content in sorted(entries.items()):
                info = tarfile.TarInfo(name)
                info.size = len(content)
                info.mode = 0o644
                info.mtime = 0
                archive.addfile(info, io.BytesIO(content))
    print(json.dumps({"archive": str(output), "archive_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
                      "source_manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(), "source_files": len(manifest["files"]),
                      "git_base_revision": revision, "source_has_uncommitted_changes": bool(dirty)}))


if __name__ == "__main__":
    main()
