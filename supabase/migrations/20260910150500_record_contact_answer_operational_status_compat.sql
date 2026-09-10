-- CRM V2 compatibility hotfix.
-- The seller frontend uses the same CRM V2 management payload for manual and
-- protocol-answered transitions. record_lead_follow_up already accepts
-- p_interview_operational_status, while the atomic answered RPC predates that
-- argument. This overload accepts the frontend contract and delegates to the
-- canonical 14-argument atomic function without changing commercial semantics.
--
-- p_interview_operational_status is intentionally required on this overload so
-- existing sparse callers that do not send it continue resolving unambiguously
-- to the original function. The current UI sends 'scheduled' for Entrevista and
-- NULL for other statuses; the canonical function already persists exactly that
-- behavior.

create or replace function public.record_contact_answer_with_transition(
  p_task_id uuid,
  p_status text,
  p_interview_operational_status text,
  p_note text default '',
  p_next_contact_at timestamptz default null,
  p_next_contact_note text default '',
  p_contact_outcome text default '',
  p_interview_at timestamptz default null,
  p_interview_location text default '',
  p_deposit_amount numeric default null,
  p_priority text default 'normal',
  p_performed_at timestamptz default now(),
  p_interview_mode text default null,
  p_deposit_validation text default '',
  p_desist_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_interview_operational_status is not null
     and p_interview_operational_status <> 'scheduled' then
    raise exception 'Estado operativo de entrevista inválido para una respuesta inicial';
  end if;

  perform public.record_contact_answer_with_transition(
    p_task_id => p_task_id,
    p_status => p_status,
    p_note => p_note,
    p_next_contact_at => p_next_contact_at,
    p_next_contact_note => p_next_contact_note,
    p_contact_outcome => p_contact_outcome,
    p_interview_at => p_interview_at,
    p_interview_location => p_interview_location,
    p_deposit_amount => p_deposit_amount,
    p_priority => p_priority,
    p_performed_at => p_performed_at,
    p_interview_mode => p_interview_mode,
    p_deposit_validation => p_deposit_validation,
    p_desist_reason => p_desist_reason
  );
end;
$$;

revoke all on function public.record_contact_answer_with_transition(
  uuid, text, text, text, timestamptz, text, text, timestamptz, text,
  numeric, text, timestamptz, text, text, text
) from public, anon;

grant execute on function public.record_contact_answer_with_transition(
  uuid, text, text, text, timestamptz, text, text, timestamptz, text,
  numeric, text, timestamptz, text, text, text
) to authenticated;

comment on function public.record_contact_answer_with_transition(
  uuid, text, text, text, timestamptz, text, text, timestamptz, text,
  numeric, text, timestamptz, text, text, text
) is 'Compatibility overload for CRM V2 answered transitions carrying interview_operational_status; delegates atomically to the canonical answered RPC.';

notify pgrst, 'reload schema';