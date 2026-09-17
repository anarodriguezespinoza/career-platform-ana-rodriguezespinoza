"use client";
import { useState } from "react";
import { archiveRecord, publishContent, unpublishRecord } from "@/app/admin/actions";
import type { ContentType } from "@/domain/content/admin-service";
export function PublishControls({ type, id, state }: { type?: ContentType; id?: string; state?: string }) { const [message, setMessage] = useState(""); return <div className="admin-controls">{!type && <button onClick={async () => { try { await publishContent(); setMessage("Published"); } catch { setMessage("Unable to publish"); } }}>Publish all drafts</button>}{type && id && state === "PUBLISHED" && <button onClick={async () => { await unpublishRecord(type, id); setMessage("Unpublished"); }}>Unpublish</button>}{type && id && <button onClick={async () => { await archiveRecord(type, id); setMessage("Archived"); }}>Archive</button>}{message && <span role="status">{message}</span>}</div>; }
