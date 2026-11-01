-- Alieni phase 4: payments, invoices (sequential numbering, btw breakdown).

create type payment_type as enum ('verification', 'subscription');
create type payment_status as enum ('open', 'pending', 'paid', 'failed', 'canceled', 'expired', 'refunded');

-- Mollie customer + mandate live on the household profile
alter table profiles
  add column mollie_customer_id text,
  add column mollie_mandate_id text;

-- ========== payments ==========
create table payments (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references connections (id) on delete set null,
  household_id uuid not null references profiles (id),
  mollie_payment_id text not null unique, -- unique => idempotent webhook upserts
  type payment_type not null,
  status payment_status not null default 'open',
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payments_connection_idx on payments (connection_id);

-- ========== invoices (brief §6: sequential numbers, btw breakdown) ==========
create sequence invoice_seq;

create or replace function next_invoice_number() returns text
language sql volatile security definer set search_path = public as $$
  select 'ALI-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_seq')::text, 4, '0');
$$;

create table invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default next_invoice_number(),
  household_id uuid not null references profiles (id),
  connection_id uuid references connections (id) on delete set null,
  payment_id uuid references payments (id) on delete set null,
  net_cents integer not null,
  btw_cents integer not null,
  gross_cents integer not null check (gross_cents = net_cents + btw_cents),
  issued_at timestamptz not null default now()
);
create index invoices_household_idx on invoices (household_id);

-- ========== row-level security ==========
alter table payments enable row level security;
alter table invoices enable row level security;

-- Households read their own payments and invoices; admin reads all.
-- There are NO insert/update policies for authenticated users: payments and
-- invoices are written exclusively by the server (service role) from
-- verified Mollie webhooks — never from client-side state (brief §7).
create policy "household reads own payments" on payments for select
  using (household_id = auth.uid() or is_admin());
create policy "household reads own invoices" on invoices for select
  using (household_id = auth.uid() or is_admin());
