const SENSITIVE_KEY_PATTERN = /token|secret|password|senha|code|authorization|cookie|api[_-]?key/i;

export function maskSensitiveValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (!value) return "(empty)";
  if (value.length <= 4) return "*".repeat(value.length);
  return `${value.slice(0, 2)}${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-2)}`;
}

export function redactLogFields<T extends Record<string, unknown>>(fields: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? maskSensitiveValue(value) : value,
    ]),
  );
}

type LogLevel = "info" | "warn" | "error";

function writeLog(level: LogLevel, scope: string, message: string, fields?: Record<string, unknown>) {
  const payload = fields ? redactLogFields(fields) : undefined;
  const prefix = `[${scope}] ${message}`;

  if (level === "error") {
    payload ? console.error(prefix, payload) : console.error(prefix);
    return;
  }

  if (level === "warn") {
    payload ? console.warn(prefix, payload) : console.warn(prefix);
    return;
  }

  payload ? console.log(prefix, payload) : console.log(prefix);
}

export function createSafeLogger(scope: string) {
  return {
    info: (message: string, fields?: Record<string, unknown>) => writeLog("info", scope, message, fields),
    warn: (message: string, fields?: Record<string, unknown>) => writeLog("warn", scope, message, fields),
    error: (message: string, fields?: Record<string, unknown>) => writeLog("error", scope, message, fields),
  };
}
