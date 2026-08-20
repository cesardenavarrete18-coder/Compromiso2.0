alter table public.lead_activities
  drop constraint lead_activities_type;

alter table public.lead_activities
  add constraint lead_activities_type check (
    activity_type in (
      'status_change',
      'comment',
      'contact',
      'follow_up',
      'interview',
      'sale_request',
      'sale_confirmation',
      'assignment',
      'manual_creation',
      'vehicle_appraisal_requested',
      'vehicle_appraisal_confirmed',
      'vehicle_market_reference_checked'
    )
  );
