// =============================================================================
// LLM enrichment: the contract is defined, and a MOCK provider is implemented so
// you can build and run the whole pipeline with no API key.
// Implementing the real OpenAI/Mistral call is welcome but optional — what we
// really want to see is reliable, validated, structured output.
// =============================================================================
import { z } from "npm:zod@3";

export type EmployeeSizeBucket =
  | "1-50" | "51-200" | "201-1000" | "1001-5000" | "5000+";

// Single source of truth for the structured shape every enrichment must
// conform to. Mirrors ENRICHMENT_JSON_SCHEMA below field-for-field; the two
// aren't derived from one another (JSON Schema is handed to LLM APIs, zod
// validates the response), so keep them in sync by hand if either changes.
export const EnrichmentResultSchema = z.object({
  industry: z.string(),
  employee_size_bucket: z.enum(["1-50", "51-200", "201-1000", "1001-5000", "5000+"]),
  hq_country: z.string(),
  one_line_summary: z.string().max(160),
  confidence: z.number().min(0).max(1),
}).strict();

export type EnrichmentResult = z.infer<typeof EnrichmentResultSchema>;

export interface CompanyInput {
  id: string;
  name: string;
  domain: string | null;
  raw_note: string | null;
}

// Hand this to OpenAI/Mistral structured-output / function-calling APIs.
export const ENRICHMENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["industry", "employee_size_bucket", "hq_country", "one_line_summary", "confidence"],
  properties: {
    industry: { type: "string" },
    employee_size_bucket: { type: "string", enum: ["1-50", "51-200", "201-1000", "1001-5000", "5000+"] },
    hq_country: { type: "string" },
    one_line_summary: { type: "string", maxLength: 160 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

const PROVIDER = Deno.env.get("LLM_PROVIDER") ?? "mock";

export async function enrichWithLLM(company: CompanyInput): Promise<unknown> {
  switch (PROVIDER) {
    case "openai":
      // TODO(candidate): real OpenAI call using structured outputs +
      // ENRICHMENT_JSON_SCHEMA. Read the key from OPENAI_API_KEY.
      throw new Error("LLM_PROVIDER=openai not implemented yet");
    case "mistral":
      // TODO(candidate): real Mistral call using structured outputs.
      throw new Error("LLM_PROVIDER=mistral not implemented yet");
    case "mock":
    default:
      return mockEnrich(company);
  }
}

// Deterministic, plausible output so the pipeline runs end-to-end without a key.
function mockEnrich(company: CompanyInput): EnrichmentResult {
  const note = (company.raw_note ?? "").toLowerCase();

  const bucket: EmployeeSizeBucket =
    note.includes("300k") || note.includes("very large") ? "5000+"
    : note.includes("5000") ? "1001-5000"
    : note.includes("few thousand") ? "201-1000"
    : "51-200";

  const industry =
    note.includes("bank") || note.includes("fintech") ? "Financial Services"
    : note.includes("fashion") || note.includes("retail") || note.includes("e-commerce") ? "Retail / E-commerce"
    : note.includes("software") || note.includes("ai") || note.includes("mining") ? "Software"
    : note.includes("logistics") ? "Logistics"
    : note.includes("biotech") || note.includes("mrna") ? "Biotech"
    : "Unknown";

  return {
    industry,
    employee_size_bucket: bucket,
    hq_country: "Germany",
    one_line_summary: `${company.name.trim()} — ${company.raw_note ?? "no description provided"}`.slice(0, 160),
    confidence: 0.5,
  };
}

// The line of defense that keeps bad model output out of the database: every
// required field, enum membership, and the confidence range are checked.
// Throws (ZodError) on anything that doesn't conform — callers rely on this
// to trigger a retry rather than ever persisting the result.
export function validateEnrichment(raw: unknown): EnrichmentResult {
  return EnrichmentResultSchema.parse(raw);
}
