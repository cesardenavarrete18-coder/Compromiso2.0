# Local PostgreSQL harness — M1-01/02/03 only

This harness is a **proposed verification artifact, not evidence that SQL passed**.
The current hosted runtime blocks execution before `initdb`: only UID/GID 0 are
mapped, and creating an `AF_UNIX` socket returns `EPERM`. No migrations or database
tests ran here. The launcher reports `BLOCKED`, not PASS. Do not patch PostgreSQL's
root check, fake `getuid`, remove the network filter, or use a remote database to
work around this result.

The test runner uses real PostgreSQL/libpq, not an in-memory SQL substitute. It
creates a disposable cluster, loads only the three explicitly named M1 migrations,
and executes the integration suite with independent connections and observed lock
waits. It does not run the repository-wide npm test command or any online harness.

## Prerequisites and reproducible invocation

- Linux with a mapped non-root user and permission to create Unix sockets.
- Python 3.12+, Node 22+, a C compiler, and PostgreSQL **17** already installed
  in a local tree with `bin/postgres`, `bin/initdb`, `bin/pg_ctl`, `lib/libpq.so.5*`
  and the matching `share/` files. The launcher downloads nothing.
- When invoked as root, it starts children as `nobody`; otherwise it uses the
  existing non-root account. Failure to obtain the required user is a blocker.
- seccomp filters must be available. The launcher closes inherited FDs above 2,
  denies creation of non-Unix sockets, rejects the x32 syscall ABI and
  `io_uring_setup`, verifies IP socket denial, and requires Unix sockets to work.

From the repository root:

```sh
python3 tests/m1/harness/run-local.py \
  --pg-root /absolute/path/to/local/postgresql-17 \
  --report /absolute/path/outside/repository/m1-pg-report.json
```

`--keep` retains the synthetic temporary cluster for local diagnosis; the default
stops PostgreSQL and removes it. PostgreSQL has `listen_addresses=''`, a unique
socket directory, no TCP listener and a random run marker checked by every libpq
connection. Only `m1_foundation_test` is accepted by the test transport; a separate
internal bootstrap invocation may connect to `postgres` in that same marked
cluster to create the test database.

The local toolchain acquired for this session was the npm archive
`@embedded-postgres/linux-x64@17.6.0-beta.15`, obtained with `npm pack
--ignore-scripts` outside the repository. Its packaging version has a beta suffix;
the native binary reports `postgres (PostgreSQL) 17.6`. It is third-party binary
packaging, not a claim of an official PostgreSQL distribution. Archive integrity:

```text
sha512-f04/oSB35rc2SB4WbJLvUGeh8eNnnwbsIkLXLf86Bi43vOc7H07Znx1zROwpi08mGkUFmNrpAcXyL4Yu8YRgMw==
postgres binary SHA256: 23cd174849b273064c47d581b55be596be2f5cf0ee5d3e76c0146e2464bf873a
```

That archive omits symlinks. If using the same package, restore the relative
symlinks described by its inspected `native/pg-symlinks.json`, only when both
source and target resolve inside the extracted package. Do not copy this binary
tree into the repository. A normal local PostgreSQL distribution with the required
layout is also supported; the report records its binary hash/version.

## What is exercised, and what remains outside the result

`foundation.integration.test.mjs` contains the 15 requested minimum contracts plus
specific guards for deferred commit, hash parity, duplicate operation identity,
per-domain fencing, safe-integer exhaustion and competing CAS commands. The suite
must be launched through `run-local.py`; direct execution is deliberately blocked.

The bootstrap has only synthetic `auth.users`, `auth.uid()`, `public.profiles`
(`app_role`: admin/seller/supervisor/admventas) and `public.leads`. Migrations execute
with **session authorization** `postgres`, a NOSUPERUSER/CREATEROLE/BYPASSRLS role;
an internal `RESET ROLE` therefore cannot restore the bootstrap superuser. It is
not a full Supabase stack, does not include production's complete RLS/trigger
graph, and does not certify PostgREST/JWT/Edge behavior.

Before enabling a fixture caller, tests verify that the installed gateway has no
API EXECUTE grant and the new tables have no direct API access. They then grant gateway execution to the local fixture caller and verify
that the installed `FoundationProbe` hook returns `COMMAND_NOT_IMPLEMENTED` even
with local fixture gates in `ready`. Only after that check does the fixture
replace the hook with a synthetic aggregate handler.
Those fixture changes exist in the disposable database only. No migration contains
that handler, grant, fixture table, failpoint, or runtime switch to activate it.

Application/receipt/event assertions therefore certify only the foundation
transaction contract once executed successfully. They do not certify assignment,
sale, payment, protocol, inbox, outbox, WhatsApp permissions of a legacy endpoint,
or any M1-04+ business handler. Gates remain non-authoritative; future send purposes
and conversation authority stay closed. The known legacy seller-channel risk is
not repaired or declared resolved by this suite.

The report records exact migration/suite hashes, executable version, environment
key names, isolation result, applied migrations, TAP output and blockers. A syntax
check or successful IP-denial probe must never be reported as a database test PASS.
