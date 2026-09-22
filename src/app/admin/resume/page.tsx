import Link from "next/link";

import { submitPublishedResume } from "./actions";

export default function AdminResumePage() {
  return <main>
    <h1>Resume PDF</h1>
    <p>Generate the current resume from published content only.</p>
    <form action={submitPublishedResume}>
      <button type="submit">Generate published resume</button>
    </form>
    <p><Link href={"/api/resume" as never}>Download the public resume</Link></p>
  </main>;
}
