/**
 * `pnpm backlog <command>` — the backlog CLI.
 *
 *   index   rewrite docs/backlog/ROADMAP.md and docs/backlog/done/README.md
 *           from the records' front-matter
 *   next    print what to take next (README «Алгоритм для агента», step 1)
 *
 * Runs on Node's native TypeScript support; keep the file erasable-syntax only.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { BACKLOG_DIR, loadRecords, loadThemes, renderDoneIndex, renderNext, renderRoadmap } from "./backlogIndex.mts";

const command = process.argv[2];

try {
  switch (command) {
    case "index": {
      const records = loadRecords();
      writeFileSync(join(BACKLOG_DIR, "ROADMAP.md"), renderRoadmap(records, loadThemes()), "utf8");
      writeFileSync(join(BACKLOG_DIR, "done", "README.md"), renderDoneIndex(records), "utf8");
      const open = records.filter((r) => !r.done).length;
      console.log(`docs/backlog/ROADMAP.md і done/README.md оновлено: ${open} у черзі, ${records.length - open} виконано.`);
      break;
    }
    case "next":
      process.stdout.write(renderNext(loadRecords()));
      break;
    default:
      console.error("Використання: pnpm backlog index | pnpm backlog next");
      process.exitCode = 2;
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
