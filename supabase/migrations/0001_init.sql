-- =============================================================================
-- 0001_init.sql
-- The `companies` table is provided. Everything below it is yours to design.
-- =============================================================================

create extension if not exists pgcrypto;

-- Raw, messy input rows (mirrors companies_seed.json). This part is DONE.
create table if not exists public.companies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  domain             text,
  raw_note           text,
  created_at         timestamptz not null default now(),
  -- Design decisions (see README for full rationale):
  --   * status lives here (not on enrichment_results) so the dashboard list can
  --     read it with no join at ~100k rows.
  --   * owner_id is nullable: seed/demo rows stay unowned (visible to everyone)
  --     since real auth is a stretch goal, not required for the core.
  enrichment_status  text not null default 'pending'
                       check (enrichment_status in ('pending', 'enriched', 'failed')),
  owner_id           uuid references auth.users(id)
);


-- ENRICHMENT RESULTS -----------------------------------------------------------
-- One row per company (company_id is the PK): a re-run UPSERTs in place rather
-- than versioning history. Provenance is row-level (source/model) rather than
-- per-field, since one LLM call produces the whole structured result at once.
create table public.enrichment_results (
  company_id            uuid primary key references public.companies(id) on delete cascade,
  industry              text,
  employee_size_bucket  text check (employee_size_bucket in ('1-50', '51-200', '201-1000', '1001-5000', '5000+')),
  hq_country            text,
  one_line_summary      text,
  confidence            numeric(3, 2) check (confidence >= 0 and confidence <= 1),
  source                text,
  model                 text,
  enriched_at           timestamptz,
  updated_at            timestamptz not null default now()
);


-- INDEXES ------------------------------------------------------------------
-- Pagination (default sort: newest first), the status filter, and the RLS
-- owner check all hit companies on every dashboard query.
create index companies_created_at_id_idx on public.companies (created_at desc, id);
create index companies_enrichment_status_idx on public.companies (enrichment_status);
create index companies_owner_id_idx on public.companies (owner_id);

-- Free-text filter: pg_trgm gives real substring ILIKE performance at 100k
-- rows (a plain btree only accelerates prefix matches).
create extension if not exists pg_trgm;
create index companies_name_trgm_idx on public.companies using gin (name gin_trgm_ops);
-- enrichment_results.company_id needs no extra index — it's already the PK.


-- ROW LEVEL SECURITY -----------------------------------------------------------
-- Model: each row optionally belongs to an owner (auth.uid()). Unowned rows
-- (owner_id is null — this is where the seed data lives) are visible to
-- everyone, so the anon-key dashboard keeps working without real auth wired.
-- The Edge Function writes via the SERVICE ROLE, which bypasses RLS entirely.
alter table public.companies enable row level security;

create policy "companies_select_own_or_unowned" on public.companies
  for select using (owner_id = auth.uid() or owner_id is null);

create policy "companies_insert_own" on public.companies
  for insert with check (owner_id = auth.uid());

create policy "companies_update_own" on public.companies
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- enrichment_results has no owner_id of its own — it inherits isolation from
-- its parent company. Without this, the isolation above would be pointless:
-- anyone with the anon key could still read every company's enriched data
-- directly from this table. Only SELECT is needed; only the service role
-- (which bypasses RLS) ever writes here.
alter table public.enrichment_results enable row level security;

create policy "enrichment_results_select_via_company" on public.enrichment_results
  for select using (
    exists (
      select 1 from public.companies c
      where c.id = enrichment_results.company_id
        and (c.owner_id = auth.uid() or c.owner_id is null)
    )
  );


-- GRANTS ------------------------------------------------------------------
-- RLS policies are only evaluated *after* a role clears the base table-level
-- grant check — BYPASSRLS (service_role) skips row policies, not this layer.
-- Tables created by the `postgres` migration role don't inherit anon/
-- authenticated/service_role access by default, so it must be granted
-- explicitly or every query from the API (including the service-role Edge
-- Function) gets "permission denied" regardless of RLS.
grant select, insert, update, delete on public.companies to service_role;
grant select on public.companies to anon;
grant select, insert, update on public.companies to authenticated;

grant select, insert, update, delete on public.enrichment_results to service_role;
grant select on public.enrichment_results to anon, authenticated;
