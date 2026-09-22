import { randomUUID } from "node:crypto";

export type RequestContext = { requestId: string };

export function createRequestContext(requestId?: string): RequestContext {
  return { requestId: requestId?.trim() || randomUUID() };
}

export function getRequestContext(request: Request): RequestContext {
  return createRequestContext(request.headers.get("x-request-id") ?? undefined);
}
