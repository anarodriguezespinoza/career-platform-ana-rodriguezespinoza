import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";

import { ResumeDocument } from "./resume-document";
import type { PublishedResumeData } from "./resume-data";

export async function generateResumePdf(data: PublishedResumeData): Promise<Uint8Array> {
  const buffer = await renderToBuffer(createElement(ResumeDocument, { data }) as ReactElement<DocumentProps>);
  return new Uint8Array(buffer);
}
