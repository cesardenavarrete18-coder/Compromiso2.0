# Assignment runtime: schema-only legacy fixture

This directory contains observed **legacy** schema used by isolated M1-04A tests. It does not implement a canonical assignment handler or enable a gate. The existing `schema-baseline-b` and `assignment-boundary` fixtures remain unchanged.

`source.json` contains thirteen exact function definitions/ACLs from the M0 catalogue capture and a SELECT-only catalogue recapture of `public.lead_assignments`. M0 lacked the identity generation mode, sequence configuration/ACL and complete column metadata needed to reconstruct that table faithfully. Comparable table fields matched M0. No application/auth rows, sequence current value, credentials or settings secrets were queried or restored.

Run `python tests/m1/fixtures/assignment-runtime/build.py` from the repository to regenerate `overlay.sql` and `manifest.json`. The builder is local-only. It verifies source hashes, inherited fixture hashes and qualified dependencies; it does not run PostgreSQL and cannot certify business behavior. Generating this fixture is not a test PASS.

## Installation boundary

Use the isolated PostgreSQL harness only:

1. Unchanged `schema-baseline-b/bootstrap.sql` and the three certified foundation migrations, as installed by the runner.
2. Unchanged `assignment-boundary/overlay.sql`.
3. `assignment-runtime/overlay.sql` from this builder.
4. `assignment-runtime/channel-overlay.sql`, with its separately captured `channel-source.json` and `channel-manifest.json`.
5. For profiles that install candidate B, `assignment-runtime/appraisal-overlay.sql`: B's ownership guard depends on the real appraisal table. The A-only prerequisite profile does not require it.
6. Only the candidate migrations authorized for the selected test suite, applied verbatim as the non-superuser `postgres` migration actor.

The channel files have separate provenance and are not generated or overwritten by `build.py`. They supply actual mode-RPC/event/reminder/message dependencies; no Edge endpoint, sender or provider is invoked. Tests that do not require the assignment overlay must not silently inherit it as a change to baseline B.

## Added assignment objects

- `public.lead_assignments`: all seven columns, `GENERATED ALWAYS AS IDENTITY`, identity sequence parameters/ACL, five constraints, four indexes (one represented by its primary-key constraint), two policies, observed table ACL and RLS flags. No non-internal trigger was present in the capture.
- `private.assign_lead_to_seller_with_reason`, `public.assign_lead_to_seller`, `public.reassign_leads_to_seller`.
- `public.complete_contact_task`, `public.complete_contact_task_with_follow_up`, `public.record_contact_task_result`.
- Both overloads of `public.record_contact_answer_with_transition`, plus `public.record_lead_follow_up` and `public.refresh_due_contact_protocols`.
- Transitive helpers `private.apply_lead_opt_out`, `private.crm_transition_allowed`, `private.sync_protocol_next_action`.

All selected definitions, including legacy reset behavior and authorization based on historical task seller, are retained verbatim. Their missing or unsafe behavior is what candidate tests must expose; it is not corrected in the fixture. Function owners, explicit grants/revocations, volatility and `search_path` come from the captured definition/ACL. A test candidate can change them only after the observed baseline is loaded.

## Inherited dependencies and limits

B already supplies profiles/auth.uid, leads/CRM, sequences/tasks, activities, playbook, Recall panels/items, sales cases/requests/quotes, commercial applications, catalogue objects, customers, and their captured triggers/RLS. This preserves the actual assignment→cycle→protocol chain and related CRM side effects. Its source lists the exact boundary; it is not a complete Supabase or production clone.

There are no substitute implementations of legacy contact, follow-up or assignment business logic. The generator verifies qualified names against B plus this overlay, while real SQL installation and branch execution remain the harness's responsibility. Relevant schema timestamps span separate captures and are not an atomic database snapshot.

Not added to the principal overlay: external/App Script writers, network dispatch, live application data, every unrelated public RPC/table, and the full administrative document system. Commercial applications/quotes present in B can support preservation fixtures, but do not stand in for unrelated missing tables. Report any new dependency before extending the fixture; do not fabricate a stub to make a test pass.

## Optional appraisal overlay and fresh function comparison

The separately authorized `appraisal-overlay.sql` adds the actual `vehicle_appraisals` table and `public.save_lead_vehicle_appraisal(uuid,text,text,text,integer,integer,text,text)`. Its SELECT-only capture is `appraisal-source.json`; regenerate it with `python tests/m1/fixtures/assignment-runtime/build-appraisal.py`. The table's 28 columns, 15 constraints, three indexes, RLS policy, table/function ACLs and real `set_updated_at` trigger are reproduced. The original function checks owner before its upsert and is retained unchanged so an ownership race cannot be concealed by a test stub. Its qualified dependencies already exist in B.

Load this separately packaged overlay after the principal assignment overlay and before candidate B. It is required by both B profiles: assignment runtime and the final channel-guard suite that installs B. The A-only prerequisite suite does not require it. B's ownership guard has a real table dependency even when an individual test does not exercise appraisal behavior; omitting that schema would not reproduce the candidate faithfully. The overlay does not modify the principal overlay or its manifest/hash, does not implement appraisal logic, and does not invoke the market-reference Edge Function. `appraisal-manifest.json` records its own provenance and generated-only status.

`function-hash-comparison.json` records a separate SELECT-only check at 2026-09-18 03:41:51 UTC: all thirteen principal function-definition hashes match M0, with no missing or extra signature. This confirms those definitions, not fresh ACLs/roles or an atomic production snapshot. The appraisal capture at 03:42:00 UTC separately matches its M0 function definition, owner and ACL. Neither catalogue comparison substitutes for PostgreSQL installation or concurrency tests.
