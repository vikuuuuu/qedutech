// src/components/DataTable.jsx
import { memo, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Empty, SearchBox, Spinner } from "./ui";
import { cx } from "../lib/utils";

/**
 * Client-side table with search, sort and pagination.
 * columns: [{ key, label, render?(row), sortValue?(row), width?, align?, hide? }]
 */
function DataTableImpl({ columns, rows, loading, searchKeys, pageSize = 20, toolbar, empty, onRowClick, initialSort }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(initialSort || { key: null, dir: "asc" });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !searchKeys?.length) return rows;
    return rows.filter((r) => searchKeys.some((k) => String(typeof k === "function" ? k(r) : r[k] ?? "").toLowerCase().includes(needle)));
  }, [rows, q, searchKeys]);

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    const val = (r) => (col?.sortValue ? col.sortValue(r) : r[sort.key]) ?? "";
    const out = [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
    });
    return sort.dir === "desc" ? out.reverse() : out;
  }, [filtered, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = sorted.slice(cur * pageSize, cur * pageSize + pageSize);

  const toggle = (c) => {
    if (c.sortable === false) return;
    setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: "asc" }));
  };

  return (
    <div className="table-wrap">
      {(searchKeys?.length || toolbar) && (
        <div className="table-toolbar">
          {searchKeys?.length ? <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} /> : <span />}
          <div className="row gap-sm wrap">{toolbar}</div>
        </div>
      )}
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ width: c.width, textAlign: c.align }} onClick={() => toggle(c)} className={cx(c.sortable !== false && "sortable")}>
                  <span className="th-inner">
                    {c.label}
                    {sort.key === c.key && (sort.dir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="center pad"><Spinner /></td></tr>
            ) : slice.length === 0 ? (
              <tr><td colSpan={columns.length}>{empty || <Empty title="No records found" hint={q ? "Try a different search." : undefined} />}</td></tr>
            ) : (
              slice.map((r) => (
                <tr key={r.id ?? JSON.stringify(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx(onRowClick && "clickable")}>
                  {columns.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align }}>{c.render ? c.render(r) : r[c.key] ?? "—"}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > pageSize && (
        <div className="pager">
          <span className="muted small">{cur * pageSize + 1}–{Math.min(sorted.length, (cur + 1) * pageSize)} of {sorted.length}</span>
          <div className="row gap-sm">
            <button className="icon-btn" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
            <span className="small">{cur + 1} / {pages}</span>
            <button className="icon-btn" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
export default memo(DataTableImpl);
