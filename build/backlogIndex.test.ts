import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BACKLOG_DIR, loadRecords, loadThemes, renderDoneIndex, renderRoadmap } from "./backlogIndex.mts";

/**
 * The backlog index is generated, and this is what keeps it that way.
 *
 * `docs/backlog/ROADMAP.md` and `docs/backlog/done/README.md` must equal what
 * the records' front-matter renders to right now. Closing a record, changing
 * its status or target, or editing THEMES.md without running
 * `pnpm backlog index` turns this test red — the failure names the command.
 * The first test also rejects front-matter the index cannot trust: a slug that
 * differs from the file name, a `depends_on` pointing at nobody, a done record
 * without `completed:`, a `summary:` too long for one table cell.
 */

const STALE = "індекс застарів — виконай `pnpm backlog index`";

function onDisk(...segments: string[]): string {
  return readFileSync(join(BACKLOG_DIR, ...segments), "utf8").replace(/\r\n/g, "\n");
}

describe("backlog index", () => {
  it("every record's front-matter is valid", () => {
    expect(() => loadRecords()).not.toThrow();
  });

  it("ROADMAP.md is what the records render to", () => {
    const records = loadRecords();
    expect(onDisk("ROADMAP.md"), STALE).toBe(renderRoadmap(records, loadThemes()));
  });

  it("done/README.md is what the records render to", () => {
    expect(onDisk("done", "README.md"), STALE).toBe(renderDoneIndex(loadRecords()));
  });
});
