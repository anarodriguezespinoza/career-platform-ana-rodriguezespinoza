"use client";

import { FormEvent, useState } from "react";

const opportunityTypes = [
  ["PROJECT", "A project"],
  ["COLLABORATION", "A collaboration"],
  ["SPEAKING", "Speaking"],
  ["OTHER", "Something else"],
] as const;

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const result = await response.json() as { message?: string };
    setStatus(response.ok ? "success" : "error");
    setMessage(result.message ?? "We could not receive your message. Please try again.");
    if (response.ok) event.currentTarget.reset();
  }

  return <form className="mt-10 grid max-w-2xl gap-6" onSubmit={submit}>
    <label className="grid gap-2 text-sm font-semibold" htmlFor="name">Name<input className="border border-[var(--line)] bg-white px-4 py-3 font-normal" id="name" name="name" required maxLength={120} /></label>
    <label className="grid gap-2 text-sm font-semibold" htmlFor="email">Email<input className="border border-[var(--line)] bg-white px-4 py-3 font-normal" id="email" name="email" type="email" required maxLength={254} /></label>
    <label className="grid gap-2 text-sm font-semibold" htmlFor="opportunityType">What brings you here?<select className="border border-[var(--line)] bg-white px-4 py-3 font-normal" id="opportunityType" name="opportunityType" defaultValue="PROJECT">{opportunityTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="grid gap-2 text-sm font-semibold" htmlFor="message">Message<textarea className="min-h-40 border border-[var(--line)] bg-white px-4 py-3 font-normal" id="message" name="message" required maxLength={5000} /></label>
    <div className="flex items-center gap-4"><button className="button-primary" type="submit" disabled={status === "sending"}>{status === "sending" ? "Sending…" : "Send message"}</button>{message && <p aria-live="polite" role="status" className={status === "success" ? "text-sm text-green-700" : "text-sm text-[var(--accent)]"}>{message}</p>}</div>
  </form>;
}
