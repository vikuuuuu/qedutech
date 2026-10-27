// src/pages/Audit.jsx
import { useMemo } from "react";
import { useList } from "../lib/db";
import { fmtDateTime } from "../lib/utils";
import { Badge, Card, PageHeader } from "../components/ui";
import DataTable from "../components/DataTable";

export default function Audit() {
  const { items, loading } = useList("audit", { limit: 300 });
  const rows = useMemo(() => [...items].reverse(), [items]);
  return (
    <>
      <PageHeader title="Audit log" subtitle="The latest 300 administrative actions." />
      <Card flush>
        <DataTable loading={loading} rows={rows} searchKeys={["name", "action", "target"]} pageSize={25} columns={[
          { key: "at", label: "When", render: (r) => fmtDateTime(r.at) },
          { key: "name", label: "User", render: (r) => <>{r.name} <Badge>{r.role}</Badge></> },
          { key: "action", label: "Action", render: (r) => <code>{r.action}</code> },
          { key: "target", label: "Details" },
        ]} />
      </Card>
    </>
  );
}
