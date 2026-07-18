import { useEffect, useState } from "react";
import { getEnrichment, listCompanies, triggerEnrich } from "./api/companies";
import type { Company, EnrichmentResult } from "./types";
import { CompaniesTable } from "./components/CompaniesTable";
import { CompanyDetail } from "./components/CompanyDetail";

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

export default function App() {
  const [rows, setRows] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<Company | null>(null);
  const [enrichmentCache, setEnrichmentCache] = useState<Record<string, EnrichmentResult | null>>({});
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

  // Debounce the free-text filter so we don't refetch on every keystroke;
  // any actual change in the filter resets pagination back to page 1.
  // Guards on search === debouncedSearch (not a "did this just mount" flag)
  // so it's a no-op on mount *and* safe under StrictMode's dev-only double
  // effect invocation — both invocations see them still equal and skip,
  // rather than a ref-flag getting consumed by the first synthetic pass.
  useEffect(() => {
    if (search === debouncedSearch) return;
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search, debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    listCompanies({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined })
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch]);

  function handleSelect(company: Company) {
    setSelected(company);
    if (!(company.id in enrichmentCache)) {
      getEnrichment(company.id)
        .then((result) => setEnrichmentCache((prev) => ({ ...prev, [company.id]: result })))
        .catch((e) => console.error(e));
    }
  }

  function handleRun(companyId: string) {
    setRunningIds((prev) => new Set(prev).add(companyId));
    triggerEnrich(companyId)
      .then(({ status, enrichment }) => {
        setRows((prev) => prev.map((r) => (r.id === companyId ? { ...r, enrichment_status: status } : r)));
        setSelected((prev) => (prev && prev.id === companyId ? { ...prev, enrichment_status: status } : prev));
        // Only overwrite the cached enrichment on success — a failed run
        // never clears a previously-good result (mirrors the backend's
        // last-known-good behavior).
        if (status === "enriched") {
          setEnrichmentCache((prev) => ({ ...prev, [companyId]: enrichment }));
        }
      })
      .catch((e) => console.error(e))
      .finally(() => {
        setRunningIds((prev) => {
          const next = new Set(prev);
          next.delete(companyId);
          return next;
        });
      });
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 4 }}>Company Enrichment</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Take-home starter — see <code>TASK.md</code>. Most of this is yours to build.
      </p>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: 2, minWidth: 0 }}>
          <CompaniesTable
            rows={rows}
            loading={loading}
            onSelect={handleSelect}
            onRun={handleRun}
            runningIds={runningIds}
            search={search}
            onSearchChange={setSearch}
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <CompanyDetail
            company={selected}
            enrichment={selected ? enrichmentCache[selected.id] : undefined}
            onRun={handleRun}
            isRunning={selected ? runningIds.has(selected.id) : false}
          />
        </div>
      </div>
    </main>
  );
}
