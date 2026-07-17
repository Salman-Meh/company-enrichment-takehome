-- =============================================================================
-- 0001_init.sql
-- The `companies` table is provided. Everything below it is yours to design.
-- =============================================================================

create extension if not exists pgcrypto;

-- Raw, messy input rows (mirrors companies_seed.json). This part is DONE.
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  domain      text,
  raw_note    text,
  created_at  timestamptz not null default now()
  -- TODO(candidate): you will probably want an enrichment status here
  --   (e.g. 'pending' | 'enriched' | 'failed') and possibly an owner/tenant
  --   column to make RLS meaningful. Decide and add it.
);


-- TODO(candidate): ENRICHMENT RESULTS -----------------------------------------
-- Store the STRUCTURED enrichment for a company:
--   industry, employee_size_bucket, hq_country, one_line_summary, confidence (0..1)
-- Design questions to answer in the README:
--   * one row per company, or versioned / append-only?
--   * how do you record PROVENANCE (which step/source/model produced each field)?
--   * how do you represent status and failures?
--
-- create table public.enrichment_results ( ... );


-- TODO(candidate): INDEXES ----------------------------------------------------
-- Add the indexes your dashboard queries actually need — think about the columns
-- you filter, sort, and paginate on. Don't index blindly.


-- TODO(candidate): ROW LEVEL SECURITY -----------------------------------------
-- Enable RLS and add policy(ies) so a user can only see their own / their
-- tenant's rows. Remember:
--   * the Edge Function writes with the SERVICE ROLE, which BYPASSES RLS;
--   * separate SELECT / INSERT / UPDATE concerns, and use WITH CHECK on writes.
-- Explain your model in the README (and how you'd test it with two users).
--
-- alter table public.companies enable row level security;
-- create policy "..." on public.companies for select using ( ... );
