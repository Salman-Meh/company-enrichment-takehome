import type { Company } from "../types";

interface Props {
  rows: Company[];
  loading: boolean;
  onSelect: (company: Company) => void;
  // TODO(candidate): add pagination + filter props/state and a re-enrich handler.
}

// TODO(candidate): turn this into the real dashboard table.
//   - server-side pagination controls (page / pageSize)
//   - a free-text filter + at least one structured filter (status / industry)
//   - an enrichment status column
//   - a "Run / re-run enrichment" action per row
//   - keep it responsive assuming ~100k rows (this minimal version does not)
export function CompaniesTable({ rows, loading, onSelect }: Props) {
  if (loading) return <p>Loading…</p>;
  if (rows.length === 0) return <p>No companies yet — load the seed (see TASK.md).</p>;

  return (
    <table style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
          <th style={{ padding: 8 }}>Name</th>
          <th style={{ padding: 8 }}>Domain</th>
          <th style={{ padding: 8 }}>Status{/* TODO */}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr
            key={c.id}
            onClick={() => onSelect(c)}
            style={{ cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
          >
            <td style={{ padding: 8 }}>{c.name}</td>
            <td style={{ padding: 8 }}>{c.domain ?? "—"}</td>
            <td style={{ padding: 8, color: "#999" }}>{/* TODO: status */}—</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
