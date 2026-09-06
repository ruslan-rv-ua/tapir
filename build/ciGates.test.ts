import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The CI workflow runs the gates as one step each — `pnpm test` and
 * `pnpm typecheck` are separate named steps, not one `just check` call.
 *
 * That is deliberate, and it is the readability requirement from
 * [ADR 2026-09-05](../docs/decisions/2026-09-05-gates-refuse-rather-than-advise.md):
 * the failing step has to be *named*, because a single call collapses six
 * verdicts into one log a screen-reader user then has to search. Installing
 * `just` on the runner would buy the single source of truth back and spend
 * exactly the thing the ADR paid for.
 *
 * The price is two hand-synced lists. This test is what stops them drifting: it
 * says the workflow's gate steps are the justfile's recipes, same commands, same
 * order, nothing added and nothing dropped. Without it a gate could be added to
 * `just check` and silently never run in CI — a green tick for a check nobody
 * performed, which is the exact failure the ADR's §6 «Ніщо не має права ховати
 * червоне» exists to prevent.
 *
 * Not a general YAML reader: it walks `run:` lines textually, which is enough
 * because every step in the workflow is a one-line command. A block scalar
 * (`run: |`) would defeat that, so it throws rather than quietly skipping.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Steps that are setup, not gates. Everything else a job runs has to match the
 * corresponding justfile recipe — so a gate that appears in only one of the two
 * places fails this test instead of passing silently.
 */
const SETUP_STEPS = [
  'echo "path=$(pnpm store path --silent)" >> $env:GITHUB_OUTPUT',
  "pnpm install --frozen-lockfile",
];

describe("the CI workflow runs exactly the gates the justfile defines", () => {
  const workflow = read(".github/workflows/ci.yml");
  const justfile = read("justfile");

  it("`frontend` runs the four gates of `just check`, in order", () => {
    expect(gateSteps(workflow, "frontend")).toEqual(recipe(justfile, "check"));
  });

  it("`backend` runs the two gates of `just check-rust`, in order", () => {
    expect(gateSteps(workflow, "backend")).toEqual(recipe(justfile, "check-rust"));
  });

  it("`vite:build` is the first frontend gate", () => {
    // It generates `src/i18n/paraglide/` on disk; `tsc` and the tests resolve
    // `messages` against that output and have nothing to read before it runs.
    expect(gateSteps(workflow, "frontend")[0]).toBe("pnpm vite:build");
  });
});

/** The commands of one justfile recipe, `@`-prefixes stripped. */
function recipe(justfile: string, name: string): string[] {
  const lines = justfile.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `${name}:`);
  if (start === -1) throw new Error(`justfile has no recipe \`${name}\``);

  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s/.test(line)) break;
    const command = line.trim().replace(/^@/, "");
    if (command) body.push(command);
  }
  return body;
}

/** The `run:` commands of one workflow job, minus the setup steps. */
function gateSteps(workflow: string, job: string): string[] {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `  ${job}:`);
  if (start === -1) throw new Error(`ci.yml has no job \`${job}\``);

  const commands: string[] = [];
  for (const line of lines.slice(start + 1)) {
    // Two-space indent starts the next job.
    if (/^ {2}\S/.test(line)) break;

    const run = /^\s+run:\s*(.+)$/.exec(line);
    if (!run) continue;
    if (/^[|>]/.test(run[1])) {
      throw new Error(`ci.yml job \`${job}\` has a multi-line \`run:\` this test cannot read`);
    }
    if (!SETUP_STEPS.includes(run[1])) commands.push(run[1]);
  }
  return commands;
}
