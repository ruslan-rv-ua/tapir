export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

/** True when the level produces verbose diagnostic output (debug or trace). */
export function isVerbose(level: LogLevel): boolean {
  return level === "debug" || level === "trace";
}

/**
 * Next log level when the "detailed logging" checkbox is toggled.
 * Turning it on bumps to `debug` (leaving an already-verbose `trace` alone);
 * turning it off resets to `info`.
 */
export function toggleVerbose(level: LogLevel, on: boolean): LogLevel {
  if (on) return isVerbose(level) ? level : "debug";
  return "info";
}
