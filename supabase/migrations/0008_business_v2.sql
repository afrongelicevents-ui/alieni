-- Alieni business side v2: fixed monthly fee per unit (listing / room /
-- location / site), billed in arrears at month end by SEPA direct debit.
-- Replaces the per-post model. Purely additive: nothing is dropped.

create type business_type as enum ('airbnb', 'hotel', 'restaurant', 'office', 'school');
create type billing_status as enum ('upcoming', 'invoiced', 'paid', 'failed', 'reversed');

-- ========== business profile extensions ==========
alter table business_profiles
  add column business_type business_type,
  add column contact_first_name text,
  add column contact_last_name text,
  add column unit_count integer not null default 1 check (unit_count between 1 and 10000),
  -- price per unit locked at subscription start (price changes apply to new
  -- subscriptions only, brief §2)
  add column unit_price_cents integer,
  add column billing_started_at timestamptz,
  add column billing_paused_at timestamptz,
  add column billing_ended_at timestamptz,
  add column mollie_customer_id text,
  add column mollie_mandate_id text;

-- ========== business units (listings / rooms / locations / sites) ==========
-- Company premises: business data, needed for matching nearby cleaners.
create table business_units (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  address_line text not null check (char_length(address_line) <= 200),
  postcode text not null check (postcode ~ '^[1-9][0-9]{3} [A-Z]{2}$'),
  city text not null,
  location geography(point, 4326),
  ical_url text, -- phase M4: calendar sync
  created_at timestamptz not null default now()
);
create index business_units_business_idx on business_units (business_id);
create index business_units_location_idx on business_units using gist (location);

-- ========== month-end billing periods ==========
create table business_billing_periods (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profiles (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  unit_count integer not null,
  unit_price_cents integer not null,
  billable_days integer not null, -- pro-rated in the first month
  net_cents integer not null,
  btw_cents integer not null,
  gross_cents integer not null check (gross_cents = net_cents + btw_cents),
  status billing_status not null default 'upcoming',
  invoice_id uuid references invoices (id),
  mollie_payment_id text unique,
  created_at timestamptz not null default now(),
  unique (business_id, period_start)
);

-- invoices can now belong to a business as well as a household
alter table invoices
  alter column household_id drop not null,
  add column business_id uuid references business_profiles (id),
  add constraint invoices_owner_check check (household_id is not null or business_id is not null);

-- ========== jobs: free to post, linked to a unit ==========
alter table jobs
  alter column status set default 'published',
  add column unit_id uuid references business_units (id) on delete set null,
  drop constraint jobs_frequency_check,
  add constraint jobs_frequency_check
    check (frequency in ('once', 'daily', 'weekly', 'biweekly', 'monthly', 'per_checkout'));

-- ========== settings ==========
update settings set value = '{"model": "per_unit_monthly", "billing": "month_end_direct_debit"}'
  where key = 'business_pricing';
insert into settings (key, value) values
  ('business_unit_prices_cents', '{"airbnb": 1500, "hotel": 300, "restaurant": 4900, "office": 4900, "school": 9900}'),
  ('emergency_fee_cents', '{"household_incl_btw": 995, "business_excl_btw": 1495}'),
  ('linen_addon', '{"enabled": false, "price_per_unit_cents": 400}'),
  ('vog_max_age_months', '12');

-- ========== row-level security ==========
alter table business_units enable row level security;
alter table business_billing_periods enable row level security;

create policy "business manages own units" on business_units for all
  using (exists (select 1 from business_profiles bp where bp.id = business_id and bp.user_id = auth.uid()))
  with check (exists (select 1 from business_profiles bp where bp.id = business_id and bp.user_id = auth.uid()));
create policy "admin reads units" on business_units for select using (is_admin());

-- billing periods: business reads own; written only by the server (service role)
create policy "business reads own billing" on business_billing_periods for select
  using (exists (select 1 from business_profiles bp where bp.id = business_id and bp.user_id = auth.uid()) or is_admin());

-- business reads own invoices
create policy "business reads own invoices" on invoices for select
  using (exists (select 1 from business_profiles bp where bp.id = business_id and bp.user_id = auth.uid()));
