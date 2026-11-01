-- Business v2 (M2): month-end billing start on first deal, pending unit
-- counts (apply next month), paused connections on SEPA failure/reversal.
-- Purely additive.

-- A paused connection (failed or reversed direct debit) hides contact
-- details again automatically: has_active_connection() only matches
-- 'active', so the masking trigger re-masks new messages.
alter type connection_status add value if not exists 'paused';

alter table business_profiles
  add column pending_unit_count integer check (pending_unit_count between 1 and 10000),
  add column payment_failed_at timestamptz;

-- Business billing starts when the business confirms its first deal.
-- The unit price is locked from settings at that moment (price changes
-- apply to new subscriptions only).
create or replace function start_business_billing() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  bp business_profiles;
  prices jsonb;
begin
  if new.household_confirmed_at is not null and new.cleaner_confirmed_at is not null
     and (old.household_confirmed_at is null or old.cleaner_confirmed_at is null) then
    select * into bp from business_profiles where user_id = new.household_id;
    if found and bp.billing_started_at is null and bp.business_type is not null then
      select value into prices from settings where key = 'business_unit_prices_cents';
      update business_profiles
        set billing_started_at = now(),
            unit_price_cents = coalesce((prices ->> bp.business_type::text)::integer, unit_price_cents)
        where id = bp.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger connections_start_business_billing
  after update on connections
  for each row execute function start_business_billing();

-- Server-side helper for the month-end cron: businesses due for billing.
create or replace function businesses_due_for_billing()
returns table (business_id uuid, user_id uuid, business_type business_type, unit_count integer,
               unit_price_cents integer, billing_started_at timestamptz, mollie_customer_id text, company_name text)
language sql stable security definer set search_path = public as $$
  select id, user_id, business_type, unit_count, unit_price_cents, billing_started_at, mollie_customer_id, company_name
  from business_profiles
  where billing_started_at is not null
    and billing_paused_at is null
    and (billing_ended_at is null or billing_ended_at > date_trunc('month', now()))
    and mollie_customer_id is not null;
$$;
