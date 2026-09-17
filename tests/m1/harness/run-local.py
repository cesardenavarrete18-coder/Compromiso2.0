#!/usr/bin/env python3
"""Run M1 foundation integration tests on a fresh, Unix-only PostgreSQL 17.

No download or remote DB mode exists in this launcher. Supply an already
installed local PostgreSQL tree containing bin/{postgres,initdb,pg_ctl} and libpq.
The launcher uses only Python stdlib, a C compiler, Node and PostgreSQL itself.
"""
import argparse
import hashlib
import json
import os
import pathlib
import pwd
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import uuid


MIGRATIONS = (
    "20260917154844_m1_runtime_authority_foundation.sql",
    "20260917154854_m1_private_capabilities.sql",
    "20260917154905_m1_command_receipts_events.sql",
)
REPO = pathlib.Path(__file__).resolve().parents[3]
SOURCE_TESTS = REPO / "tests/m1"
BOOTSTRAP_ONLY_SUITES = {"installation.integration.test.mjs", "schema-baseline-b.integration.test.mjs"}
SCHEMA_BOOTSTRAPS = {
    "schema-baseline-b.integration.test.mjs": "fixtures/schema-baseline-b/bootstrap.sql",
    "assignment-boundary.integration.test.mjs": "fixtures/schema-baseline-b/bootstrap.sql",
}
SOURCE_MANIFEST = REPO / "m1-validation-source-manifest.json"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_source_manifest():
    if not SOURCE_MANIFEST.is_file():
        return None
    manifest = json.loads(SOURCE_MANIFEST.read_text())
    if manifest.get("schema") != "crm-m1-validation-source/1":
        raise SystemExit("BLOCKED: unrecognized source manifest")
    listed = set()
    for item in manifest.get("files", []):
        path = REPO / item["path"]
        if not path.resolve().is_relative_to(REPO) or not path.is_file() or path.is_symlink() or digest(path) != item["sha256"]:
            raise SystemExit("BLOCKED: validation source manifest mismatch")
        listed.add(item["path"])
    for suite in SOURCE_TESTS.glob("*.integration.test.mjs"):
        if str(suite.relative_to(REPO)) not in listed:
            raise SystemExit("BLOCKED: an integration suite is absent from the source manifest")
    return {"sha256": digest(SOURCE_MANIFEST), "git_base_revision": manifest["git_base_revision"],
            "source_has_uncommitted_changes": manifest["source_has_uncommitted_changes"]}


def run_independent_suites(args, test_files, node):
    """Each file gets a new cluster, including independent roles and fixtures."""
    result = {
        "harness": "crm-m1-unix-seccomp/2", "status": "BLOCKED", "cluster_per_suite": True,
        "fixture_layers": [], "remote_database": False,
        "timeout_scale": args.timeout_scale, "suites": [],
    }
    report_dir = pathlib.Path(tempfile.mkdtemp(prefix="crm-m1-reports-", dir="/tmp"))
    clean_env = {"PATH": ":".join([str(pathlib.Path(node).parent), str(pathlib.Path(sys.executable).parent), "/usr/bin", "/bin"]),
                 "LANG": "C", "LC_ALL": "C", "TZ": "UTC", "PYTHONNOUSERSITE": "1"}
    try:
        for suite in test_files:
            child_report = report_dir / (suite.name + ".json")
            command = [sys.executable, str(pathlib.Path(__file__).resolve()), "--pg-root", str(args.pg_root),
                       "--report", str(child_report), "--suite", suite.name, "--timeout-scale", str(args.timeout_scale)]
            if args.guard_binary:
                command += ["--guard-binary", str(args.guard_binary), "--guard-sha256", args.guard_sha256]
            if args.keep:
                command += ["--keep"]
            print(f"=== Fresh isolated cluster: {suite.name} ===", flush=True)
            process = subprocess.Popen(command, env=clean_env, close_fds=True, start_new_session=True)
            try:
                code = process.wait(timeout=360 * args.timeout_scale)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                code = -1
            if child_report.is_file():
                item = json.loads(child_report.read_text())
            else:
                item = {"status": "BLOCKED", "error": "Suite did not produce a verification report", "process_exit_code": code}
            item["suite"] = suite.name
            if code != 0 and item.get("status") == "PASS":
                item["status"] = "FAIL"
                item["error"] = "PASS report conflicts with nonzero process exit"
            result["suites"].append(item)
        statuses = [item["status"] for item in result["suites"]]
        result["fixture_layers"] = sorted({item["fixture_layer"] for item in result["suites"] if "fixture_layer" in item})
        result["status"] = "PASS" if statuses and all(s == "PASS" for s in statuses) else ("FAIL" if "FAIL" in statuses else "BLOCKED")
        result["integration_tests_executed"] = any(item.get("integration_tests_executed", False) for item in result["suites"])
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(result, indent=2) + "\n")
    finally:
        shutil.rmtree(report_dir)
    print(json.dumps({"status": result["status"], "report": str(args.report), "independent_clusters": len(result["suites"])}))
    return 0 if result["status"] == "PASS" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-root", required=True, type=pathlib.Path)
    parser.add_argument("--report", required=True, type=pathlib.Path)
    parser.add_argument("--suite", help="one basename from tests/m1/*.integration.test.mjs; default runs each in a fresh cluster")
    parser.add_argument("--guard-binary", type=pathlib.Path, help="audited precompiled deny-network executable for compiler-free hosts")
    parser.add_argument("--guard-sha256", help="required expected digest for --guard-binary")
    parser.add_argument("--timeout-scale", type=float, default=1.0, help="1..10; increases deadlines only, never changes assertions")
    parser.add_argument("--keep", action="store_true", help="retain the synthetic cluster for local diagnosis")
    args = parser.parse_args()
    source_manifest = verify_source_manifest()
    args.report = args.report.resolve()
    if not 1 <= args.timeout_scale <= 10:
        raise SystemExit("BLOCKED: timeout scale must be between 1 and 10")
    if bool(args.guard_binary) != bool(args.guard_sha256):
        raise SystemExit("BLOCKED: --guard-binary and --guard-sha256 must be supplied together")
    if args.guard_binary:
        args.guard_binary = args.guard_binary.resolve(strict=True)
        if not args.guard_binary.is_file() or not os.access(args.guard_binary, os.X_OK) or not re.fullmatch(r"[0-9a-f]{64}", args.guard_sha256 or ""):
            raise SystemExit("BLOCKED: invalid audited guard executable or digest")
        if digest(args.guard_binary) != args.guard_sha256:
            raise SystemExit("BLOCKED: audited guard binary hash mismatch")
    if sys.platform != "linux":
        raise SystemExit("BLOCKED: the network isolation launcher requires Linux seccomp")
    pg_root = args.pg_root.resolve(strict=True)
    for program in ("postgres", "initdb", "pg_ctl"):
        if not (pg_root / "bin" / program).is_file():
            raise SystemExit("BLOCKED: local PostgreSQL tree is incomplete")
    libpq_candidates = sorted((pg_root / "lib").glob("libpq.so.5*"))
    if not libpq_candidates:
        raise SystemExit("BLOCKED: local libpq is required")
    node = shutil.which("node")
    compiler = shutil.which("cc")
    if not node or (not compiler and not args.guard_binary):
        raise SystemExit("BLOCKED: Node and a C compiler or audited precompiled guard are required")
    for name in MIGRATIONS:
        path = REPO / "supabase/migrations" / name
        if not path.is_file() or not path.read_text().strip():
            raise SystemExit(f"BLOCKED: migration not ready: {name}")
    test_files = sorted(SOURCE_TESTS.glob("*.integration.test.mjs"))
    if args.suite:
        if args.suite not in {path.name for path in test_files}:
            raise SystemExit("BLOCKED: suite must be an existing basename under tests/m1")
        test_files = [SOURCE_TESTS / args.suite]
    if not test_files:
        raise SystemExit("BLOCKED: no explicit M1 integration suites exist")
    args.pg_root = pg_root
    if len(test_files) > 1:
        return run_independent_suites(args, test_files, node)
    suite_name = test_files[0].name
    boundary_diagnostic = suite_name == "assignment-boundary.integration.test.mjs"
    bootstrap_only = suite_name in BOOTSTRAP_ONLY_SUITES
    bootstrap_user = "supabase_admin" if suite_name in SCHEMA_BOOTSTRAPS else "m1_test_admin"
    bootstrap_relative = SCHEMA_BOOTSTRAPS.get(suite_name, "fixtures/bootstrap.sql")
    bootstrap_source = SOURCE_TESTS / bootstrap_relative
    if not bootstrap_source.is_file() or not bootstrap_source.read_text().strip():
        raise SystemExit("BLOCKED: required suite-specific bootstrap is unavailable")

    work = pathlib.Path(tempfile.mkdtemp(prefix="crm-m1-", dir="/tmp"))
    account = pwd.getpwnam("nobody") if os.geteuid() == 0 else pwd.getpwuid(os.geteuid())
    child_identity = {"user": account.pw_uid, "group": account.pw_gid, "extra_groups": []} if os.geteuid() == 0 else {}
    clean_build_env = {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"}
    report = {
        "harness": "crm-m1-unix-seccomp/2", "run_id": str(uuid.uuid4()), "suite": suite_name,
        "source_manifest": source_manifest,
        "fixture_layer": ("B_plus_synthetic_boundary_data" if boundary_diagnostic else
                          "schema_only_baseline_b" if suite_name in SCHEMA_BOOTSTRAPS else "minimal_synthetic_auth_crm"),
        "bootstrap_source": f"tests/m1/{bootstrap_relative}", "bootstrap_sha256": digest(bootstrap_source), "cluster_per_suite": True,
        "bootstrap_user": bootstrap_user,
        "migration_installation": "suite_controlled_verbatim" if bootstrap_only else "runner_installs_all_three",
        "timeout_scale": args.timeout_scale,
        "status": "BLOCKED", "remote_database": False, "external_egress": False,
        "requested_database_major": 17, "requested_uid": account.pw_uid,
        "database_started": False, "migrations_applied": [], "integration_tests_executed": False,
        "migration_sha256": {name: digest(REPO / "supabase/migrations" / name) for name in MIGRATIONS},
        "postgres_binary_sha256": digest(pg_root / "bin/postgres"),
        "guard_source_sha256": digest(SOURCE_TESTS / "harness/deny-network.c"),
        "guard_binary_sha256": args.guard_sha256 if args.guard_binary else None,
        "guard_precompiled": bool(args.guard_binary),
        "suite_sha256": {str(p.relative_to(REPO)): digest(p) for p in test_files},
        "limits": [
            ("Schema B plus synthetic boundary diagnostic data; not M1-04A acceptance, no production rows or Supabase REST gateway."
             if boundary_diagnostic else
             "Schema-only baseline B: coverage is limited to its explicit manifest; no production rows or Supabase REST gateway."
             if suite_name in SCHEMA_BOOTSTRAPS else "Synthetic auth/profiles/leads fixture; not a full production schema or Supabase REST gateway."),
            "No legacy handler, trigger, frontend or external sender is changed or certified.",
            "Database effects occur only in the disposable local cluster.",
        ],
    }
    server = None
    log_handle = None
    started = time.monotonic()
    try:
        version_probe = subprocess.run([str(pg_root / "bin/postgres"), "--version"],
            env={**clean_build_env, "LD_LIBRARY_PATH": str(pg_root / "lib")},
            check=True, capture_output=True, text=True, close_fds=True)
        report["postgres_version"] = version_probe.stdout.strip()
        blockers = []
        try:
            unix_probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            unix_probe.close()
            report["unix_socket_available"] = True
        except OSError as error:
            report["unix_socket_available"] = False
            report["unix_socket_error"] = {"errno": error.errno, "reason": error.strerror}
            blockers.append("the runtime rejects required AF_UNIX sockets")
        if os.geteuid() == 0:
            # Some hosted runtimes map only UID/GID 0; PostgreSQL cannot safely
            # run there. Never patch/getuid-preload around PostgreSQL's guard.
            for kind, wanted in (("uid", account.pw_uid), ("gid", account.pw_gid)):
                ranges = [list(map(int, line.split())) for line in pathlib.Path(f"/proc/self/{kind}_map").read_text().splitlines()]
                report[f"{kind}_map"] = ranges
                if not any(start <= wanted < start + length for start, _outside, length in ranges):
                    blockers.append(f"{kind} {wanted} is not mapped (PostgreSQL requires a non-root process)")
        if blockers:
            report["blockers"] = blockers
            raise RuntimeError("BLOCKED: " + "; ".join(blockers) + ". Use an authorized local Linux runtime with Unix sockets and a mapped non-root user; no remote fallback or root-guard bypass.")
        target_pg = work / "pg"
        shutil.copytree(pg_root, target_pg, symlinks=True)
        tests = work / "tests/m1"
        shutil.copytree(SOURCE_TESTS, tests)
        shutil.copytree(REPO / "supabase/functions/_shared/crm-runtime", work / "supabase/functions/_shared/crm-runtime")
        migration_dir = work / "migrations"
        migration_dir.mkdir()
        for name in MIGRATIONS:
            shutil.copy2(REPO / "supabase/migrations" / name, migration_dir / name)
        guard = work / "deny-network"
        if args.guard_binary:
            shutil.copy2(args.guard_binary, guard)
            if digest(guard) != args.guard_sha256:
                raise RuntimeError("BLOCKED: staged guard hash mismatch")
        else:
            subprocess.run([compiler, "-O2", "-Wall", "-Wextra", "-Werror", str(tests / "harness/deny-network.c"), "-o", str(guard)],
                           env=clean_build_env, check=True, capture_output=True, text=True)
        report["guard_binary_sha256"] = digest(guard)
        socket_dir = work / "socket"
        socket_dir.mkdir(mode=0o700)
        data = work / "data"
        # Only this newly created, synthetic tree is made available to the test user.
        if os.geteuid() == 0:
            for base, directories, files in os.walk(work):
                os.chown(base, account.pw_uid, account.pw_gid)
                for name in directories + files:
                    os.chown(pathlib.Path(base) / name, account.pw_uid, account.pw_gid, follow_symlinks=False)
        libpq_path = target_pg / "lib" / libpq_candidates[0].name
        child_env = {
            "PATH": ":".join([str(pathlib.Path(node).parent), str(pathlib.Path(sys.executable).parent), str(target_pg / "bin"), "/usr/bin", "/bin"]),
            "LANG": "C", "LC_ALL": "C", "TZ": "UTC", "PYTHONNOUSERSITE": "1",
            "LD_LIBRARY_PATH": str(target_pg / "lib"),
            "M1_TEST_ISOLATED": "unix-socket-seccomp-v1",
            "M1_TEST_SOCKET_DIR": str(socket_dir), "M1_TEST_PORT": "6543",
            "M1_TEST_DATABASE": "m1_foundation_test", "M1_TEST_RUN_ID": report["run_id"],
            "M1_TEST_BOOTSTRAP_USER": bootstrap_user,
            "M1_TEST_TIMEOUT_SCALE": str(args.timeout_scale),
            "M1_TEST_MIGRATION_DIR": str(migration_dir),
            "M1_LIBPQ_PATH": str(libpq_path), "M1_PYTHON_BIN": sys.executable,
            "M1_TEST_FIXTURE_DIR": str(tests / "fixtures"),
            "PGPASSFILE": "/dev/null", "PGSERVICEFILE": "/dev/null",
        }
        report["environment_keys"] = sorted(child_env)
        options = {"env": child_env, "cwd": work, "close_fds": True, **child_identity}

        def run(command, **kwargs):
            return subprocess.run([str(guard), *map(str, command)], **options, **kwargs)

        version = run([target_pg / "bin/postgres", "--version"], check=True, capture_output=True, text=True)
        report["postgres_version"] = version.stdout.strip()
        if not version.stdout.startswith("postgres (PostgreSQL) 17."):
            raise RuntimeError("BLOCKED: this acceptance run requires PostgreSQL major 17")
        run([target_pg / "bin/initdb", "-D", data, "-U", bootstrap_user, "--auth-local=trust", "--auth-host=reject", "--no-locale", "-E", "UTF8"],
            check=True, capture_output=True, text=True)
        log_handle = (work / "postgres.log").open("w")
        server = subprocess.Popen([
            str(guard), str(target_pg / "bin/postgres"), "-D", str(data),
            "-c", "listen_addresses=", "-c", f"unix_socket_directories={socket_dir}",
            "-c", "port=6543", "-c", "ssl=off", "-c", "max_connections=20",
            "-c", f"m1.test_run_id={report['run_id']}",
        ], stdout=log_handle, stderr=subprocess.STDOUT, **options)
        deadline = time.monotonic() + 15 * args.timeout_scale
        while not (socket_dir / ".s.PGSQL.6543").exists():
            if server.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError("PostgreSQL did not start: " + (work / "postgres.log").read_text())
            time.sleep(0.05)

        def sql(sql_text, bootstrap=False):
            env = dict(child_env)
            extra = []
            if bootstrap:
                env["M1_TEST_DATABASE"] = "postgres"
                extra = ["--bootstrap"]
            completed = subprocess.run([
                str(guard), sys.executable, str(tests / "harness/libpq-session.py"), *extra,
            ], input=json.dumps({"id": 1, "sql": sql_text}) + "\n", text=True,
                capture_output=True, timeout=30 * args.timeout_scale, **{**options, "env": env})
            if completed.returncode != 0:
                raise RuntimeError(completed.stderr or completed.stdout)
            result = json.loads(completed.stdout.strip())
            if not result["ok"]:
                raise RuntimeError(f"SQL fixture/migration failed: {result}")
            return result

        sql("CREATE DATABASE m1_foundation_test", bootstrap=True)
        report["database_started"] = True
        report["isolation"] = sql("SELECT current_setting('listen_addresses') AS listen_addresses, current_setting('m1.test_run_id') AS marker, inet_server_addr() IS NULL AS unix_socket")
        sql((tests / bootstrap_relative).read_text())
        if not bootstrap_only:
            for name in MIGRATIONS:
                sql("SET SESSION AUTHORIZATION postgres;\n" + (migration_dir / name).read_text() + "\nRESET SESSION AUTHORIZATION;")
                report["migrations_applied"].append(name)
        report["migration_role"] = sql("SELECT rolname, rolsuper, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = 'postgres'")
        selected = [str(tests / path.name) for path in test_files]
        report["integration_tests_executed"] = True
        outcome = run([node, "--test", "--test-concurrency=1", "--test-reporter=tap", *selected],
                      capture_output=True, text=True, timeout=240 * args.timeout_scale)
        report["test_exit_code"] = outcome.returncode
        report["tap"] = outcome.stdout
        report["stderr"] = outcome.stderr
        report["status"] = "PASS" if outcome.returncode == 0 else "FAIL"
        sys.stdout.write(outcome.stdout)
        sys.stderr.write(outcome.stderr)
    except Exception as error:
        report["error"] = str(error)
        report["status"] = "BLOCKED" if "BLOCKED" in str(error) else "FAIL"
        print(report["error"], file=sys.stderr)
    finally:
        if server is not None and server.poll() is None:
            try:
                run([target_pg / "bin/pg_ctl", "-D", data, "-m", "fast", "-w", "stop"],
                    check=True, capture_output=True, text=True, timeout=15)
            except Exception:
                server.terminate()
                server.wait(timeout=10)
        if log_handle:
            log_handle.close()
        report["duration_seconds"] = round(time.monotonic() - started, 3)
        report["temporary_cluster_retained"] = str(work) if args.keep else None
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n")
        if not args.keep:
            shutil.rmtree(work)
    print(json.dumps({"status": report["status"], "report": str(args.report), "postgres": report.get("postgres_version")}))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
