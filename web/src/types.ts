export type EnrichmentStatus = "pending" | "enriched" | "failed";

// The raw company row (matches the provided migration + seed).
export interface Company {
  id: string;
  name: string;
  domain: string | null;
  raw_note: string | null;
  created_at: string;
  // TODO(candidate): add the fields you introduce (e.g. status, or a joined
  // enrichment object) as you design your schema.
}

// TODO(candidate): a type for the structured enrichment result.
// Keep it in sync with the contract in supabase/functions/enrich/llm.ts.
export interface EnrichmentResult {
  industry: string;
  employee_size_bucket: string;
  hq_country: string;
  one_line_summary: string;
  confidence: number;
  // ...plus whatever provenance/source fields you decide to surface.
}
