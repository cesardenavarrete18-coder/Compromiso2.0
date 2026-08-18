-- Normalize Argentine mobile numbers imported without country code.
-- The public RPC remains the same, but all rows are canonicalized before
-- duplicate detection and persistence.

create function private.normalize_argentina_mobile_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if v_digits like '00%' then
    v_digits := substring(v_digits from 3);
  end if;

  -- Accept the common local form with a trunk zero (for example 011...).
  if v_digits ~ '^0[0-9]{10}$' then
    v_digits := substring(v_digits from 2);
  end if;

  -- Argentina mobile canonical form used by WhatsApp Cloud API: 54 + 9 + 10 digits.
  if v_digits ~ '^[0-9]{10}$' then
    return '549' || v_digits;
  end if;
  if v_digits ~ '^9[0-9]{10}$' then
    return '54' || v_digits;
  end if;
  if v_digits ~ '^54[0-9]{10}$' then
    return '549' || substring(v_digits from 3);
  end if;

  -- Already canonical or foreign/unknown formats are preserved.
  return v_digits;
end;
$$;

revoke all on function private.normalize_argentina_mobile_phone(text) from public, anon, authenticated;

alter function public.import_lead_rows(text, text, jsonb) set schema private;
alter function private.import_lead_rows(text, text, jsonb) rename to import_lead_rows_raw;
revoke all on function private.import_lead_rows_raw(text, text, jsonb) from public, anon, authenticated;

create function public.import_lead_rows(
  p_base_type text,
  p_file_name text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_rows jsonb;
begin
  select coalesce(
    jsonb_agg(
      case
        when jsonb_typeof(source.row_data) = 'object' then
          jsonb_set(
            source.row_data,
            '{phone}',
            to_jsonb(private.normalize_argentina_mobile_phone(source.row_data->>'phone')),
            true
          )
        else source.row_data
      end
      order by source.ordinality
    ),
    '[]'::jsonb
  )
  into v_normalized_rows
  from jsonb_array_elements(p_rows) with ordinality as source(row_data, ordinality);

  return private.import_lead_rows_raw(p_base_type, p_file_name, v_normalized_rows);
end;
$$;

revoke all on function public.import_lead_rows(text, text, jsonb) from public, anon;
grant execute on function public.import_lead_rows(text, text, jsonb) to authenticated;

-- Backfill every ten-digit local number already introduced through the Excel importer.
create temporary table phone_import_normalization on commit drop as
select distinct
  imported.normalized_phone as old_phone,
  private.normalize_argentina_mobile_phone(imported.normalized_phone) as new_phone
from public.lead_import_rows imported
where imported.result <> 'rejected'
  and imported.normalized_phone ~ '^[0-9]{10}$';

-- Preserve the existing customer identity whenever no canonical record exists yet.
update public.customers customer
set
  normalized_phone = normalization.new_phone,
  primary_phone = normalization.new_phone,
  updated_at = now()
from phone_import_normalization normalization
where customer.normalized_phone = normalization.old_phone
  and not exists (
    select 1
    from public.customers canonical
    where canonical.normalized_phone = normalization.new_phone
  );

-- Updating the lead also runs the existing customer synchronization trigger.
update public.leads lead
set customer_phone = normalization.new_phone
from phone_import_normalization normalization
where regexp_replace(lead.customer_phone, '[^0-9]', '', 'g') = normalization.old_phone;

update public.lead_recall_items recall
set
  customer_phone = normalization.new_phone,
  updated_at = now()
from phone_import_normalization normalization
where regexp_replace(recall.customer_phone, '[^0-9]', '', 'g') = normalization.old_phone;

update public.lead_import_rows imported
set normalized_phone = normalization.new_phone
from phone_import_normalization normalization
where imported.normalized_phone = normalization.old_phone;
