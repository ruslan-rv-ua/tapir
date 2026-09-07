/**
 * Backlog index generator.
 *
 * `docs/backlog/ROADMAP.md` (the queue) and `docs/backlog/done/README.md` (the
 * archive) are rendered from the front-matter of every record, so they cannot
 * drift from it. The only hand-written input is `docs/backlog/THEMES.md` — one
 * `## <target>` section per version, inlined under the matching heading.
 *
 * `pnpm backlog index` rewrites both files, `pnpm backlog next` prints what to
 * take next, and `build/backlogIndex.test.ts` fails whenever the files on disk
 * differ from what the records say — a forgotten regeneration is a red gate,
 * not a silently stale page.
 *
 * Lives in `build/` — the shelf for Node-side code — because it needs `node:fs`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export const BACKLOG_DIR = join(process.cwd(), "docs", "backlog");

/** Longest `summary:` the index accepts — one table cell, not a paragraph. */
export const SUMMARY_MAX = 160;

export type Priority = "P0" | "P1" | "P2" | "P3";
export type Effort = "S" | "M" | "L";
export type Status = "draft" | "ready" | "blocked" | "done";

export interface BacklogRecord {
  slug: string;
  title: string;
  priority: Priority;
  type: string;
  status: Status;
  effort: Effort;
  kind: string;
  target: string;
  a11y: boolean;
  dependsOn: string[];
  blocks: string[];
  completed?: string;
  summary?: string;
  blockedReason?: string;
  /** Path relative to `docs/backlog/`: `p1-x.md` or `done/p1-x.md`. */
  path: string;
  done: boolean;
}

const RECORD_FILE = /^p([0-3])-(.+)\.md$/;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const PRIORITIES: readonly string[] = ["P0", "P1", "P2", "P3"];
const EFFORTS: readonly string[] = ["S", "M", "L"];
const STATUSES: readonly string[] = ["draft", "ready", "blocked", "done"];
const TARGET = /^(\d+\.\d+\.\d+|unscheduled)$/;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function readRecord(dir: string, file: string, done: boolean, errors: string[]): BacklogRecord | null {
  const match = RECORD_FILE.exec(file);
  if (!match) return null;
  const path = done ? `done/${file}` : file;
  const text = readFileSync(join(dir, file), "utf8");
  const fm = FRONT_MATTER.exec(text);
  if (!fm) {
    errors.push(`${path}: немає front-matter`);
    return null;
  }
  let raw: Record<string, unknown>;
  try {
    raw = parse(fm[1], { schema: "core" }) as Record<string, unknown>;
  } catch (e) {
    errors.push(`${path}: front-matter не парситься — ${(e as Error).message}`);
    return null;
  }
  const str = (key: string) => (raw[key] === undefined || raw[key] === null ? "" : String(raw[key]));
  const record: BacklogRecord = {
    slug: str("slug"),
    title: str("title"),
    priority: str("priority") as Priority,
    type: str("type"),
    status: str("status") as Status,
    effort: str("effort") as Effort,
    kind: str("kind"),
    target: str("target"),
    a11y: raw.a11y === true,
    dependsOn: asStringArray(raw.depends_on),
    blocks: asStringArray(raw.blocks),
    completed: raw.completed === undefined ? undefined : str("completed"),
    summary: raw.summary === undefined ? undefined : str("summary"),
    blockedReason: raw.blocked_reason === undefined ? undefined : str("blocked_reason"),
    path,
    done,
  };
  const bad = (msg: string) => errors.push(`${path}: ${msg}`);
  if (record.slug !== match[2]) bad(`slug «${record.slug}» ≠ імені файлу`);
  if (record.priority !== `P${match[1]}`) bad(`priority ${record.priority} ≠ префіксу файлу p${match[1]}`);
  if (!PRIORITIES.includes(record.priority)) bad(`невідомий priority «${record.priority}»`);
  if (!EFFORTS.includes(record.effort)) bad(`невідомий effort «${record.effort}»`);
  if (!STATUSES.includes(record.status)) bad(`невідомий status «${record.status}»`);
  if (!TARGET.test(record.target)) bad(`target «${record.target}» — не semver і не unscheduled`);
  if (!record.title) bad("порожній title");
  if (done !== (record.status === "done")) bad(done ? "лежить у done/, а status не done" : "status: done поза done/");
  if (done && !record.completed) bad("done без completed:");
  if (record.status === "blocked" && !record.blockedReason) bad("blocked без blocked_reason:");
  if (record.summary !== undefined) {
    if (record.summary.length > SUMMARY_MAX) bad(`summary довший за ${SUMMARY_MAX} символів (${record.summary.length})`);
    if (/\]\(/.test(record.summary)) bad("summary містить markdown-посилання — індекс рендериться з двох тек, шляхи не зійдуться");
    if (/\r|\n/.test(record.summary)) bad("summary має бути одним рядком");
  }
  return record;
}

/** Every record under `docs/backlog/` and `docs/backlog/done/`, validated. Throws listing all problems at once. */
export function loadRecords(backlogDir: string = BACKLOG_DIR): BacklogRecord[] {
  const errors: string[] = [];
  const records: BacklogRecord[] = [];
  for (const [dir, done] of [
    [backlogDir, false],
    [join(backlogDir, "done"), true],
  ] as const) {
    for (const file of readdirSync(dir).sort()) {
      const record = readRecord(dir, file, done, errors);
      if (record) records.push(record);
    }
  }
  const bySlug = new Map(records.map((r) => [r.slug, r]));
  for (const r of records) {
    for (const dep of [...r.dependsOn, ...r.blocks]) {
      if (!bySlug.has(dep)) errors.push(`${r.path}: посилається на невідомий slug «${dep}»`);
    }
  }
  if (errors.length) throw new Error(`Беклог не проходить перевірку:\n  ${errors.join("\n  ")}`);
  return records;
}

/** `## <target>` sections of THEMES.md, body verbatim. */
export function loadThemes(backlogDir: string = BACKLOG_DIR): Map<string, string> {
  const themes = new Map<string, string>();
  const text = readFileSync(join(backlogDir, "THEMES.md"), "utf8").replace(/\r\n/g, "\n");
  const parts = text.split(/^## (.+)$/m);
  for (let i = 1; i < parts.length; i += 2) themes.set(parts[i].trim(), parts[i + 1].trim());
  return themes;
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

export function compareTargets(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "unscheduled") return 1;
  if (b === "unscheduled") return -1;
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

const STATUS_RANK: Record<Status, number> = { ready: 0, draft: 1, blocked: 2, done: 3 };

/** Priority first, then the bigger effort — it decides whether the version closes — then ready before draft. */
export function compareQueue(a: BacklogRecord, b: BacklogRecord): number {
  return (
    PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
    EFFORTS.indexOf(b.effort) - EFFORTS.indexOf(a.effort) ||
    STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
    a.slug.localeCompare(b.slug)
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const cell = (s: string) => s.replace(/\|/g, "\\|");
const link = (r: BacklogRecord, fromDone: boolean) =>
  `[${r.slug}](${fromDone ? r.path.replace(/^done\//, "") : r.path})`;

/** `blocks:` of the record plus everyone who lists it in `depends_on:` — open records only. */
function unblocks(r: BacklogRecord, open: BacklogRecord[]): BacklogRecord[] {
  return open.filter((o) => o !== r && (r.blocks.includes(o.slug) || o.dependsOn.includes(r.slug)));
}

function queueRow(r: BacklogRecord, bySlug: Map<string, BacklogRecord>, open: BacklogRecord[]): string {
  const deps = r.dependsOn
    .map((slug) => bySlug.get(slug)!)
    .map((d) => (d.done ? `${link(d, false)} ✅` : link(d, false)))
    .join(", ");
  const unblocked = unblocks(r, open)
    .sort(compareQueue)
    .map((o) => link(o, false))
    .join(", ");
  const status = r.status === "blocked" ? "**blocked**" : r.status;
  const summary = [r.summary ?? r.title, r.blockedReason ? `Заблоковано: ${r.blockedReason}` : ""]
    .filter(Boolean)
    .join(" ");
  return `| ${link(r, false)}${r.a11y ? " ♿" : ""} | ${r.priority} | ${r.type} | ${status} | ${r.effort} | ${deps || "—"} | ${unblocked || "—"} | ${cell(summary)} |`;
}

const GENERATED = "> Згенеровано з front-matter записів командою `pnpm backlog index`. **Не редагувати руками:**";

export function renderRoadmap(records: BacklogRecord[], themes: Map<string, string>): string {
  const open = records.filter((r) => !r.done);
  const done = records.filter((r) => r.done);
  const bySlug = new Map(records.map((r) => [r.slug, r]));
  const targets = [...new Set([...open.map((r) => r.target), ...themes.keys()])].sort(compareTargets);

  const out: string[] = [
    "# ROADMAP беклогу",
    "",
    GENERATED,
    "> правки йдуть у front-matter записів і в [THEMES.md](THEMES.md); сторож —",
    "> `build/backlogIndex.test.ts` у `pnpm test`.",
    "",
    "Черга записів [`docs/backlog/`](README.md), згрупована за `target` (semver-версією з",
    "front-matter). Це не той самий roadmap, що [`docs/implementation-phases.md`](../implementation-phases.md)",
    "(офіційний фазовий roadmap застосунку): тут упорядковано **беклог** — те, що ще не стало",
    "фазою — за версією, у яку розробник планує його зробити.",
    "",
    "Посилання — за **slug**. Секції йдуть за зростанням semver; `unscheduled` — наприкінці.",
    "Порядок рядків у секціях — за пріоритетом, а в межах пріоритету **більші першими**:",
    "саме вони визначають, чи версія закриється. Колонка «Суть» — поле `summary:` запису",
    "(без нього — `title:`).",
    "♿ — запис зачіпає доступність (`a11y: true`), приймання потребує NVDA-прогону.",
    `Виконані записи (${done.length}) — у [done/README.md](done/README.md), спадок кожного — у секції`,
    "«Спадок» його файлу.",
  ];

  for (const target of targets) {
    const rows = open.filter((r) => r.target === target).sort(compareQueue);
    const closed = done.filter((r) => r.target === target).length;
    out.push("", "---", "", `## ${target === "unscheduled" ? target : `v${target}`}`, "");
    const theme = themes.get(target);
    if (theme) out.push(theme, "");
    if (rows.length === 0) {
      out.push(`Черга порожня. Виконано: ${closed}.`);
      continue;
    }
    out.push(`У черзі: ${rows.length}. Виконано: ${closed}.`, "");
    out.push(
      "| Slug | P | Тип | Стан | Зусилля | Залежить від | Розблоковує | Суть |",
      "|------|---|-----|------|---------|---------------|-------------|------|",
    );
    for (const r of rows) out.push(queueRow(r, bySlug, open));
  }
  return out.join("\n") + "\n";
}

export function renderDoneIndex(records: BacklogRecord[]): string {
  const done = records
    .filter((r) => r.done)
    .sort((a, b) => (b.completed ?? "").localeCompare(a.completed ?? "") || a.slug.localeCompare(b.slug));
  const out: string[] = [
    "# Виконані записи",
    "",
    GENERATED,
    "> один рядок тут — поле `summary:` запису (без нього — `title:`).",
    "",
    `${done.length} записів, найновіші зверху. Кожен файл зберігає ухвалені рішення, критерії,`,
    "за якими фічу приймали, і секцію «Спадок» — що лишилось у коді й правилах після закриття.",
    "Черга — [ROADMAP.md](../ROADMAP.md).",
    "",
    "| Запис | Версія | Коли | Підсумок |",
    "|-------|--------|------|----------|",
  ];
  for (const r of done) {
    out.push(`| ${link(r, true)}${r.a11y ? " ♿" : ""} | ${r.target} | ${r.completed} | ${cell(r.summary ?? r.title)} |`);
  }
  return out.join("\n") + "\n";
}

/** What `pnpm backlog next` prints: the README algorithm, step 1, in twenty lines. */
export function renderNext(records: BacklogRecord[]): string {
  const open = records.filter((r) => !r.done);
  const versions = [...new Set(open.map((r) => r.target))].filter((t) => t !== "unscheduled").sort(compareTargets);
  const current = versions[0];
  const out: string[] = [];
  const line = (r: BacklogRecord) =>
    `  ${r.priority} ${r.effort} ${r.slug}${r.a11y ? " ♿" : ""} (${r.type}/${r.status}) — ${r.summary ?? r.title}`;
  if (!current) {
    out.push("Semver-черга порожня — усе, що лишилось, в unscheduled.");
  } else {
    const rows = open.filter((r) => r.target === current).sort(compareQueue);
    const ready = rows.filter((r) => r.status === "ready");
    const blocked = rows.filter((r) => r.status === "blocked");
    const rest = rows.filter((r) => r.status === "draft");
    out.push(`Поточна версія: ${current} — ${rows.length} у черзі.`);
    if (ready.length) {
      out.push("Готові (ready), зверху вниз:");
      ready.forEach((r) => out.push(line(r)));
    } else {
      out.push("У поточній версії немає ready.");
      const fallback = open
        .filter((r) => r.target === "unscheduled" && r.status === "ready")
        .sort((a, b) => EFFORTS.indexOf(a.effort) - EFFORTS.indexOf(b.effort) || compareQueue(a, b));
      if (fallback.length) {
        out.push("Найменший effort серед ready в unscheduled:");
        out.push(line(fallback[0]));
      }
      const grooming = rows.filter((r) => r.type === "planned" && r.status === "draft");
      if (grooming.length) {
        out.push("Grooming (planned/draft):");
        grooming.forEach((r) => out.push(line(r)));
      }
    }
    if (blocked.length) {
      out.push("Заблоковані:");
      blocked.forEach((r) => out.push(`${line(r)}${r.blockedReason ? ` — ${r.blockedReason}` : ""}`));
    }
    if (rest.length) out.push(`Не в роботу без обговорення чи grooming (draft): ${rest.length}.`);
  }
  out.push(`Усього відкритих: ${open.length}; повна карта — docs/backlog/ROADMAP.md.`);
  return out.join("\n") + "\n";
}
