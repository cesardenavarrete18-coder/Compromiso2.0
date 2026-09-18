# Casos ejecutados en PostgreSQL aislado

Evidencia compuesta: corrida conjunta de 143 hojas y suplemento de runtime47 que reemplaza runtime44. Son 146 casos distintos, no 190. Los 27 obligatorios son A01–A27 y los 23 permisos G01–G23. Los tests padre no cuentan como casos. El diagnóstico histórico no es aceptación del dominio nuevo.

## A: prerrequisito de guarda

| Caso DB | Resultado |
|---|---|
| P01: captured legacy channel closure and candidate A install verbatim as non-superuser with zero adoption or authority seeds | PASS |
| P02: legacy owner retains helper/control access and actual mode RPC; nonowner is denied atomically | PASS |
| P03: active admin and supervisor retain actual legacy mode RPC behavior | PASS |
| P04: runtime metadata and even an authoritative gate alone are not durable adoption | PASS |
| P05: controlled adoption records server-derived cutover provenance and denies owner through helper, RLS and the real legacy mode RPC | PASS |
| P06: the restriction needs no conversation state row or channel authority mutation | PASS |
| P07: pausing the gate and retrying the same technical adoption cannot restore seller capability | PASS |
| P08: durable evidence rejects UPDATE/DELETE/TRUNCATE and survives rollback of a later gate transaction | PASS |
| P09: authenticated seller cannot write adoption/runtime/gates, assume owner role or invoke the technical adoption capability | PASS |
| P10: actor metadata, arbitrary GUCs and request-header claims cannot remove the durable restriction | PASS |
| P11: inactive seller is denied on both legacy and adopted ownership | PASS |
| P12: adoption preserves active admin/supervisor behavior and does not touch M1 channel state or epoch | PASS |
| P13: real READ COMMITTED mode RPC holds the lead permission lock; technical adoption waits then revokes the old seller session | PASS |
| P14: real old REPEATABLE READ snapshot cannot use the legacy mode RPC after adoption; serialization failure precedes channel writes | PASS |
| P15: old REPEATABLE READ cannot truncate assignment history inserted and adopted after its snapshot | PASS |
| P16: PostgREST-style READ ONLY transaction can evaluate legacy and adopted helper/control SELECT policies | PASS |

## A: 23 permisos con comandos reales

| Caso DB | Resultado |
|---|---|
| G01: precutover legacy seller-owner retains real permission and mode RPC | PASS |
| G02: precutover seller-nonowner is denied by helper, actual control RLS and both mode RPC requests | PASS |
| G03: active admin retains legacy mode RPC behavior | PASS |
| G04: active supervisor retains legacy mode RPC behavior | PASS |
| G05: durable adopted seller-owner is denied even though ownership is unchanged | PASS |
| G06: real runtime AssignLead null→B grants commercial ownership without channel capability | PASS |
| G07: real runtime TransferLead A→B leaves new owner without channel capability | PASS |
| G08: old owner A remains unable to intervene after A→B | PASS |
| G09: real B→A return transfer cannot restore A channel permission | PASS |
| G10: real AcknowledgeLeadAssignment cannot grant channel access or rewrite ownership | PASS |
| G11: real commands preserve channel_authority; the restriction also works without a conversation-state row | PASS |
| G12: authority_epoch remains exactly unchanged across Assign, Transfer, return Transfer and Acknowledge | PASS |
| G13: paused assignment gate cannot restore the seller capability of an adopted lead | PASS |
| G14: real command retry and rollback preserve durable adoption without duplicate or leaked command effects | PASS |
| G15: crm_lead_runtime row without adoption keeps legacy channel behavior despite gate metadata | PASS |
| G16: real gateway rejects caller payloads that forge adoption or actor authority | PASS |
| G17: GUCs, forged JWT metadata and request headers cannot remove server-side adoption or forge role | PASS |
| G18: real authenticated seller cannot mutate adoption, gate, assignment epochs or technical adoption capability | PASS |
| G19: active admin and supervisor preserve actual legacy management capability on adopted leads | PASS |
| G20: inactive seller remains denied on both legacy and adopted assigned leads | PASS |
| G21: an old authenticated seller session cannot intervene after a real ownership transfer commits | PASS |
| G22: direct legacy set_whatsapp_conversation_mode fails for adopted current owner without channel/control/event side effects | PASS |
| G23: helper and actual control/event RLS remain denied across repeated real owner changes; no field or permission silently regrants access | PASS |

## B: 27 obligatorias y 20 adicionales

| Caso DB | Resultado |
|---|---|
| A27: installing candidates changes no business rows, activates no gate and grants no API access | PASS |
| A26: inactive installation retains characterized legacy transfer reset; runtime gate inactive rejects | PASS |
| A01: genuine initial assignment succeeds without creating a protocol or acquiring a channel | PASS |
| A02: TransferLead A→B changes future owner with a valid versioned command | PASS |
| A03: Seña and Cierre stages survive transfer without becoming Nuevo | PASS |
| A04: next action, its source and post-deposit appointment are preserved | PASS |
| A05: interview facts and historical timestamps are preserved | PASS |
| A06: deposit amount, effective date and validation are unchanged | PASS |
| A07: active protocol IDs, started_at and historical seller survive intact | PASS |
| A08: historical tasks, actors, performed_at and existing activity rows are not reattributed | PASS |
| A09: transfer creates no protocol and cancels no existing task | PASS |
| A10: transfer has no start_lead_crm_cycle semantics or new cycle activity | PASS |
| A11: assignment_epoch increments exactly once | PASS |
| A12: aggregate_version increments exactly once under the command contract | PASS |
| A13: exactly one assignment history row and command event identify the actual supervisor | PASS |
| A14: retries/double click preserve one Assign and Transfer effect; changed destination conflicts | PASS |
| A15: former owner using an authenticated old identity cannot mutate an inherited pending task | PASS |
| A16: B resolves the original pending task through the real RPC without rewriting task or sequence provenance | PASS |
| A17: TransferLead leaves channel authority unchanged | PASS |
| A18: TransferLead changes no channel authority_epoch | PASS |
| A19: adopted assignment cannot grant seller WhatsApp capability or mode RPC access | PASS |
| A20: acknowledge is versioned/idempotent and changes neither owner nor assigned_at | PASS |
| A21: acknowledge does not fabricate handoff/obligations or change dialogue policy | PASS |
| A22: two supervisors A→B versus A→C serialize in real sessions with one actionable loser | PASS |
| A23: an old-owner real follow-up racing an uncommitted transfer cannot overwrite B | PASS |
| A24: target becoming inactive concurrently rejects atomically after a real profile lock wait | PASS |
| A25: adopted-domain legacy RPC/direct owner writers are characterized and actually fenced | PASS |
| X01: B acknowledging an assignment not yet committed loses with an actionable version conflict | PASS |
| X02: simultaneous supervisor double click serializes the same key into one effect and a replay | PASS |
| X03: retry from a new session after a committed response is lost returns the durable prior result | PASS |
| X04: seller cannot self-assign, transfer, forge actor/assigned_by/epoch or acknowledge another owner | PASS |
| X05: old owner refresh_due_contact_protocols does not advance an adopted protocol still bearing historical A | PASS |
| X06: adopted current-owner task/sequence/assignment reads work in a genuine read-only authenticated transaction | PASS |
| X07: historical quote ownership does not let A mutate an adopted opportunity after transfer | PASS |
| X08: real appraisal RPC passes its old owner check, then a committed transfer makes its eventual write fail atomically | PASS |
| X09: Assign rejects orphan opportunities with a prior agenda, contact or inherited protocol/history | PASS |
| X10: Transfer rejects terminal CRM stages and an administrative sales case without altering historical facts | PASS |
| X11: an actual assignment-history INSERT failure rolls back owner/history/activity/runtime/receipt/event and permits the same-key retry | PASS |
| F01 extra foundation: certified execution, normalization and canonical hash SQL remain byte-identical after A+B | PASS |
| F02 extra foundation: added authority stays private and runtime gains no broad legacy DML | PASS |
| F03 extra foundation: stock FoundationProbe remains compiled closed through the new public gateway | PASS |
| F04 extra foundation: actual probe commits one effect/event/receipt, replays, rejects key conflict, and retains SQL/JS hash parity | PASS |
| F05 extra foundation: stale aggregate and assignment versions reject without a synthetic effect | PASS |
| F06 extra foundation: exception after real SQL effect rolls back effect, receipt, event and aggregate atomically | PASS |
| F07 extra foundation: test hook is restored closed and no evaluating receipt or orphan event remains | PASS |
| F08 extra foundation: receipt execution proof is server-derived, terminally disabled and cannot be supplied through the API | PASS |
| F09 extra foundation: receipt proof constraints reject invalid proof, duplicate active proof and undecided COMMIT | PASS |

## Fundación original

| Caso DB | Resultado |
|---|---|
| ISOLATION: PostgreSQL17, Unix socket, restricted migrator and six private tables | PASS |
| M14: no API role can directly read/write new tables or execute the installed gateway | PASS |
| M12: default gates observe; no authoritative/quiescing state can be installed | PASS |
| M13: future recovery/internal send purposes cannot become ready or authoritative | PASS |
| M15: new conversation structure stays disabled/paused; seller cannot acquire channel authority | PASS |
| STOCK-HOOK: even fixture-ready gates cannot activate the installed handler | PASS |
| M01: same command_id and same intent have one logical result | PASS |
| M02: same idempotency key/hash with a new command UUID replays the original | PASS |
| M03: a changed payload under the same key conflicts without another effect | PASS |
| M04: stale aggregate/assignment versions reject before applying | PASS |
| M05: caller actor/role cannot be supplied in envelope or payload | PASS |
| M06: inactive user cannot apply a command or recover an old replay | PASS |
| M07: foreign, unassigned and formerly owned scopes are denied without receipt disclosure | PASS |
| M08: effect/event/receipt/version commit atomically and SQL hash matches the actual JS contract | PASS |
| M09: backend crash before COMMIT leaves no partial receipt/event/effect | PASS |
| M10: retry after COMMIT from a fresh connection returns the committed result | PASS |
| M11: two real sessions race on one command; observed lock wait, exactly one application | PASS |
| FAILPOINT: exception after synthetic DML rolls back every command effect | PASS |
| GATE-VECTOR: changing one domain epoch does not borrow authority from the other | PASS |
| VERSION-EXHAUSTED: safe integer ceiling cannot overflow into an imprecise JS version | PASS |
| BUSINESS-DEDUPE: different keys cannot duplicate the synthetic operation identity | PASS |
| DEFERRED-GUARD: evaluating receipts cannot commit | PASS |
| APPEND-ONLY: terminal receipts/events/policy reject mutation and TRUNCATE | PASS |
| DEFERRED-EVENT: an event cannot later attach to a rejected receipt | PASS |
| CONCURRENT-CAS: distinct intents at one version produce one effect and one conflict | PASS |
| FINAL-INVARIANTS: no evaluating receipt/orphan event; new channel authority remains closed | PASS |

## Instalación certificada

| Caso DB | Resultado |
|---|---|
| I00: fresh relevant schema only, with no M1 role, gateway or tables | PASS |
| I01: 02 and 03 without predecessors fail and leave no role, schema grant or object | PASS |
| I02: 01 preflight rejects an absent required legacy relation before creating anything | PASS |
| I03: 01 alone commits four empty tables, FORCE RLS and no API permission | PASS |
| I04: 03 after only 01 fails without making the partial installation usable | PASS |
| I05: 02 transfers only new ownership and removes temporary CREATE/SET/INHERIT | PASS |
| I06: a dependency failure in 03 rolls back its temporary membership and schema grants | PASS |
| I07: 01->02->03 commits six closed tables with validated constraints/indexes and expected trigger graph | PASS |
| I08: accidentally applying 03 twice fails transactionally, without changing the installed state | PASS |

## Seguridad certificada

| Caso DB | Resultado |
|---|---|
| S16/S19: installed owners, membership options and real API denials | PASS |
| S18: definer/invoker ownership and private helper EXECUTE are explicit | PASS |
| S18/S26: installed probe derives actor through read/lock helpers and cannot mutate legacy | PASS |
| S20/S21/S22: UPDATE, DELETE and TRUNCATE cannot rewrite or remove committed history | PASS |
| S17: FORCE RLS filters the NOLOGIN table owner; disabling FORCE changes the result | PASS |
| S16/S17: RLS still denies an ordinary role with fixture SELECT; BYPASSRLS is not falsely certified | PASS |
| S18/S25: spoofed auxiliary claims do not replace the active profile or current owner | PASS |
| S23-GATE: an in-flight gate change is awaited and rechecked before any effect | PASS |
| S23-LEAD/S25: current ownership is read under a real lead lock after waiting | PASS |
| S24: a real PostgreSQL deadlock and full transaction retry cannot duplicate an intent | PASS |

## Compatibilidad B certificada

| Caso DB | Resultado |
|---|---|
| B00: source integrity and real bootstrap identity are prerequisites | PASS |
| B01: observed tables, columns, constraints, indexes, triggers, policies, functions, sequences and enum match | PASS |
| B02: selected roles, membership grantors, schemas and default ACLs match | PASS |
| B03: captured auth.uid implementation honors real JWT claims precedence and malformed claims | PASS |
| B4: 20260917154844_m1_runtime_authority_foundation.sql applies verbatim as postgres NOSUPERUSER and preserves observed objects | PASS |
| B5: 20260917154854_m1_private_capabilities.sql applies verbatim as postgres NOSUPERUSER and preserves observed objects | PASS |
| B6: 20260917154905_m1_command_receipts_events.sql applies verbatim as postgres NOSUPERUSER and preserves observed objects | PASS |
| B07: six empty runtime tables are closed despite broad observed public-schema default grants | PASS |
| B08: installed handler remains closed and no legacy capabilities leak to the runtime owner | PASS |

## Diagnóstico histórico

| Caso DB | Resultado |
|---|---|
| D00: captured helper, controls structure/ACL/RLS/triggers and real B identity are reproduced | PASS |
| D01: synthetic invitations/users/leads and two actual disabled conversation rows are installed with legacy triggers enabled | PASS |
| D02: before owner change, target B has neither WhatsApp capability nor lead/control visibility | PASS |
| D03: PASS_DIAGNOSTIC_OBSERVED_CONFLICT — A→B owner UPDATE grants B capability while actual channel row/epoch stay identical | PASS |
| D04: PASS_DIAGNOSTIC_OBSERVED_CONFLICT — null→B initial owner UPDATE has the same independent channel-permission coupling | PASS |
| D05: real authenticated role remains unable to access private runtime or activate the installed gateway | PASS |
