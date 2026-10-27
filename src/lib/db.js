// src/lib/db.js
import { useEffect, useMemo, useState } from "react";
import {
  ref, onValue, get, query, orderByChild, equalTo, limitToLast, update, push,
  runTransaction, serverTimestamp,
} from "firebase/database";
import { db } from "./firebase";

/** Live subscription to a single node. */
export function useValue(path, enabled = true) {
  const [state, setState] = useState({ data: null, loading: Boolean(path && enabled) });
  useEffect(() => {
    if (!path || !enabled) { setState({ data: null, loading: false }); return undefined; }
    setState((s) => (s.loading ? s : { ...s, loading: true }));
    return onValue(
      ref(db, path),
      (snap) => setState({ data: snap.val(), loading: false }),
      (error) => { console.error("useValue", path, error.code); setState({ data: null, loading: false, error }); }
    );
  }, [path, enabled]);
  return state;
}

/**
 * Subscribe to a collection as an array of { id, ...fields }.
 * Pass `orderBy`+`equal` to use an indexed server-side filter, `limit` to cap
 * the download, and `live:false` for a one-shot read (cheaper for static lists).
 */
export function useList(path, { orderBy, equal, limit, enabled = true, live = true } = {}) {
  const [state, setState] = useState({ items: [], loading: Boolean(path && enabled) });
  useEffect(() => {
    if (!path || !enabled || (orderBy && equal === undefined)) {
      setState({ items: [], loading: false });
      return undefined;
    }
    const cons = [];
    if (orderBy) cons.push(orderByChild(orderBy), equalTo(equal));
    if (limit) cons.push(limitToLast(limit));
    const q = cons.length ? query(ref(db, path), ...cons) : ref(db, path);
    const read = (snap) => {
      const items = [];
      snap.forEach((c) => { items.push({ id: c.key, ...(typeof c.val() === "object" ? c.val() : { value: c.val() }) }); });
      setState({ items, loading: false });
    };
    const fail = (error) => { console.error("useList", path, error.code); setState({ items: [], loading: false, error }); };
    setState((s) => ({ ...s, loading: true }));
    if (!live) { get(q).then(read).catch(fail); return undefined; }
    return onValue(q, read, fail);
  }, [path, orderBy, equal, limit, enabled, live]);
  return state;
}

/** Lookup helper: list + id→item map + <option> data. */
export function useLookup(path, labelKey = "name", opts) {
  const { items, loading } = useList(path, { live: false, ...opts });
  return useMemo(() => {
    const map = Object.fromEntries(items.map((i) => [i.id, i]));
    const options = items
      .map((i) => ({ value: i.id, label: i[labelKey] || i.id }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { items, map, options, loading, label: (id) => map[id]?.[labelKey] || "—" };
  }, [items, loading, labelKey]);
}

export const newKey = (path) => push(ref(db, path)).key;
export const patch = (updates) => update(ref(db), updates);
export const bump = (key, delta) => runTransaction(ref(db, `stats/${key}`), (v) => Math.max(0, (v || 0) + delta));
export const ts = () => serverTimestamp();

/** Fire-and-forget audit trail entry. */
export function audit(actor, action, target = "") {
  if (!actor) return;
  push(ref(db, "audit"), { uid: actor.uid, name: actor.name || actor.email || "", role: actor.role, action, target, at: serverTimestamp() })
    .catch(() => {});
}

/** Server clock offset so countdowns can't be skewed by a wrong device clock. */
export function useServerOffset() {
  const { data } = useValue(".info/serverTimeOffset");
  return data || 0;
}
