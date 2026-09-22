"use client";

export function DeleteInquiryButton({ action }: { action: () => Promise<void> }) {
  return <form action={action} onSubmit={(event) => { if (!window.confirm("Delete this inquiry permanently?")) event.preventDefault(); }}><button className="button-secondary" type="submit">Delete inquiry</button></form>;
}
