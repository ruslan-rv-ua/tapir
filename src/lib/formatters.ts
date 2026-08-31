import type { UnsupportedCodec } from "./tauri";
import * as m from "../i18n/paraglide/messages";

export function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The "codec and bitrate" segment, in the streams list and the player panel
 * alike. `unsupported` is the visible carrier of a refusal (ADR 2026-08-31):
 * whatever the toast said once, the row keeps saying — "128 kbps · OGG · not
 * supported", or without the family name when nothing was recognised.
 *
 * `format` and `unsupported` are the two halves of one verdict, so at most one
 * of them is ever set; the dash is only for a stream nobody has checked yet.
 */
export function formatBitrate(
  kbps: number | null,
  format?: "mp3" | "aac" | null,
  unsupported?: UnsupportedCodec | null,
): string {
  const parts = [
    kbps != null ? `${kbps} kbps` : null,
    unsupported ? unsupported.family : format ? format.toUpperCase() : null,
    unsupported ? m.codec_unsupported() : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Compact localized date, no time (e.g. "Jun 15, 2026"). For dense list rows. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/** Localized date + time (e.g. "Jun 15, 2026, 02:30"). For accessible names. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Localized clock only, no date (e.g. "21:04"). For the wishlist match log:
 * the journal is session-scoped, so every row happened today and a repeated
 * date would be noise.
 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** True when free disk space is known and below the threshold. 0 = disabled. */
export function isLowDiskSpace(freeBytes: number | null, thresholdGb: number): boolean {
  if (thresholdGb <= 0 || freeBytes === null) return false;
  return freeBytes < thresholdGb * 1024 ** 3;
}
