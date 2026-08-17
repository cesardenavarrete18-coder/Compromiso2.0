-- Keep plan pricing semantically explicit: bonuses never alter this value.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaigns'
      and column_name = 'list_price'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaigns'
      and column_name = 'final_price'
  ) then
    alter table public.campaigns rename column list_price to final_price;
  end if;
end
$$;

alter table public.campaigns
  drop constraint if exists campaigns_list_price_nonnegative;

alter table public.campaigns
  drop constraint if exists campaigns_final_price_nonnegative;

alter table public.campaigns
  add constraint campaigns_final_price_nonnegative
  check (final_price is null or final_price >= 0);
