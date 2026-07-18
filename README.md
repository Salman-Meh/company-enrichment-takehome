# Company Enrichment — Salman Mehmood

---

# How to run

**Prerequisites**
- Node 18+ and npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) (macOS: `brew install supabase/tap/supabase`)
- Docker running — either Docker Desktop, or [Colima](https://github.com/abiosoft/colima) on macOS (`brew install colima docker && colima start`)
- No LLM API key needed anywhere in this guide — the mock provider runs the whole pipeline for free

### 1. Start the local Supabase stack
```bash
supabase start
```
First run pulls several Docker images and can take a few minutes.

### 2. Apply the database migrations
```bash
supabase db reset
```
This creates the schema **and loads all 15 seed companies automatically** — seed loading is baked into the migrations (`supabase/migrations/0002_seed_companies.sql`), so there's no separate seed step to run.

### 3. Set up your env files
```bash
cp .env.example .env
cp web/.env.example web/.env
```
Then pull the connection values straight from Supabase and write them into both files — no manual copy-pasting:
```bash
STATUS=$(supabase status -o env)
API_URL=$(echo "$STATUS" | grep '^API_URL=' | cut -d'"' -f2)
ANON_KEY=$(echo "$STATUS" | grep '^ANON_KEY=' | cut -d'"' -f2)
SERVICE_ROLE_KEY=$(echo "$STATUS" | grep '^SERVICE_ROLE_KEY=' | cut -d'"' -f2)

sed -i.bak \
  -e "s|^SUPABASE_URL=.*|SUPABASE_URL=$API_URL|" \
  -e "s|^SUPABASE_ANON_KEY=.*|SUPABASE_ANON_KEY=$ANON_KEY|" \
  -e "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY|" \
  .env && rm .env.bak

sed -i.bak \
  -e "s|^VITE_SUPABASE_URL=.*|VITE_SUPABASE_URL=$API_URL|" \
  -e "s|^VITE_SUPABASE_ANON_KEY=.*|VITE_SUPABASE_ANON_KEY=$ANON_KEY|" \
  web/.env && rm web/.env.bak
```
`LLM_PROVIDER=mock` and blank `OPENAI_API_KEY`/`MISTRAL_API_KEY` are already correct in `.env.example` as copied — nothing else to fill in.

### 4. Serve the Edge Function
```bash
mkdir -p ~/.supabase-tmp
TMPDIR=~/.supabase-tmp/ supabase functions serve enrich --env-file ./.env
```
Leave this running in its own terminal. (The `TMPDIR` prefix points the function's temp staging at a folder under `$HOME` instead of the system default — required on Colima, since it only shares `$HOME` into its VM by default and the system temp dir lives outside it; harmless on Docker Desktop, so it's included unconditionally rather than as a conditional step.)

### 5. Run the web app
In an new terminal window: 
```bash
cd web
npm install
npm run dev
```
Open **http://localhost:5173**. You should see all 15 seed companies, every one `pending`. Click "Run" on any row to enrich it.

### Stopping everything
Ctrl-C the two running terminals (Edge Function and `npm run dev`), then `supabase stop` to shut down the local stack.

### Troubleshooting
- **Edge Function calls return `401 Auth header is not 'Bearer {token}'`:** you likely copied the `Publishable`/`Secret` keys from the CLI's default pretty output instead of the `ANON_KEY`/`SERVICE_ROLE_KEY` JWTs. Run `supabase status -o env` and use `ANON_KEY`/`SERVICE_ROLE_KEY` from that output instead — see step 1.
- **`supabase functions serve` still fails with `failed to determine entrypoint`** even with the `TMPDIR` prefix in step 4: confirm the directory actually got created (`mkdir -p ~/.supabase-tmp`) and that `TMPDIR` is set in the *same* command invocation (it's not a persistent env var — set it inline each time you run the command, as shown in step 4).
- **A container named `vector` or `analytics` fails to start:** shouldn't happen — `supabase/config.toml` ships with that container disabled (it's just a log viewer, unrelated to the app) specifically to route around a Colima docker-socket incompatibility. If you've re-enabled it and hit this, that's why.
- **IDE shows red "cannot find module" errors for `jsr:`/`npm:` imports under `supabase/functions/`:** cosmetic only — Deno resolves these fine at runtime (that's how the function runs throughout this guide). Install the [Deno VS Code extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno) and reload the window if it bothers you; not required to run anything.
- **Ports already in use (5173, or 54321-54324):** something else is already using them. Stop the other process, or run `supabase stop` first if a previous local Supabase instance is still up.

---

# Architecture overview

Three pieces, talking to each other only through Supabase's generated REST API and one Edge Function:
- **Postgres** (`supabase/migrations/`) — `companies` (raw/messy input) and `enrichment_results` (structured output), with RLS enforcing per-row isolation.
- **Edge Function `enrich`** (`supabase/functions/enrich/`) — the only thing that ever writes an enrichment: calls the LLM (mock by default), validates strictly, retries, persists.
- **Web app** (`web/src/`) — React/TS dashboard: paginated/filterable list, run/re-run action, per-company detail view.

**How one company flows through the system, start to finish:**
```
companies_seed.json
      │  loaded automatically by supabase/migrations/0002_seed_companies.sql
      ▼
public.companies   (enrichment_status = 'pending', owner_id = null)
      │
      │  listCompanies() — paginated, filtered, server-side (web/src/api/companies.ts)
      ▼
Dashboard table (web/src/components/CompaniesTable.tsx) — name / domain / status / [Run]
      │
      │  user clicks "Run" → triggerEnrich(companyId)
      ▼
POST /functions/v1/enrich  { companyId }        (supabase.functions.invoke, anon key)
      │
      ▼
Edge Function (supabase/functions/enrich/index.ts)
  1. verify the caller's JWT (Kong gateway + supabase.auth.getUser())
  2. fetch the company row — service-role client, bypasses RLS on purpose
  3. call enrichWithLLM() — mock provider by default (supabase/functions/enrich/llm.ts)
  4. validateEnrichment() strictly (zod) — retry up to 2x on failure
  5. persist:
       all attempts valid   → upsert enrichment_results, status → 'enriched'
       all attempts invalid → status → 'failed' only (old result, if any, untouched)
      │
      ▼
{ ok, companyId, enrichment }  ──────────►  web app patches that row + the detail
                                             cache in place — no page refetch
      │
      ▼
public.enrichment_results   (industry, employee_size_bucket, hq_country,
                             one_line_summary, confidence, source, model, enriched_at)
      │
      ▼
Detail panel (web/src/components/CompanyDetail.tsx) — every field + its
source/model + confidence, next to the original raw_note for comparison
```
Row Level Security sits underneath all of this: every browser-side read/write goes through Postgres' RLS policies, while the Edge Function's service-role client bypasses RLS entirely as a trusted backend process. See **RLS model** below for the isolation details.

---

# Key decisions & trade-offs

### Database
- **One row per company, not versioned** (`enrichment_results.company_id` is the primary key; a re-run upserts in place). Simpler schema and queries, and matches what the "re-run" button actually does (overwrite, not append). Versioned history was considered and rejected for the core: `TASK.md` lists a separate audit table as an optional stretch item, and with 15 seed rows there's no real volume to justify the extra "pick the latest row per company" query complexity.
- **Row-level provenance** (`source`, `model` on `enrichment_results`), not per-field. One LLM call produces every field at once today, so a single source/model pair is honest to reality — per-field columns would just be unused precision.
- **Status lives on `companies`, not `enrichment_results`.** The dashboard list needs status on every row with no join, which matters once you're paginating a 100k-row table.
- **Indexes chosen from actual query patterns, not blindly:** `(created_at desc, id)` for pagination, a plain index on `enrichment_status` for the status filter, `pg_trgm` GIN on `name` for real substring search (a plain btree only accelerates prefix matches, and the free-text filter needs `%term%`).
- **RLS: nullable `owner_id` + `owner_id = auth.uid() OR owner_id is null`.** Demonstrates genuine per-user row isolation — verified with two simulated users, each only ever saw their own rows plus unowned ones — without requiring a login flow, which `TASK.md` treats as optional. All seed data stays `owner_id = null` so the no-login dashboard keeps working. `enrichment_results` has no `owner_id` of its own — it inherits isolation via a join back to `companies`; otherwise the isolation would be pointless, since anyone could read enriched data directly from that table.
- **RLS alone wasn't enough — explicit `GRANT`s were required too.** Postgres enforces base table-level grants independently of row-level policies (`BYPASSRLS` only skips the latter). Tables created by the migration role don't get `anon`/`authenticated`/`service_role` access by default; missed this initially and caught it during verification — without it, the Edge Function's own service-role reads would have failed with "permission denied," not just the anon-role isolation.
- **Seed data loaded via a migration** (`0002_seed_companies.sql`), not a script or Studio import — reproducible and automatic on every `supabase db reset`, and `TASK.md` explicitly allows "SQL" as a valid loading method. Data is inserted verbatim, messiness included (the `"siemens"` / `"Siemens AG"` near-duplicate, inconsistent empty-string-vs-`null` domains, stray whitespace) — cleaning it wasn't part of this task, that's the enrichment step's problem.

### Edge Function
- **Mock LLM provider only, no real OpenAI/Mistral call.** `TASK.md` explicitly says this is sufficient if the focus is reliability + persistence, and it removes any dependency on an API key.
- **Validation via zod**, mirroring the existing `ENRICHMENT_JSON_SCHEMA` field-for-field. Standard, well-known tool with good ergonomics — the accepted trade-off is a second schema definition that has to be kept in sync by hand with the JSON Schema (used to describe the contract to the LLM); an `ajv` validator driven directly off that existing JSON Schema would avoid the duplication, but zod's type inference won out.
- **1 initial attempt + 2 retries (3 total), then mark `failed`.** `TASK.md` doesn't mandate a count, only the outcome (never persist unvalidated data) — this is a reasonable, easy-to-explain default. Known limitation: the mock provider is deterministic and always produces valid output, so the retry path is implemented correctly but isn't naturally exercised by the live demo (no artificial failure was injected, to avoid unrequested scope — see "What I'd do next").
- **Two sequential writes, not one atomic transaction.** `TASK.md` doesn't require atomicity, only that the result + status + source get persisted — kept simple rather than adding a Postgres RPC function for a guarantee that wasn't asked for.
- **A failed re-run never clears a previous good result.** Status flips to `failed`, but `enrichment_results` is only ever touched on a successful validation. Industry/HQ/employee-size are slow-moving facts about a real company — a bad retry reflects a pipeline hiccup, not new ground truth, so destroying a previously-good result would be worse UX than showing slightly stale (but still correct) data next to an honest "last refresh failed" status.
- **The auth check verifies the JWT for real** (`supabase.auth.getUser()`), not just that a header is present. Added on request, since Kong already verifies signatures at the gateway by default (proven: a malformed bearer token gets rejected before the function code even runs). It logs identity when a real user is present but doesn't reject the anon key, since the entire app runs without a login flow by design.

##xxw# Frontend
- **Offset/limit pagination, fixed at 10 rows/page**, via Supabase's `.range()` + `count: 'exact'`. Simplest option, and matches what `ListParams` was already stubbed for. (Keyset/cursor pagination scales better at very deep pages, but trades away "jump to page N" and adds real query complexity for a benefit that doesn't show up until you're many thousands of rows deep.)
- **Free-text filter on `name` only**, via `ILIKE`, deliberately matching the `pg_trgm` index built for it — rather than a broader multi-column search that would need more index/query surface.
- **Lean list query, separate per-company detail fetch.** The list query (run on every page load and filter keystroke) selects only what the table displays; `enrichment_results` is fetched once, on demand, when a row is actually clicked. Keeps the hot path fast at the stated 100k-row scale — embedding `enrichment_results` in the list query would carry enrichment payloads for rows that aren't even being viewed.
- **Optimistic single-row updates on run/re-run, no refetch.** The Edge Function's response is used directly to patch that row's status and the detail cache — required changing the Edge Function to return the full persisted row (not just the raw LLM output), since the frontend needs `source`/`model`/`enriched_at` too.

---

# RLS model

**The model.** `companies` has a nullable `owner_id uuid references auth.users(id)`. A row with `owner_id = null` is "unowned" (demo/seed data — every seeded row is unowned); a row with `owner_id` set belongs exclusively to that user. `enrichment_results` has no `owner_id` of its own — it inherits isolation from its parent company via a join, since that's where the actual enriched data lives.

**The policies** (`supabase/migrations/0001_init.sql`):
```sql
-- companies
create policy "companies_select_own_or_unowned" on public.companies
  for select using (owner_id = auth.uid() or owner_id is null);

create policy "companies_insert_own" on public.companies
  for insert with check (owner_id = auth.uid());

create policy "companies_update_own" on public.companies
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- enrichment_results — no owner_id of its own, inherits via join
create policy "enrichment_results_select_via_company" on public.enrichment_results
  for select using (
    exists (
      select 1 from public.companies c
      where c.id = enrichment_results.company_id
        and (c.owner_id = auth.uid() or c.owner_id is null)
    )
  );
```
A user only ever sees rows where `owner_id = auth.uid()` — plus unowned rows, which is what lets the anon-key dashboard keep working with zero login flow (a stretch goal, not required). Without the second policy, isolating `companies` alone would be pointless: anyone with the anon key could still read every company's enriched data directly from `enrichment_results`.

**One layer that's easy to miss:** RLS policies are only evaluated *after* a role clears a base table-level `GRANT` check — that's a separate, independent layer from RLS (`BYPASSRLS` only skips the row-policy layer, not this one). Tables created by the migration role don't get `anon`/`authenticated`/`service_role` access by default, so the migration also explicitly grants each role exactly what it needs (see the `GRANTS` block at the end of the file). Missing this doesn't create a security hole — it fails *closed* (everyone gets "permission denied," including the Edge Function) rather than open — but it's a real, non-obvious gotcha caught during verification, not something either layer alone tells you about.

**How the Edge Function writes around it.** It authenticates to Postgres using `SUPABASE_SERVICE_ROLE_KEY`, and `service_role` has the `BYPASSRLS` attribute — RLS is skipped entirely for that connection. This is intentional and standard practice: RLS protects direct browser/client access, while a trusted backend process (the only thing that should ever write an enrichment) needs to read and write across every company regardless of who owns it. The Edge Function is the sole place in the system with that privilege.

**How to test it** — this is a real script, run against the local DB, not a hypothetical:
```sql
-- setup: two fake users + three companies
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
insert into public.companies (name, owner_id) values
  ('Unowned Demo Co', null),
  ('User A Co', '11111111-1111-1111-1111-111111111111'),
  ('User B Co', '22222222-2222-2222-2222-222222222222');

-- simulate user A (set role + JWT claim, exactly what PostgREST does with a real session)
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select name, owner_id from public.companies order by name;
-- expect: "Unowned Demo Co" + "User A Co" only — never "User B Co"

-- simulate user B
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select name, owner_id from public.companies order by name;
-- expect: "Unowned Demo Co" + "User B Co" only — never "User A Co"

-- cleanup
reset role;
delete from public.companies where name in ('Unowned Demo Co','User A Co','User B Co');
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
```
`set role authenticated; set request.jwt.claim.sub = '<uuid>'` is exactly what PostgREST/Kong sets up internally from a real JWT — this simulation is a faithful stand-in for two actually-logged-in users, without needing to build a login flow to prove the isolation works. I ran this exact script during development: user A and user B each saw the shared unowned row plus only their own, never the other's — and repeated it for `enrichment_results` (inserting an enrichment row for User A Co, confirming User B's session got zero rows back for the identical query).

---

# LLM reliability

**Structured output is enforced by a schema, not by hoping the model behaves.** `supabase/functions/enrich/llm.ts` defines the enrichment contract once, as a zod schema:
```ts
export const EnrichmentResultSchema = z.object({
  industry: z.string(),
  employee_size_bucket: z.enum(["1-50", "51-200", "201-1000", "1001-5000", "5000+"]),
  hq_country: z.string(),
  one_line_summary: z.string().max(160),
  confidence: z.number().min(0).max(1),
}).strict();
```
`validateEnrichment()` is just `EnrichmentResultSchema.parse(raw)` — it throws on anything that doesn't conform: a missing or extra field (`.strict()` rejects unknown properties), an `employee_size_bucket` outside the fixed 5-value enum, a `confidence` outside `[0, 1]`, wrong types. There's no partial-trust path — a result either fully validates or it's treated as a failed attempt, full stop.

**On bad output: retry, never persist.** `supabase/functions/enrich/index.ts` wraps the enrich+validate call in a loop — 1 initial attempt + 2 retries (3 total). Each failed attempt is logged (`console.error`, with the attempt number and the reason) so a real failure is diagnosable, not silently swallowed. The loop only breaks early on a result that passes validation; nothing is ever written to `enrichment_results` from an attempt that didn't fully validate.

**On total failure (all 3 attempts invalid):** `companies.enrichment_status` flips to `'failed'` — and that's the *only* write that happens. `enrichment_results` is left completely untouched, so if the company had a previous good enrichment, it stays visible instead of being wiped. Industry/HQ/employee-size are slow-moving facts about a real company; a failed retry reflects a pipeline hiccup, not new ground truth, so destroying a working result would be strictly worse than showing slightly stale (but still correct) data next to an honest `failed` status. The API reflects this too — total failure returns HTTP `200` with `{ok: false, status: 'failed'}`, not a `5xx`: "the model couldn't produce valid output after retries" is a handled, expected outcome, not a server crash.

**Known limitation, stated plainly:** the mock provider (`mockEnrich` in `llm.ts`) is deterministic and always produces schema-valid output, so in the current demo the retry/failure path is implemented correctly but isn't naturally exercised — there's no "bad output" for it to react to. To actually see it fire end-to-end: temporarily set `LLM_PROVIDER=openai` (or `mistral`) in `.env` and restart the served function — both are intentionally stubbed to `throw "not implemented yet"`, so every attempt genuinely fails, all 3 tries are exhausted, and the real `failed` path runs for real (verified this during development — remember to flip it back to `mock` afterward).

---

# What I deliberately left out / would do next

## Left out (and why)
- **Real login/authentication.** The whole app runs on the anon key with no signup/session flow. The RLS model is fully built and verified (see **RLS model** → "How to test it"), but only via a SQL-level simulation of two users, not real ones — wiring real auth end-to-end is explicitly a stretch goal in `TASK.md`, not required for the core.
- **A real LLM provider (OpenAI/Mistral).** `enrichWithLLM`'s `openai`/`mistral` branches are intentionally stubbed to throw — `TASK.md` explicitly says the mock provider is sufficient if the focus is reliability + persistence. One side effect of this: the retry/fallback logic is implemented correctly but isn't naturally exercised in the live demo, since the mock is deterministic and always produces valid output — there's no genuine "bad output" for it to react to (see **LLM reliability** for how to trigger it temporarily).
- **A second, structured filter** (by status or industry) on the dashboard — stretch item, not built. Status is shown as a column but isn't filterable through the UI.
- **A separate provenance/audit table** (one row per produced field) — stretch item; used inline `source`/`model` columns on `enrichment_results` instead, since one LLM call produces every field at once today.
- **An n8n batch-orchestration workflow** — stretch item, not attempted.
- **A materialized view for a dashboard stat** — stretch item, not attempted.
- **An automated test suite.** Validation and retry logic were verified manually during development (a throwaway script fed `validateEnrichment` deliberately malformed input directly; the Edge Function was hit with real HTTP calls end-to-end) but none of that was turned into a committed, repeatable test suite.
- **Cost/latency analysis** for enriching at scale — stretch item, not written.

## A couple of gaps worth naming honestly
- **Single-owner RLS instead of a tenant/organization model.** `owner_id` ties a row to exactly one user, but a real product would need multiple employees of the same customer organization sharing access. That needs an `organizations` table plus a `user ↔ organization` membership join, with the policy checking membership instead of a literal `owner_id` match. Chose the simpler single-owner model here since `TASK.md` only asks the isolation *mechanism* to be demonstrated, not real multi-tenancy solved.
- **`companies.enrichment_status` can be set directly via the REST API**, bypassing the Edge Function entirely. `authenticated`/`anon` have `UPDATE` on their own rows (needed for the RLS policies to mean anything), but nothing currently stops a client from `PATCH`ing `enrichment_status` straight to `'enriched'` without ever calling the LLM or validating anything. Not exploited by the frontend (which only ever calls the Edge Function), but it's a real gap, not a hardened one.

## Would do next, roughly in priority order
1. **Implement a real LLM provider** — OpenAI structured outputs is the natural first pick, since the JSON schema for it already exists in `llm.ts`. Highest-leverage next step: the validation/retry/persistence scaffolding is already built around exactly this, and it would finally exercise the retry-then-fail path for real instead of by temporarily misconfiguring the mock.
2. **Wire real login** (Supabase Auth, e.g. email / magic link) and set `owner_id = auth.uid()` on companies a signed-in user creates — turns the already-built, already-tested RLS policy from "verified via simulation" into something actually exercised end-to-end by real users.
3. **Move from `owner_id` to a proper tenant/organization model** (`organizations` + membership table) once real login exists — the realistic long-term shape for shared team access, instead of single-owner rows.
4. **Close the direct-PATCH gap** — e.g. revoke column-level `UPDATE` on `enrichment_status` for `anon`/`authenticated` (or a trigger permitting that transition only via the service role), so status can only ever change through the validated Edge Function path.
5. **Add an automated test suite** — codify the manual validation/retry checks done during development into real, repeatable tests.
6. Remaining `TASK.md` stretch items not attempted: a second structured filter, a separate provenance/audit table, an n8n workflow export, a materialized view, and cost/latency notes for enriching at scale.
