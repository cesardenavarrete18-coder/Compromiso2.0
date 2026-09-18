# M1-04B legacy boundary — candidate implementation

This document describes PSQL-04B-02. It is not production certification. The
candidate is installed only in the disposable laboratory. No historical
migration or Edge/frontend source is edited.

## Baseline guard and installation

The migration starts a transaction and checks the M1-04B-01 private tables and
helpers before replacing any function. For each of 22 replaced functions it
checks the exact `pg_proc.prosrc` digest, owner, SECURITY DEFINER status and ACL.
The expected baseline is certified M1-04A plus the dated schema-only captures,
not an assertion about a fresh production catalog. Seven critical triggers also
must retain their relation, name, target, timing/event type and enabled state.
Any discrepancy aborts installation before modifying legacy functions.

`tests/m1/fixtures/contact-runtime/fence-baseline-manifest.json` records the
source and both MD5 and SHA-256 of those source bodies. MD5 is a drift check, not
a cryptographic authorization primitive. Exact captured additional baseline RPC
bodies, owner and grants are in `legacy-writers-overlay.sql`; these are test
fixtures, not proposed new commercial RPCs.

CREATE OR REPLACE preserves the existing RPC identities and ACLs. The only
SECURITY INVOKER → DEFINER adaptation is the closed private trigger function
`enforce_en_gestion_next_contact()`, whose new exceptions read protected B facts.
Its owner remains postgres and no execute privilege is added. New effect helpers
are closed and use an empty search_path. `crm_contact_apply_restriction(uuid)`
is callable only by the existing internal runtime owner and postgres, and
requires a live, transaction-bound B command receipt; its argument is not proof.

## Effective writer behavior

| Surface | Before B adoption | After B adoption |
|---|---|---|
| Complete task, result, follow-up, both answer overloads | Characterized body and permissions remain | Early `COMMAND_METADATA_REQUIRED`, before task/CRM/activity writes |
| Supervisor schedule/management | Characterized body | Early `COMMAND_METADATA_REQUIRED` |
| Supervisor status, Recall attempt | Characterized body | Early `DOMAIN_BOUNDARY_REQUIRED`; no partial mixed workflow |
| Restart/reconcile/future protocol RPC | Characterized body | Early metadata error; no cancellation or restart before rejection |
| Create/cancel/sync legacy protocol helper | Characterized body | `DOMAIN_BOUNDARY_REQUIRED`; B uses fixed SQL effects over existing tasks |
| Refresh due protocols | Processes eligible legacy and A-only leads | Excludes B; checks adoption again after the lead prelock |
| Completed-sequence classifier and direct exhausted classifier | Characterized behavior | Return without commercial classification; no cold/Recall routing |
| CRM agenda trigger | Characterized implicit cancellation | Requires B proof and only normalizes the projection; no implicit cancellation |
| CRM status-change protocol trigger | Characterized behavior | Rejects the mixed transition in its transaction |
| CRM next/last-contact and cold-base fields | Legacy rules | Require B proof; B proof only permits its next/last-contact allowlist |
| Task/sequence history | Legacy rules | Updates require B proof; IDs, windows, historical owner and plan are immutable; INSERT/DELETE denied |
| Comments, interview fields, quote/appraisal fields | Existing rules | No new contact credit or privileges; existing A scope checks still apply |
| DELETE/TRUNCATE of protected/shared history | Existing rules absent B | Reject whole operation when it would intersect durable B adoption |

B commands are independently constrained by their normalizer and executor.
Fences are a last line of defense, not a generic write API. A valid contact
receipt cannot change commercial stage, interview, deposit, sale, identity,
channel authority, assignment owner or epochs through the CRM allowlist.

The unchanged webhook and mixed sales/workflow callers remain incompatible when
they overlap a B-owned field. Their transaction fails; this does not certify
caller error handling or make them ready for cutover.

## Durable boundary and snapshots

The final row trigger is named `a00_crm_contact_fence`, sorting before the A
commercial-owner trigger. It locks the canonical parent lead with `FOR SHARE
NOWAIT` before trusting adoption. Technical B adoption touches only the parent
lead tuple. CRM/task/sequence timestamps and history remain byte-identical; the
parent barrier also covers INSERT where no previous child tuple exists.
A REPEATABLE READ writer predating that
barrier must abort instead of relying on an old absent-adoption snapshot.

INSERT cannot rely solely on touching old task rows, so it uses the parent
barrier too. TRUNCATE examines parent tuples before permitting the whole-table
operation; RLS is not its defense. Concurrent adoption and TRUNCATE cannot
silently erase history after the marker.

There is a deliberately documented technical coexistence change: under a
conflicting row lock the new parent barriers return **55P03**, and a stale
REPEATABLE READ snapshot can return **40001**, including a legacy transaction
crossing adoption. They never wait for an upper-level lead lock after taking a
CRM/task/customer lock. The application must retry the complete transaction;
these errors are not success or a second commercial intention.

For CRM on a B-adopted lead, the A seller guard retains the same active/current
owner predicate but takes its lead SHARE lock with NOWAIT. A-only leads, quotes
and appraisals retain the prior guard path. This closes the known CRM→lead wait
inversion without weakening A scope authorization. It does not establish one
universal lock order for unknown legacy consumers.

Customer DNC guards may inspect the already-linked lead parents using SHARE
NOWAIT after the customer row lock. This is a non-waiting validation barrier,
not permission to write another lead. Shared-customer contention may cause a
transaction retry. No guarantee of global identity-wide sender coordination is
introduced.

## Restrictive opt-out and agenda exceptions

The B restriction helper derives the lead and already-linked customer under
lead→customer locks, validates normalized-phone identity, and updates only the
monotonic DNC fields. Existing timestamp/reason are preserved. The focal branch
of `ensure_lead_customer` prevents identity or consent upsert during this proven
B effect. No other lead is mutated and no external effect is generated.

The En gestión agenda guard permits a missing date only while preserving stage
and with an active B receipt plus either (1) real DNC on the lead or (2) a
nonhistorical fact and completed action belonging to this same receipt, with
persistent `next_action_required`. Administrative cancellation is not this
exception. The executor enforces the same replacement rule for Cierre.

An opt-out restriction cannot be weakened by a correction, owner transfer,
paused gate, timestamp replacement, legacy helper or direct DML. The B engine
alone determines the narrowly permitted paused intention. The helper does not
infer paused authorization from session variables or client flags.

## Rollback and remaining blockers

Before adoption, candidate rollback is laboratory re-creation or forward repair.
After adoption, pausing commands does not remove these guards or restore legacy
writers. Facts, adoptions, task evidence and A channel denial remain. There is
no automatic down migration restoring seller channel authority.

The complete behavioral and concurrency assertions belong to the real DB test
evidence. This document is not proof of a PASS. Uncharacterized external writers,
frontend callers, identity-first workflows and senders remain cutover blockers;
BL-06 remains P0 and M0 remains open.
