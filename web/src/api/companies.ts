import { supabase } from "../lib/supabase";
import type { Company, EnrichmentResult, EnrichmentStatus } from "../types";

export interface ListParams {
  page: number; // 1-based
  pageSize: number;
  search?: string;
}

export interface ListResult {
  rows: Company[];
  total: number;
}

// Server-side pagination + free-text filter on `name` (backed by the
// pg_trgm index — see supabase/migrations/0001_init.sql). Only the columns
// the table actually renders are selected; enrichment_results is fetched
// separately per-company on demand (see getEnrichment) so this hot path
// (runs on every page load / filter keystroke) stays cheap at ~100k rows.
export async function listCompanies({ page, pageSize, search }: ListParams): Promise<ListResult> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("companies")
    .select("id,name,domain,raw_note,created_at,enrichment_status", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as Company[], total: count ?? 0 };
}

// Detail-view fetch: the one enrichment_results row for a single company.
// Returns null if the company hasn't been (successfully) enriched yet.
export async function getEnrichment(companyId: string): Promise<EnrichmentResult | null> {
  const { data, error } = await supabase
    .from("enrichment_results")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return data as EnrichmentResult | null;
}

export interface TriggerEnrichResult {
  companyId: string;
  status: EnrichmentStatus;
  enrichment: EnrichmentResult | null;
}

// Invokes the `enrich` Edge Function and returns exactly what changed, so the
// caller can patch its local state optimistically instead of refetching.
export async function triggerEnrich(companyId: string, status: string): Promise<TriggerEnrichResult> {
  if (status == "pending") throw "Status enrichment is pending, please wait."
  const { data, error } = await supabase.functions.invoke("enrich", {
    body: { companyId },
  });
  if (error) throw error;

  if (data.ok) {
    return { companyId, status: "enriched", enrichment: data.enrichment as EnrichmentResult };
  }
  return { companyId, status: "failed", enrichment: null };
}
