/**
 * Чи можна агентові злити цей PR самому — чиста частина `pnpm merge-own-pr`.
 *
 * «Свій» означає: PR зробив агент (підпис Claude Code в описі, трейлер
 * `Co-Authored-By: Claude` у кожному власному коміті), він іде з гілки цього
 * репозиторію в `develop`, і всі перевірки CI пройдено. Автор на GitHub нічого
 * не розрізняє: `gh` діє від облікового запису людини, тож і PR агента, і PR
 * людини мають одного автора. Ознаки можна підробити — межа відсікає чужу
 * роботу, а не зловмисника.
 *
 * Runs on Node's native TypeScript support; keep the file erasable-syntax only.
 */

export type CheckOutcome = "pass" | "pending" | "fail";

export interface PrFacts {
  state: string;
  isDraft: boolean;
  baseRefName: string;
  isCrossRepository: boolean;
  body: string;
  /** Коміти PR (без тих, що вже є в базі); `parents` — кількість батьків. */
  commits: { message: string; parents: number }[];
  checks: { name: string; outcome: CheckOutcome }[];
}

/** Один елемент `statusCheckRollup` з `gh pr view --json`. */
export interface RollupEntry {
  __typename?: string;
  name?: string;
  context?: string;
  status?: string;
  conclusion?: string;
  state?: string;
}

const ATTRIBUTION = "Generated with [Claude Code]";
const CO_AUTHOR = /^Co-Authored-By: Claude\b/im;
// Злиття `develop` у гілку — `sync_with_base_branch` застосунку або `git merge`
// руками; будь-яке інше злиття могло б занести чужі коміти.
const SYNC_MERGE = /^Merge (remote-tracking )?branch '(origin\/)?develop'/;
const PASSING_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

export function checkOutcome(entry: RollupEntry): CheckOutcome {
  if (entry.__typename === "StatusContext") {
    if (entry.state === "SUCCESS") return "pass";
    return entry.state === "PENDING" || entry.state === "EXPECTED" ? "pending" : "fail";
  }
  if (entry.status !== "COMPLETED") return "pending";
  return PASSING_CONCLUSIONS.has(entry.conclusion ?? "") ? "pass" : "fail";
}

const headline = (message: string) => message.split("\n", 1)[0];

/** Причини відмови; порожній список — PR свій і готовий до злиття. */
export function ownPrRefusals(pr: PrFacts): string[] {
  const refusals: string[] = [];
  if (pr.state !== "OPEN") refusals.push(`PR не відкритий (${pr.state})`);
  if (pr.isDraft) refusals.push("PR — чернетка");
  if (pr.baseRefName !== "develop") {
    refusals.push(`база — ${pr.baseRefName}, а не develop: main рухає лише людина`);
  }
  if (pr.isCrossRepository) refusals.push("PR з форку");
  if (!pr.body.includes(ATTRIBUTION)) refusals.push(`в описі немає «${ATTRIBUTION}»`);

  const own = pr.commits.filter((c) => c.parents === 1);
  if (own.length === 0) refusals.push("у PR немає власних комітів");
  for (const c of own) {
    if (!CO_AUTHOR.test(c.message)) refusals.push(`коміт без трейлера Claude: ${headline(c.message)}`);
  }
  for (const c of pr.commits.filter((c) => c.parents > 1)) {
    if (!SYNC_MERGE.test(c.message)) refusals.push(`злиття не з develop: ${headline(c.message)}`);
  }

  if (pr.checks.length === 0) refusals.push("перевірок CI немає");
  for (const c of pr.checks) {
    if (c.outcome === "pending") refusals.push(`перевірка ще йде: ${c.name}`);
    if (c.outcome === "fail") refusals.push(`перевірка не пройшла: ${c.name}`);
  }
  return refusals;
}
