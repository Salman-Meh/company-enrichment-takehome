import { supabase } from "../lib/supabase";
import type { Company } from "../types";

export interface ListParams {
  page: number; // 1-based
  pageSize: number;
  search?: string;
  // TODO(candidate): add structured filters (e.g. status, industry).
}

export interface ListResult {
  rows: Company[];
  total: number;
}

// TODO(candidate): implement SERVER-SIDE pagination + filtering.
// The naive version below fetches the whole table and ignores `params` —
// that won't scale to ~100k rows. Fix it.
export async function listCompanies(_params: ListParams): Promise<ListResult> {
  const { data, error } = await supabase.from("companies").select("*");
  if (error) throw error;
  const rows = (data ?? []) as Company[];
  return { rows, total: rows.length };
}

// TODO(candidate): invoke your `enrich` Edge Function for this company,
// then refresh the row so the new status/result shows in the UI.
export async function triggerEnrich(_companyId: string): Promise<void> {
  throw new Error("TODO(candidate): implement triggerEnrich");
}
