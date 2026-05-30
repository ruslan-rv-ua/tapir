export type LogLevel = "error" | "warn" | "info" | "debug";

/** True when the level produces verbose diagnostic output (debug). */
export function isVerbose(level: LogLevel): boolean {
  return level === "debug";
}

/**
 * Next log level when the "detailed logging" checkbox is toggled.
 * Turning it on selects `debug`; turning it off resets to `info`.
 */
export function toggleVerbose(_level: LogLevel, on: boolean): LogLevel {
  return on ? "debug" : "info";
}
