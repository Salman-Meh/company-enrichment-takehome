export type EnrichmentStatus = "pending" | "enriched" | "failed";

export type EmployeeSizeBucket =
  | "1-50" | "51-200" | "201-1000" | "1001-5000" | "5000+";

// The raw company row (matches supabase/migrations/0001_init.sql).
export interface Company {
  id: string;
  name: string;
  domain: string | null;
  raw_note: string | null;
  created_at: string;
  enrichment_status: EnrichmentStatus;
}

// Kept in sync by hand with the contract in supabase/functions/enrich/llm.ts
// and the enrichment_results table.
export interface EnrichmentResult {
  company_id: string;
  industry: string;
  employee_size_bucket: EmployeeSizeBucket;
  hq_country: string;
  one_line_summary: string;
  confidence: number;
  source: string;
  model: string;
  enriched_at: string;
}
