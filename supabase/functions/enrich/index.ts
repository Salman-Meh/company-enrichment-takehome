// =============================================================================
// Edge Function: enrich
// The request/response plumbing, CORS, and an auth seam are wired up.
// The three things we care about are left for you (see TODOs):
//   1) strict validation of the LLM output
//   2) retry / fallback when the model misbehaves
//   3) persisting the result + status + provenance to your tables
// =============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { enrichWithLLM, validateEnrichment } from "./llm.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth ----------------------------------------------------------------
    // TODO(candidate): decide what "authenticated" means here. The simplest
    // version checks the Authorization header / verifies the Supabase JWT.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const { companyId } = await req.json().catch(() => ({}));
    if (!companyId) return json({ error: "companyId is required" }, 400);

    // Service-role client: BYPASSES RLS on purpose (trusted server-side writes).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: company, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();
    if (error || !company) return json({ error: "Company not found" }, 404);

    // --- Enrich --------------------------------------------------------------
    // TODO(candidate): make this reliable.
    //   1) Get STRUCTURED output from the LLM (see llm.ts).
    //   2) VALIDATE it (harden validateEnrichment()).
    //   3) On invalid/failed output, RETRY with a tightened prompt and/or a
    //      FALLBACK model; if it still fails, mark the company 'failed'.
    //      Never write unvalidated data.
    const raw = await enrichWithLLM(company);
    const enrichment = validateEnrichment(raw);

    // --- Persist -------------------------------------------------------------
    // TODO(candidate): write the enrichment + status + provenance to the tables
    // you design in supabase/migrations. Return the persisted row.

    return json({ ok: true, companyId, enrichment });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
