import type { Company, EnrichmentResult } from "../types";

interface Props {
  company: Company | null;
  enrichment: EnrichmentResult | null | undefined; // undefined = loading, null = not yet enriched
  onRun: (companyId: string) => void;
  isRunning: boolean;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase" }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

export function CompanyDetail({ company, enrichment, onRun, isRunning }: Props) {
  if (!company) {
    return (
      <aside style={{ color: "#666" }}>
        <p>Select a company to see its details.</p>
      </aside>
    );
  }

  return (
    <aside style={{ borderLeft: "1px solid #eee", paddingLeft: 16 }}>
      <h2 style={{ marginTop: 0, marginBottom: 4 }}>{company.name.trim()}</h2>
      <p style={{ color: "#666", marginTop: 0 }}>{company.raw_note ?? "No note"}</p>

      <button onClick={() => onRun(company.id)} disabled={isRunning} style={{ marginBottom: 16 }}>
        {isRunning ? "Running…" : company.enrichment_status === "pending" ? "Run enrichment" : "Re-run enrichment"}
      </button>

      {enrichment === undefined && <p style={{ color: "#666" }}>Loading enrichment…</p>}

      {enrichment === null && company.enrichment_status === "failed" && (
        <p style={{ color: "#c53030" }}>Last enrichment attempt failed. No result yet.</p>
      )}
      {enrichment === null && company.enrichment_status === "pending" && (
        <p style={{ color: "#666" }}>Not yet enriched.</p>
      )}

      {enrichment && (
        <div>
          {company.enrichment_status === "failed" && (
            <p style={{ color: "#c53030", fontSize: 13 }}>
              Last refresh failed — showing the previous result below.
            </p>
          )}
          <Field label="Industry" value={enrichment.industry} />
          <Field label="Employee size" value={enrichment.employee_size_bucket} />
          <Field label="HQ country" value={enrichment.hq_country} />
          <Field label="Summary" value={enrichment.one_line_summary} />
          <Field label="Confidence" value={enrichment.confidence.toFixed(2)} />
          <Field label="Source / model" value={`${enrichment.source} / ${enrichment.model}`} />
          <Field label="Enriched at" value={new Date(enrichment.enriched_at).toLocaleString()} />
        </div>
      )}
    </aside>
  );
}
