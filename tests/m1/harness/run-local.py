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
import shutil
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


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-root", required=True, type=pathlib.Path)
    parser.add_argument("--report", required=True, type=pathlib.Path)
    parser.add_argument("--keep", action="store_true", help="retain the synthetic cluster for local diagnosis")
    args = parser.parse_args()
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
    if not node or not compiler:
        raise SystemExit("BLOCKED: Node and a C compiler are required")
    for name in MIGRATIONS:
        path = REPO / "supabase/migrations" / name
        if not path.is_file() or not path.read_text().strip():
            raise SystemExit(f"BLOCKED: migration not ready: {name}")
    test_files = sorted(SOURCE_TESTS.glob("*.integration.test.mjs"))
    if not test_files:
        raise SystemExit("BLOCKED: no explicit M1 integration suites exist")

    work = pathlib.Path(tempfile.mkdtemp(prefix="crm-m1-", dir="/tmp"))
    args.report = args.report.resolve()
    account = pwd.getpwnam("nobody") if os.geteuid() == 0 else pwd.getpwuid(os.geteuid())
    child_identity = {"user": account.pw_uid, "group": account.pw_gid, "extra_groups": []} if os.geteuid() == 0 else {}
    clean_build_env = {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"}
    report = {
        "harness": "crm-m1-unix-seccomp/1", "run_id": str(uuid.uuid4()),
        "status": "BLOCKED", "remote_database": False, "external_egress": False,
        "requested_database_major": 17, "requested_uid": account.pw_uid,
        "database_started": False, "migrations_applied": [], "integration_tests_executed": False,
        "migration_sha256": {name: digest(REPO / "supabase/migrations" / name) for name in MIGRATIONS},
        "postgres_binary_sha256": digest(pg_root / "bin/postgres"),
        "suite_sha256": {str(p.relative_to(REPO)): digest(p) for p in test_files},
        "limits": [
            "Synthetic auth/profiles/leads fixture; not a full production schema or Supabase REST gateway.",
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
        subprocess.run([compiler, "-O2", "-Wall", "-Wextra", "-Werror", str(tests / "harness/deny-network.c"), "-o", str(guard)],
                       env=clean_build_env, check=True, capture_output=True, text=True)
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
        run([target_pg / "bin/initdb", "-D", data, "-U", "m1_test_admin", "--auth-local=trust", "--auth-host=reject", "--no-locale", "-E", "UTF8"],
            check=True, capture_output=True, text=True)
        log_handle = (work / "postgres.log").open("w")
        server = subprocess.Popen([
            str(guard), str(target_pg / "bin/postgres"), "-D", str(data),
            "-c", "listen_addresses=", "-c", f"unix_socket_directories={socket_dir}",
            "-c", "port=6543", "-c", "ssl=off", "-c", "max_connections=20",
            "-c", f"m1.test_run_id={report['run_id']}",
        ], stdout=log_handle, stderr=subprocess.STDOUT, **options)
        deadline = time.monotonic() + 15
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
                capture_output=True, timeout=30, **{**options, "env": env})
            if completed.returncode != 0:
                raise RuntimeError(completed.stderr or completed.stdout)
            result = json.loads(completed.stdout.strip())
            if not result["ok"]:
                raise RuntimeError(f"SQL fixture/migration failed: {result}")
            return result

        sql("CREATE DATABASE m1_foundation_test", bootstrap=True)
        report["database_started"] = True
        report["isolation"] = sql("SELECT current_setting('listen_addresses') AS listen_addresses, current_setting('m1.test_run_id') AS marker, inet_server_addr() IS NULL AS unix_socket")
        sql((tests / "fixtures/bootstrap.sql").read_text())
        for name in MIGRATIONS:
            sql("SET SESSION AUTHORIZATION postgres;\n" + (migration_dir / name).read_text() + "\nRESET SESSION AUTHORIZATION;")
            report["migrations_applied"].append(name)
        report["migration_role"] = sql("SELECT rolname, rolsuper, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = 'postgres'")
        selected = [str(tests / path.name) for path in test_files]
        report["integration_tests_executed"] = True
        outcome = run([node, "--test", "--test-concurrency=1", "--test-reporter=tap", *selected],
                      capture_output=True, text=True, timeout=240)
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
