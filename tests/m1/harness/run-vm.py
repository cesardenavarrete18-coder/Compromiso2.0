#!/usr/bin/env python3
"""Provision a disposable, network-less Linux guest for the real PG17 harness.

Downloads nothing. Supply reviewed local QEMU/kernel/busybox/PostgreSQL artifacts.
Only allowlisted test source and runtime binaries enter an initramfs. No host
mount, NIC, port forward, cloud account, existing database or credentials exist.
"""
import argparse
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile

REPO = Path(__file__).resolve().parents[3]
MIGRATIONS = (
    "20260917154844_m1_runtime_authority_foundation.sql",
    "20260917154854_m1_private_capabilities.sql",
    "20260917154905_m1_command_receipts_events.sql",
)
MARKER = "M1_VM_RESULT_BASE64="


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def copy_file(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def dynamic_dependencies(programs, guest):
    """ldd only on the reviewed local runtime artifacts, never on customer input."""
    seen = set()
    pending = list(programs)
    while pending:
        program = Path(pending.pop())
        if program in seen or not program.is_file():
            continue
        seen.add(program)
        with program.open("rb") as stream:
            if stream.read(4) != b"\x7fELF":
                continue
        result = subprocess.run(["ldd", str(program)], text=True, capture_output=True,
                                env={"PATH": "/usr/bin:/bin", "LANG": "C"}, check=False)
        if "not found" in result.stdout:
            raise RuntimeError(f"Missing runtime dependency for {program}: {result.stdout}")
        for line in result.stdout.splitlines():
            match = re.search(r"(?:=>\s+)?(/[^\s]+)\s+\(", line)
            if not match:
                continue
            library = Path(match.group(1))
            # PostgreSQL's package-local libraries are already copied under /opt/pg.
            if str(library).startswith(("/lib/", "/lib64/", "/usr/lib/")):
                destination = guest / str(library).lstrip("/")
                if not destination.exists():
                    copy_file(library, destination)
                    pending.append(library)


def write_cpio(root, destination):
    """newc initramfs; represent /dev/console without mknod on the host."""
    with destination.open("wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0, compresslevel=1) as archive:
        inode = 1

        def entry(name, mode, data=b"", rmajor=0, rminor=0):
            nonlocal inode
            encoded = name.encode() + b"\0"
            values = [inode, mode, 0, 0, 1, 0, len(data), 0, 0, rmajor, rminor, len(encoded), 0]
            header = b"070701" + b"".join(f"{value:08x}".encode() for value in values)
            archive.write(header + encoded)
            archive.write(b"\0" * (-(len(header) + len(encoded)) % 4))
            archive.write(data)
            archive.write(b"\0" * (-len(data) % 4))
            inode += 1

        for path in sorted(root.rglob("*")):
            info = path.lstat()
            name = str(path.relative_to(root))
            if path.is_symlink():
                entry(name, info.st_mode, os.readlink(path).encode())
            elif path.is_dir():
                entry(name, info.st_mode)
            elif path.is_file():
                entry(name, info.st_mode, path.read_bytes())
        entry("dev/console", stat.S_IFCHR | 0o600, rmajor=5, rminor=1)
        entry("TRAILER!!!", 0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("qemu", "kernel", "bios", "busybox", "pg-root", "output"):
        parser.add_argument("--" + option, required=True, type=Path)
    parser.add_argument("--qemu-library-path", type=Path)
    parser.add_argument("--suite", action="append", default=[])
    parser.add_argument("--timeout-scale", type=int, choices=range(1, 11), default=3)
    parser.add_argument("--timeout", type=int, default=1800)
    args = parser.parse_args()
    for field in ("qemu", "kernel", "bios", "busybox", "pg_root"):
        setattr(args, field, getattr(args, field).resolve(strict=True))
    args.output = args.output.resolve()
    if args.output.exists():
        raise SystemExit("Output must be a new directory; preserve earlier run evidence")
    args.output.mkdir(parents=True)
    compiler = shutil.which("cc")
    node = shutil.which("node")
    python = Path("/usr/bin/python3").resolve(strict=True)
    if not compiler or not node:
        raise SystemExit("A local C compiler and Node are required")
    for suite in args.suite:
        if Path(suite).name != suite or not suite.endswith(".integration.test.mjs"):
            raise SystemExit("Invalid suite basename")
    if len(args.suite) > 1:
        raise SystemExit("Select one suite, or omit --suite to run all suites in separate clusters")
    work = Path(tempfile.mkdtemp(prefix="crm-m1-vm-"))
    guest = work / "root"
    guest.mkdir()
    manifest = {
        "harness": "crm-m1-qemu-no-nic/1", "status": "PREPARING",
        "remote_resources": False, "customer_data": False, "host_mounts": False,
        "network_devices": [], "host_forwards": [],
        "artifact_sha256": {field: sha(getattr(args, field)) for field in ("qemu", "kernel", "bios", "busybox")},
        "postgres_binary_sha256": sha(args.pg_root / "bin/postgres"),
        "repository_source_sha256": {},
    }
    try:
        for directory in ("bin", "dev", "proc", "sys", "tmp", "etc", "out", "usr/bin", "opt", "work"):
            (guest / directory).mkdir(parents=True, exist_ok=True)
        (guest / "tmp").chmod(0o1777)
        copy_file(args.busybox, guest / "bin/busybox")
        (guest / "bin/sh").symlink_to("busybox")
        copy_file(node, guest / "usr/bin/node")
        copy_file(python, guest / "usr/bin/python3")
        stdlib = Path(subprocess.check_output([str(python), "-c", "import sysconfig; print(sysconfig.get_paths()['stdlib'])"], text=True).strip())
        shutil.copytree(stdlib, guest / str(stdlib).lstrip("/"), ignore=shutil.ignore_patterns(
            "__pycache__", "site-packages", "dist-packages", "test", "tests", "idlelib", "tkinter", "ensurepip"))
        shutil.copytree(args.pg_root, guest / "opt/pg", symlinks=True)
        source_archive = work / "source.tar.gz"
        subprocess.run([sys.executable, str(REPO / "tests/m1/harness/pack-source.py"), "--output", str(source_archive)],
                       check=True, capture_output=True, env={"PATH": "/usr/bin:/bin", "LANG": "C"})
        with tarfile.open(source_archive, "r:gz") as sources:
            sources.extractall(guest / "work", filter="data")
        manifest["source_archive_sha256"] = sha(source_archive)
        for path in sorted((guest / "work").rglob("*")):
            if path.is_file():
                manifest["repository_source_sha256"][str(path.relative_to(guest / "work"))] = sha(path)
        guard = guest / "usr/bin/m1-deny-network"
        subprocess.run([compiler, "-O2", "-Wall", "-Wextra", "-Werror", str(guest / "work/tests/m1/harness/deny-network.c"), "-o", str(guard)],
                       env={"PATH": "/usr/bin:/bin", "LANG": "C"}, check=True)
        manifest["guard_binary_sha256"] = sha(guard)
        dynamic_dependencies([Path(node), python, guard, *args.pg_root.glob("bin/*"),
                              *args.pg_root.glob("lib/*.so*"), *stdlib.rglob("*.so")], guest)
        (guest / "etc/passwd").write_text("root:x:0:0:root:/:/bin/sh\nnobody:x:65534:65534:fixture:/tmp:/bin/sh\n")
        (guest / "etc/group").write_text("root:x:0:\nnogroup:x:65534:\n")
        (guest / "etc/nsswitch.conf").write_text("passwd: files\ngroup: files\nhosts: files\n")
        (guest / "etc/hosts").write_text("127.0.0.1 localhost\n::1 localhost\n")
        command = ["/usr/bin/python3", "/work/tests/m1/harness/run-local.py", "--pg-root", "/opt/pg",
                   "--report", "/out/database.json", "--guard-binary", "/usr/bin/m1-deny-network",
                   "--guard-sha256", manifest["guard_binary_sha256"], "--timeout-scale", str(args.timeout_scale)]
        for suite in args.suite:
            command.extend(["--suite", suite])
        entry = '''import base64, json, os, pathlib, subprocess
evidence = {"interfaces": sorted(p.name for p in pathlib.Path('/sys/class/net').iterdir()),
 "route": pathlib.Path('/proc/net/route').read_text(), "kernel": pathlib.Path('/proc/version').read_text(),
 "uid_map": pathlib.Path('/proc/self/uid_map').read_text(), "initial_environment_keys": sorted(os.environ)}
assert evidence['interfaces'] == ['lo'], evidence
pathlib.Path('/out/isolation.json').write_text(json.dumps(evidence, indent=2))
print('M1_VM_ISOLATION=' + json.dumps(evidence), flush=True)
result = subprocess.run(COMMAND, env={'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C','TZ':'UTC','PYTHONNOUSERSITE':'1'})
output = {'isolation':evidence,'runner_exit_code':result.returncode,
 'files':{p.name:p.read_text() for p in pathlib.Path('/out').glob('*.json')}}
print('M1_VM_RESULT_BASE64=' + base64.b64encode(json.dumps(output).encode()).decode(), flush=True)
'''.replace("COMMAND", repr(command))
        (guest / "vm-entry.py").write_text(entry)
        (guest / "init").write_text("""#!/bin/busybox sh
/bin/busybox mount -t proc proc /proc
/bin/busybox mount -t sysfs sysfs /sys
/bin/busybox mount -t devtmpfs devtmpfs /dev
/bin/busybox mkdir -p /dev/shm
/bin/busybox mount -t tmpfs tmpfs /dev/shm
/bin/busybox --install -s /bin
/bin/busybox env -i PATH=/usr/bin:/bin LANG=C LC_ALL=C /usr/bin/python3 /vm-entry.py
/bin/busybox poweroff -f
""")
        (guest / "init").chmod(0o755)
        archive = work / "root.cpio.gz"
        write_cpio(guest, archive)
        manifest["initramfs_sha256"] = sha(archive)
        invocation = [str(args.qemu), "-machine", "pc", "-accel", "tcg", "-cpu", "max", "-smp", "2", "-m", "2048",
                      "-nodefaults", "-nic", "none", "-display", "none", "-monitor", "none", "-serial", "stdio",
                      "-no-reboot", "-L", str(args.bios.parent.parent / "qemu"),
                      "-bios", str(args.bios), "-kernel", str(args.kernel), "-initrd", str(archive),
                      "-append", "console=ttyS0 rdinit=/init panic=1 quiet"]
        manifest["qemu_arguments"] = invocation
        firmware = args.bios.parent.parent / "qemu"
        manifest["boot_rom_sha256"] = {p.name: sha(p) for p in (firmware / "kvmvapic.bin", firmware / "linuxboot_dma.bin") if p.is_file()}
        env = {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"}
        if args.qemu_library_path:
            env["LD_LIBRARY_PATH"] = str(args.qemu_library_path.resolve(strict=True))
            modules = args.qemu_library_path.resolve(strict=True) / "qemu"
            if modules.is_dir():
                env["QEMU_MODULE_DIR"] = str(modules)
                manifest["qemu_module_sha256"] = {p.name: sha(p) for p in sorted(modules.glob("*.so"))}
        print("Booting disposable QEMU guest with no NIC, no host mount and no host credentials", flush=True)
        manifest["status"] = "RUNNING"
        with (args.output / "serial.log").open("wb") as serial, (args.output / "qemu.stderr").open("wb") as errors:
            process = subprocess.Popen(invocation, env=env, stdin=subprocess.DEVNULL, stdout=serial, stderr=errors)
            try:
                process.wait(timeout=args.timeout)
            except BaseException:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                raise
        log = (args.output / "serial.log").read_text(errors="replace")
        manifest["qemu_exit_code"] = process.returncode
        matches = re.findall(re.escape(MARKER) + r"([A-Za-z0-9+/=]+)", log)
        if len(matches) != 1:
            raise RuntimeError("Guest did not return exactly one completed report; inspect serial.log/qemu.stderr")
        result = json.loads(base64.b64decode(matches[0]))
        manifest["guest_isolation"] = result["isolation"]
        manifest["runner_exit_code"] = result["runner_exit_code"]
        for name, content in result["files"].items():
            if Path(name).name != name or not name.endswith(".json"):
                raise RuntimeError("Unexpected guest report name")
            (args.output / name).write_text(content)
        database = json.loads(result["files"].get("database.json", "{}"))
        suites = database.get("suites", [database])
        expected_suites = args.suite or sorted(p.name for p in (guest / "work/tests/m1").glob("*.integration.test.mjs"))
        if sorted(item.get("suite", "") for item in suites) != sorted(expected_suites):
            raise RuntimeError("Executed suite set differs from the requested source snapshot")
        for item in suites:
            if set(item.get("migration_sha256", {})) != set(MIGRATIONS):
                raise RuntimeError("Database report lacks the three migration artifact identities")
            if item.get("postgres_binary_sha256") != manifest["postgres_binary_sha256"]:
                raise RuntimeError("PostgreSQL executable differs from the reviewed guest artifact")
            if set(item.get("suite_sha256", {})) != {"tests/m1/" + item["suite"]}:
                raise RuntimeError("Database report lacks the selected suite identity")
            for name, digest in item.get("migration_sha256", {}).items():
                if manifest["repository_source_sha256"].get("supabase/migrations/" + name) != digest:
                    raise RuntimeError("Migration hash differs from the VM source snapshot")
            for name, digest in item.get("suite_sha256", {}).items():
                if manifest["repository_source_sha256"].get(name) != digest:
                    raise RuntimeError("Suite hash differs from the VM source snapshot")
        verified = (process.returncode == 0 and result["runner_exit_code"] == 0 and database.get("status") == "PASS"
                    and all(item.get("status") == "PASS" and item.get("database_started") is True
                            and item.get("integration_tests_executed") is True and item.get("test_exit_code") == 0
                            and re.search(r"^# tests [1-9][0-9]*$", item.get("tap", ""), re.MULTILINE)
                            and re.search(r"^# fail 0$", item.get("tap", ""), re.MULTILINE)
                            and re.search(r"^# skipped 0$", item.get("tap", ""), re.MULTILINE) for item in suites))
        manifest["status"] = "PASS" if verified else "FAIL"
    except KeyboardInterrupt:
        manifest["status"] = "CANCELLED"
        manifest["error"] = "Operator cancelled this disposable VM; no certification result"
    except Exception as error:
        manifest["status"] = "BLOCKED" if manifest["status"] == "PREPARING" else "FAIL"
        manifest["error"] = str(error)
        print(str(error), file=sys.stderr)
    finally:
        shutil.rmtree(work)
        manifest["guest_destroyed"] = True
        (args.output / "vm.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"status": manifest["status"], "output": str(args.output), "guest_destroyed": True}))
    return 0 if manifest["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
