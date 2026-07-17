import type { Company } from "../types";

interface Props {
  company: Company | null;
}

// TODO(candidate): show the enrichment for the selected company — each field
// (industry, employee_size_bucket, hq_country, one_line_summary, confidence)
// with its source / provenance and the confidence score.
export function CompanyDetail({ company }: Props) {
  if (!company) {
    return (
      <aside style={{ color: "#666" }}>
        <p>Select a company to see its details.</p>
      </aside>
    );
  }

  return (
    <aside style={{ borderLeft: "1px solid #eee", paddingLeft: 16 }}>
      <h2 style={{ marginTop: 0 }}>{company.name.trim()}</h2>
      <p style={{ color: "#666" }}>{company.raw_note ?? "No note"}</p>
      {/* TODO: render the enriched fields + source + confidence here. */}
    </aside>
  );
}
