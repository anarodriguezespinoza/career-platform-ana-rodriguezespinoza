export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;
export type LogEntry = { level: LogLevel; event: string; fields: LogFields; timestamp: string };
type LogSink = (entry: LogEntry) => void;

const REDACTED = "[REDACTED]";
const sensitiveKey = /(authorization|access.?token|api.?key|client.?secret|credential|password|secret|token|message|body|content)/i;

export function redactLogFields(fields: LogFields): LogFields {
  return redactValue(fields) as LogFields;
}

function redactValue(value: unknown, key?: string): unknown {
  if (key && sensitiveKey.test(key)) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactValue(entryValue, entryKey)]));
  }
  return value;
}

function defaultSink(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  else console.info(line);
}

export function createLogger(sink: LogSink = defaultSink) {
  return {
    info(event: string, fields: LogFields = {}) { sink({ level: "info", event, fields: redactLogFields(fields), timestamp: new Date().toISOString() }); },
    warn(event: string, fields: LogFields = {}) { sink({ level: "warn", event, fields: redactLogFields(fields), timestamp: new Date().toISOString() }); },
    error(event: string, fields: LogFields = {}) { sink({ level: "error", event, fields: redactLogFields(fields), timestamp: new Date().toISOString() }); },
  };
}

export const logger = createLogger();
