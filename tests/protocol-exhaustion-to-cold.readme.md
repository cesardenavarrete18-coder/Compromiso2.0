# Protocol exhaustion -> Base fria acceptance criteria

- Recognize the current 18-call / 9-band + 2 WhatsApp protocol.
- Recognize the immediately preceding 6-call + 2 WhatsApp protocol for historical reconciliation.
- Treat expired, unperformed windows as `skipped`, never as completed seller contacts.
- Require zero answered tasks, zero cancelled tasks, and zero unfinished tasks.
- Never override a manual next action, interview, deposit, sale flow, closed lead, DNC lead, or sales case.
- On exhaustion, transition only `nuevo` / `no_contesta` to `desistir` with reason `No contactado post protocolo` and `cold_base_at` anchored to sequence completion.
- Preserve original assignment/source history and let existing recall behavior queue the lead for later recovery.
- Exclude the obsolete 3-call + 4-WhatsApp shape from automatic historical backfill.
