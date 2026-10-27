// src/components/CrudPage.jsx
import { useMemo, useState } from "react";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { ref, remove, set, update } from "firebase/database";
import { db } from "../lib/firebase";
import { audit, bump, newKey, useList } from "../lib/db";
import { useAuth } from "../lib/auth";
import { download, toCSV } from "../lib/utils";
import { Button, Card, Field, Modal, PageHeader, useConfirm, useToast } from "./ui";
import DataTable from "./DataTable";

/**
 * Config-driven list + create/edit/delete page for any RTDB collection.
 *
 * Props: title, subtitle, path, entity (singular noun), statKey?, columns, fields, searchKeys,
 * canEdit, listOptions (useList opts), defaults, transform(values,isNew), validate(values)→errors,
 * extraActions(row), toolbar, onSaved(id, values, isNew), onRemoved(row)
 * Each field: { name, label, type, options, required, span, hint, show?(values) }
 */
export default function CrudPage({
  title, subtitle, path, entity, statKey, columns, fields, searchKeys, canEdit = true,
  listOptions, defaults = {}, transform, validate, extraActions, toolbar, onSaved, onRemoved, exportName,
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { items, loading } = useList(path, listOptions);
  const [editing, setEditing] = useState(null); // { id|null, values }
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const openNew = () => { setErrors({}); setEditing({ id: null, values: { ...defaults } }); };
  const openEdit = (row) => { const { id, ...values } = row; setErrors({}); setEditing({ id, values }); };
  const setVal = (name, v) => setEditing((e) => ({ ...e, values: { ...e.values, [name]: v } }));

  const save = async (e) => {
    e.preventDefault();
    const errs = {};
    fields.forEach((f) => {
      const visible = !f.show || f.show(editing.values);
      if (visible && f.required && (editing.values[f.name] === undefined || editing.values[f.name] === "")) errs[f.name] = "Required";
    });
    Object.assign(errs, validate?.(editing.values, items, editing.id) || {});
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      const isNew = !editing.id;
      const id = editing.id || newKey(path);
      let values = { ...editing.values };
      if (transform) values = await transform(values, isNew);
      await (isNew ? set(ref(db, `${path}/${id}`), { ...values, createdAt: Date.now() }) : update(ref(db, `${path}/${id}`), values));
      if (isNew && statKey) bump(statKey, 1);
      audit(profile, isNew ? `create_${entity}` : `update_${entity}`, values.name || values.title || id);
      onSaved?.(id, values, isNew);
      toast.success(`${entity[0].toUpperCase()}${entity.slice(1)} ${isNew ? "created" : "updated"}`);
      setEditing(null);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const del = async (row) => {
    const ok = await confirm({ title: `Delete ${entity}?`, message: `"${row.name || row.title || row.id}" will be permanently removed.`, confirmLabel: "Delete" });
    if (!ok) return;
    try {
      await remove(ref(db, `${path}/${row.id}`));
      if (statKey) bump(statKey, -1);
      audit(profile, `delete_${entity}`, row.name || row.title || row.id);
      onRemoved?.(row);
      toast.success("Deleted");
    } catch (err) { toast.error(err); }
  };

  const cols = useMemo(() => {
    if (!canEdit && !extraActions) return columns;
    return [
      ...columns,
      {
        key: "_actions", label: "", sortable: false, width: 120, align: "right",
        render: (r) => (
          <div className="row gap-xs end">
            {extraActions?.(r)}
            {canEdit && <button className="icon-btn" title="Edit" onClick={() => openEdit(r)}><Pencil size={16} /></button>}
            {canEdit && <button className="icon-btn danger" title="Delete" onClick={() => del(r)}><Trash2 size={16} /></button>}
          </div>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, canEdit, extraActions]);

  const exportCsv = () => {
    const exportable = columns.filter((c) => c.key !== "_actions");
    download(`${exportName || path.replace(/\W+/g, "-")}.csv`, toCSV(items, exportable.map((c) => ({ label: c.label, value: c.sortValue || ((r) => r[c.key]) }))));
  };

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={canEdit && <Button icon={Plus} onClick={openNew}>Add {entity}</Button>}
      />
      <Card flush>
        <DataTable
          columns={cols}
          rows={items}
          loading={loading}
          searchKeys={searchKeys}
          toolbar={<>{toolbar}<Button variant="ghost" size="sm" icon={Download} onClick={exportCsv}>Export CSV</Button></>}
        />
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`${editing?.id ? "Edit" : "New"} ${entity}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={saving} type="submit" form="crud-form">Save</Button>
          </>
        }
      >
        <form id="crud-form" className="form-grid" onSubmit={save} noValidate>
          {editing && fields.filter((f) => !f.show || f.show(editing.values)).map(({ show, ...f }) => (
            <Field key={f.name} {...f} value={editing.values[f.name]} error={errors[f.name]} onChange={(v) => setVal(f.name, v)} />
          ))}
        </form>
      </Modal>
    </>
  );
}
