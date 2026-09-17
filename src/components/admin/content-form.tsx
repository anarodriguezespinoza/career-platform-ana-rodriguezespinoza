"use client";

import { useState } from "react";
import { saveDraft } from "@/app/admin/actions";
import type { ContentType } from "@/domain/content/admin-service";

export function ContentForm({ type, id, initial }: { type: ContentType; id: string; initial: Record<string, unknown> }) {
  const [data, setData] = useState(initial);
  const [message, setMessage] = useState("");
  const fields = Object.entries(initial).filter(([key]) => !["id", "publicationState", "createdAt", "updatedAt", "technologies"].includes(key));
  return <form action={async () => { try { await saveDraft({ type, id, data }); setMessage("Draft saved"); } catch { setMessage("Unable to save draft"); } }}>
    {fields.map(([key, value]) => <label key={key}>{key}{typeof value === "boolean" ? <input name={key} type="checkbox" checked={Boolean(data[key])} onChange={(event) => setData({ ...data, [key]: event.target.checked })} /> : <input name={key} value={data[key] == null ? "" : String(data[key])} onChange={(event) => setData({ ...data, [key]: event.target.value })} />}</label>)}
    <button type="submit">Save draft</button>{message && <p role="status">{message}</p>}
  </form>;
}
