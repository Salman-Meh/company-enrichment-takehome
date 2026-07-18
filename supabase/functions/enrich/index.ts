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
import { enrichWithLLM, validateEnrichment, type EnrichmentResult } from "./llm.ts";

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

    // --- Enrich ----------------------------------------------------------------
    // 1 initial attempt + up to MAX_RETRIES retries. Never persist unvalidated
    // data: only a result that passes EnrichmentResultSchema ever reaches the
    // tables below.
    const MAX_RETRIES = 2; // 1 initial attempt + 2 retries = 3 total attempts
    let enrichment: EnrichmentResult | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const raw = await enrichWithLLM(company);
        enrichment = validateEnrichment(raw);
        break;
      } catch (e) {
        console.error(`enrich attempt ${attempt + 1}/${MAX_RETRIES + 1} failed for company ${companyId}:`, e);
        // retry unless this was the last attempt; final failure falls through
        // to the failed-path below
      }
    }

    // --- Persist -----------------------------------------------------------------
    // Success: upsert the result (one row per company) and mark 'enriched'.
    // Total failure: mark 'failed' only. Never touch enrichment_results here —
    // a previous good result (if any) is last-known-good and stays visible;
    // a bad retry reflects a pipeline hiccup, not new ground truth about the
    // company.
    if (enrichment) {
      const { data: persisted, error: upsertError } = await supabase
        .from("enrichment_results")
        .upsert({
          company_id: companyId,
          ...enrichment,
          source: "mock",
          model: "mock-v1",
          enriched_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (upsertError) return json({ error: upsertError.message }, 500);

      const { error: statusError } = await supabase
        .from("companies")
        .update({ enrichment_status: "enriched" })
        .eq("id", companyId);
      if (statusError) return json({ error: statusError.message }, 500);

      // Return the full persisted row (not just the raw LLM output) so
      // callers can use it directly without a follow-up fetch.
      return json({ ok: true, companyId, enrichment: persisted });
    }

    const { error: failedStatusError } = await supabase
      .from("companies")
      .update({ enrichment_status: "failed" })
      .eq("id", companyId);
    if (failedStatusError) return json({ error: failedStatusError.message }, 500);

    return json({ ok: false, companyId, status: "failed" });
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
