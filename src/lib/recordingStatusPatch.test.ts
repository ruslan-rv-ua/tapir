import { describe, it, expect } from "vitest";
import { recordingStatusPatch } from "./recordingStatusPatch";
import type { RecordingStatusPayload } from "./tauri";

const payload = (over: Partial<RecordingStatusPayload> = {}): RecordingStatusPayload => ({
  streamId: "s1",
  status: "reconnecting",
  error: null,
  reconnect: { attempt: 3, max: 10 },
  recordingStartedAt: null,
  ...over,
});

describe("recordingStatusPatch — the reconnect pair", () => {
  it("carries the pair from the event into the mirror", () => {
    // Це те, що було зламане: пара лежала в статусі бекенда й у подію не
    // їхала, тож у дзеркало потрапляла лише з `getAllStatuses` на старті
    // застосунку — «Спроба N з M» бачив тільки той, хто запустив Tapir
    // посеред чужого перепідключення.
    expect(recordingStatusPatch(payload()).reconnect).toEqual({ attempt: 3, max: 10 });
  });

  it("clears the pair on every transition that is not a reconnect", () => {
    // Порожня пара в події **є** скиданням — окремого механізму немає
    // (ADR 2026-09-15 «Подія несе те, що знає перехід» §1). Типи цього не
    // стережуть: `Partial<StreamStatus>` пропускає забуте поле мовчки.
    for (const status of ["connecting", "recording", "stopped", "error"] as const) {
      const patch = recordingStatusPatch(payload({ status, reconnect: null }));
      expect(patch.reconnect, `status: ${status}`).toBeNull();
    }
  });
});

describe("recordingStatusPatch — what the row already relied on", () => {
  it("takes the start moment from the backend instead of stamping its own clock", () => {
    // Бекенд ставить її в мить, коли з'єднання стало записом; фронтенд доти
    // штампував `new Date()` на прибуття події — те саме поле з живим
    // джерелом, якого ніхто не читав (ADR 2026-09-15 §1).
    const patch = recordingStatusPatch(
      payload({ status: "recording", reconnect: null, recordingStartedAt: "2026-09-15T10:00:00+03:00" }),
    );
    expect(patch.recordingStartedAt).toBe("2026-09-15T10:00:00+03:00");
  });

  it("keeps result and state as two vocabularies", () => {
    // «зупинено» — результат запису, «очікування» — стан потоку, і одне не
    // вживається замість другого (`tauri-ts-type-drift`, рішення 8).
    expect(recordingStatusPatch(payload({ status: "stopped", reconnect: null })).state).toBe("idle");
    expect(recordingStatusPatch(payload({ status: "recording", reconnect: null })).state).toBe("recording");
  });

  it("names a cause for a reason-less failure rather than leaving the row silent", () => {
    expect(recordingStatusPatch(payload({ status: "error", reconnect: null })).error)
      .toBe("station_unreachable");
    expect(
      recordingStatusPatch(payload({ status: "error", reconnect: null, error: "disk_write_failed" })).error,
    ).toBe("disk_write_failed");
  });

  it("drops a stale cause once the stream is trying again", () => {
    // Помилку знімає дія, не час — але наступна спроба і є дією.
    expect(recordingStatusPatch(payload({ status: "connecting", reconnect: null })).error).toBeNull();
    expect(recordingStatusPatch(payload()).error).toBeNull();
  });
});
