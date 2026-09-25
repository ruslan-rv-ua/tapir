/**
 * `pnpm merge-own-pr <номер>` — злити PR, який зробив агент, коли CI зелений.
 *
 * Єдиний шлях, яким агент зливає PR: прямий `gh pr merge` заборонено в
 * `.claude/settings.json`, дозволено лише цей скрипт. Що рахується «своїм» —
 * `ownPrRefusals` у `ownPr.mts`. Зливає merge commit'ом і лише той head, який
 * перевірено (`--match-head-commit`): коміт, дописаний між перевіркою і
 * злиттям, зупиняє злиття, а не проскакує в нього.
 *
 * Runs on Node's native TypeScript support; keep the file erasable-syntax only.
 */
import { execFileSync } from "node:child_process";
import { checkOutcome, ownPrRefusals, type PrFacts, type RollupEntry } from "./ownPr.mts";

const gh = (args: string[]) => execFileSync("gh", args, { encoding: "utf8" });

const number = process.argv[2];

if (!number || !/^\d+$/.test(number)) {
  console.error("Використання: pnpm merge-own-pr <номер PR>");
  process.exitCode = 2;
} else {
  try {
    const view = JSON.parse(
      gh(["pr", "view", number, "--json",
        "state,isDraft,baseRefName,isCrossRepository,body,headRefOid,statusCheckRollup"]),
    ) as Omit<PrFacts, "commits" | "checks"> & { headRefOid: string; statusCheckRollup: RollupEntry[] };

    const commits = gh(["api", `repos/{owner}/{repo}/pulls/${number}/commits`, "--paginate",
      "--jq", ".[] | {message: .commit.message, parents: (.parents | length)}"])
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as PrFacts["commits"][number]);

    const checks = view.statusCheckRollup.map((e) => ({
      name: e.name ?? e.context ?? "?",
      outcome: checkOutcome(e),
    }));

    const refusals = ownPrRefusals({ ...view, commits, checks });
    if (refusals.length > 0) {
      console.error(`PR #${number} не зливаю:`);
      for (const r of refusals) console.error(`  - ${r}`);
      process.exitCode = 1;
    } else {
      gh(["pr", "merge", number, "--merge", "--match-head-commit", view.headRefOid]);
      console.log(`PR #${number} злито (${view.headRefOid.slice(0, 7)}).`);
    }
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
