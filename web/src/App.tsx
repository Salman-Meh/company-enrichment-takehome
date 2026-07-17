import { useEffect, useState } from "react";
import { listCompanies } from "./api/companies";
import type { Company } from "./types";
import { CompaniesTable } from "./components/CompaniesTable";
import { CompanyDetail } from "./components/CompanyDetail";

export default function App() {
  const [rows, setRows] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Company | null>(null);

  useEffect(() => {
    // TODO(candidate): wire pagination + filter state into this call.
    listCompanies({ page: 1, pageSize: 25 })
      .then((res) => setRows(res.rows))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>Company Enrichment</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Take-home starter — see <code>TASK.md</code>. Most of this is yours to build.
      </p>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: 2, minWidth: 0 }}>
          <CompaniesTable rows={rows} loading={loading} onSelect={setSelected} />
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <CompanyDetail company={selected} />
        </div>
      </div>
    </main>
  );
}
