import type { Company } from "../types";

interface Props {
  rows: Company[];
  loading: boolean;
  onSelect: (company: Company) => void;
  onRun: (companyId: string) => void;
  runningIds: Set<string>;
  search: string;
  onSearchChange: (search: string) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#999",
  enriched: "#1a7f37",
  failed: "#c53030",
};

export function CompaniesTable({
  rows,
  loading,
  onSelect,
  onRun,
  runningIds,
  search,
  onSearchChange,
  page,
  pageSize,
  total,
  onPageChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <input
        type="text"
        placeholder="Filter by name…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{ padding: 8, width: "100%", maxWidth: 320, marginBottom: 12, boxSizing: "border-box" }}
      />

      {loading ? (
        <p>Loading…</p>
      ) : rows.length === 0 ? (
        <p>No companies match — load the seed or adjust your filter (see TASK.md).</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Domain</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const isRunning = runningIds.has(c.id);
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: 8, cursor: "pointer" }} onClick={() => onSelect(c)}>
                    {c.name}
                  </td>
                  <td style={{ padding: 8, cursor: "pointer" }} onClick={() => onSelect(c)}>
                    {c.domain || "—"}
                  </td>
                  <td style={{ padding: 8, color: STATUS_COLORS[c.enrichment_status] ?? "#999" }}>
                    {c.enrichment_status}
                  </td>
                  <td style={{ padding: 8 }}>
                    <button
                      onClick={() => onRun(c.id)}
                      disabled={isRunning}
                      style={{ cursor: isRunning ? "default" : "pointer" }}
                    >
                      {isRunning ? "Running…" : c.enrichment_status === "pending" ? "Run" : "Re-run"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Previous
        </button>
        <span style={{ color: "#666" }}>
          Page {page} of {totalPages} ({total} total)
        </span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Next
        </button>
      </div>
    </div>
  );
}
