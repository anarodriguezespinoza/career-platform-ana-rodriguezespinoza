export type PublicContentSource = "database" | "snapshot";
export type PublicContentSourceEvent =
  | { event: "public_content_source"; source: "database" }
  | { event: "public_content_fallback"; source: "snapshot" };
export type SourceLogger = (event: PublicContentSourceEvent) => void;

import { logger as structuredLogger } from "@/lib/observability/logger";

export function logSourceStatus(event: PublicContentSourceEvent, logger?: SourceLogger): void {
  if (logger) {
    logger(event);
    return;
  }
  structuredLogger.info(event.event, { source: event.source });
}
