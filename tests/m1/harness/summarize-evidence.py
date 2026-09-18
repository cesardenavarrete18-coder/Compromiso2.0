#!/usr/bin/env python3
"""Summarize already-executed VM/PG evidence; never executes SQL or changes tests.

TAP parent nodes are excluded from the leaf-case count. PASS still requires the
VM verifier, real PostgreSQL runner and zero failures/skips, not source matching.
"""
import argparse
import json
from pathlib import Path
import re


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--certified-cases", type=Path,
                        help="optional previous case manifest; require every exact suite/name pair")
    args = parser.parse_args()
    directory = args.directory.resolve(strict=True)
    database = json.loads((directory / "database.json").read_text())
    vm = json.loads((directory / "vm.json").read_text())
    suites = database.get("suites", [database])
    cases = []
    summaries = []
    for suite in suites:
        tap = suite.get("tap", "")
        counts = {key: int(value) for key, value in re.findall(
            r"^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$", tap, re.MULTILINE)}
        leaves = [{"suite": suite["suite"], "case": name,
                   "status": "FAIL" if verdict == "not ok" else "PASS"}
                  for verdict, name in re.findall(r"^    (not ok|ok) \d+ - (.+)$", tap, re.MULTILINE)]
        # All current M1 integration suites expose their cases one level below a
        # single named parent. Unknown TAP structure must be reviewed, not guessed.
        if not leaves:
            raise SystemExit("BLOCKED: no explicit leaf cases in " + suite["suite"])
        cases.extend(leaves)
        summaries.append({"suite": suite["suite"], "status": suite["status"],
                          "leaf_cases": len(leaves), "tap_counts": counts,
                          "postgres_version": suite.get("postgres_version"),
                          "fixture_layer": suite.get("fixture_layer"),
                          "source_manifest": suite.get("source_manifest")})
    pairs = {(case["suite"], case["case"]) for case in cases}
    missing = []
    if args.certified_cases:
        reference = json.loads(args.certified_cases.read_text())["cases"]
        missing = sorted((case["suite"], case["case"]) for case in reference
                         if (case["suite"], case["case"]) not in pairs)
    passed = (vm.get("status") == "PASS" and database.get("status") == "PASS"
              and all(suite.get("database_started") is True
                      and suite.get("integration_tests_executed") is True
                      and suite.get("test_exit_code") == 0 for suite in suites)
              and all(case["status"] == "PASS" for case in cases)
              and all(item["tap_counts"].get("fail") == 0
                      and item["tap_counts"].get("skipped") == 0 for item in summaries)
              and not missing)
    report = {"source": "executed PostgreSQL 17 TAP in isolated VM; parents excluded",
              "status": "PASS" if passed else "FAIL", "unique_leaf_cases": len(pairs),
              "missing_certified_cases": missing, "suites": summaries, "cases": cases}
    target = directory / "summary.json"
    target.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "unique_leaf_cases": len(pairs),
                      "missing_certified_cases": len(missing), "report": str(target)}))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
