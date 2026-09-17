# Local PostgreSQL harness — M1-01/02/03 only

This harness is a **proposed verification artifact, not evidence that SQL passed**.
The initial attempt in the hosted runtime was blocked before `initdb`: only UID/GID 0 were
mapped, and creating an `AF_UNIX` socket returned `EPERM`. No migrations or database
tests ran in that attempt. Its report remains `BLOCKED`, not PASS; a subsequent
authorized temporary runtime needs its own execution evidence. Do not patch PostgreSQL's
root check, fake `getuid`, remove the network filter, or use a remote database to
work around this result.

The test runner uses real PostgreSQL/libpq, not an in-memory SQL substitute. It
creates a separate disposable cluster **for each integration file**, including
fresh roles, so the synthetic handler/grants of the foundation suite cannot
contaminate security or installation verification. It loads only the three
explicitly named M1 migrations. `installation.integration.test.mjs` is the explicit
exception: its fresh cluster has bootstrap only; that suite tests ordering and
applies the exact migration files from `M1_TEST_MIGRATION_DIR`, without removing
their BEGIN/COMMIT statements. It does not run the repository-wide npm test command
or any online harness.

`schema-baseline-b.integration.test.mjs`, when present with its captured baseline,
uses the static override `fixtures/schema-baseline-b/bootstrap.sql` instead of the
minimal bootstrap. It also installs migrations within its own suite to compare the
catalog before and after. The report labels this layer separately and records the
exact bootstrap hash. It cannot silently fall back to the minimal fixture if its
baseline is unavailable.
The B mapping initializes the local cluster as `supabase_admin`, preserving its
captured structural role as PostgreSQL's bootstrap superuser; other suites use
`m1_test_admin`. The local transport accepts only those two fixed fixture identities.
Neither is a credential or a connection to an existing Supabase database.

## Prerequisites and reproducible invocation

- Linux with a mapped non-root user and permission to create Unix sockets.
- Python 3.9+, Node 22+, a C compiler or the audited precompiled guard below, and PostgreSQL **17** already installed
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

`--suite foundation.integration.test.mjs` selects one existing basename from
`tests/m1`; it cannot point to an arbitrary script. With no selector, each
`*.integration.test.mjs` runs in a new cluster and the report contains independent
results. Overall PASS requires every selected suite to pass. Fixture-schema
verification remains distinct from any schema-only baseline layer; this bootstrap
does not certify the full real CRM schema or a Supabase service stack.

For a temporary offline VM without a compiler, compile this repository's exact
`deny-network.c` on the build host and supply both the executable and its digest:

```sh
cc -O2 -Wall -Wextra -Werror tests/m1/harness/deny-network.c -o /path/outside/repository/deny-network
sha256sum /path/outside/repository/deny-network
```

Then append `--guard-binary /absolute/path/deny-network --guard-sha256 <digest>` to
the runner invocation. The executable is checked before and after staging, its
source/binary hashes are recorded, and the **same live isolation probes still run**.
This option does not disable or replace the guard with an environment assertion.
`--timeout-scale N` accepts 1 through 10 for slower emulated hosts. It scales only
deadlines (server startup, SQL, lock-wait observation and tests), records N and never
changes assertions, permits skips, or treats an unobserved lock wait as success.

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

## Transport to an authorized temporary host

Create the source-only allowlist archive outside the checkout:

```sh
python3 tests/m1/harness/pack-source.py --output /absolute/path/outside/repository/m1-validation-source.tar.gz
```

It contains only M1 tests/harness/SQL fixtures, the closed contract module and the
three named migrations. It excludes `.git`, repository configuration, environment
files, all data dumps, production manifests and service credentials. It records
actual file hashes and the base revision; uncommitted source changes remain marked
as such. The runner validates the included source manifest before using its files.

Transport that archive, the audited guard binary, and an independently identified
PostgreSQL/Node/Python toolchain. Use a fresh temporary Linux host/VM dedicated to
these synthetic tests, with no production credentials, volumes, network broker
sockets or databases. A VM can have no NIC; that is an additional boundary, not a
substitute for the syscall probes. Mount `/proc`, provide a real non-root account
(`nobody` when launching as root), and ensure the runtime paths and PostgreSQL
share/library tree are intact. There is **no DSN, Supabase project reference,
customer endpoint or token argument**. The runner creates its own local cluster
and random run marker, then stops and removes it unless `--keep` was requested.

Retain the JSON verification report and compare its source/guard/migration hashes
with the transported manifest. An executed synthetic-schema PASS must not be
renamed as full schema-only baseline, REST/JWT, legacy endpoint or production
certification. A missing prerequisite, unavailable syscall, failed suite or absent
report stays visible; it never selects an alternate remote database.
