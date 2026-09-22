import { randomUUID } from "node:crypto";

export type RequestContext = { requestId: string };

export function getRequestContext(request: Request): RequestContext {
  return { requestId: request.headers.get("x-request-id")?.trim() || randomUUID() };
}
