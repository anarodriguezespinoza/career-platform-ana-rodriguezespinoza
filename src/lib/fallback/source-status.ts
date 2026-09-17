export type PublicContentSource = "database" | "snapshot";
export type PublicContentSourceEvent =
  | { event: "public_content_source"; source: "database" }
  | { event: "public_content_fallback"; source: "snapshot" };
export type SourceLogger = (event: PublicContentSourceEvent) => void;

export function logSourceStatus(event: PublicContentSourceEvent, logger: SourceLogger = console.info): void {
  logger(event);
}
