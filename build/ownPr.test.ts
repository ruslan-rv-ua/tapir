import { describe, expect, it } from "vitest";
import { checkOutcome, ownPrRefusals, type PrFacts } from "./ownPr.mts";

/**
 * `pnpm merge-own-pr` зливає PR без людини, тож межа «свій» — у цій функції:
 * кожна ознака, що PR зробив агент і ворота пройдено, має тест, який її ламає.
 */

const TRAILER = "\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>";

const own = (over: Partial<PrFacts> = {}): PrFacts => ({
  state: "OPEN",
  isDraft: false,
  baseRefName: "develop",
  isCrossRepository: false,
  body: "Fix.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)",
  commits: [
    { message: `fix: a${TRAILER}`, parents: 1 },
    { message: `docs(backlog): close a${TRAILER}`, parents: 1 },
  ],
  checks: [
    { name: "frontend", outcome: "pass" },
    { name: "rust", outcome: "pass" },
  ],
  ...over,
});

describe("ownPrRefusals", () => {
  it("accepts an open, green agent PR into develop", () => {
    expect(ownPrRefusals(own())).toEqual([]);
  });

  it("accepts a sync merge of develop into the branch", () => {
    const commits = [
      ...own().commits,
      { message: "Merge remote-tracking branch 'origin/develop' into fix/a", parents: 2 },
      { message: "Merge branch 'develop' into fix/a", parents: 2 },
    ];
    expect(ownPrRefusals(own({ commits }))).toEqual([]);
  });

  it("refuses a closed, merged or draft PR", () => {
    expect(ownPrRefusals(own({ state: "MERGED" }))).toHaveLength(1);
    expect(ownPrRefusals(own({ state: "CLOSED" }))).toHaveLength(1);
    expect(ownPrRefusals(own({ isDraft: true }))).toHaveLength(1);
  });

  it("refuses any base but develop — main moves only by hand", () => {
    expect(ownPrRefusals(own({ baseRefName: "main" }))).toHaveLength(1);
  });

  it("refuses a PR from a fork", () => {
    expect(ownPrRefusals(own({ isCrossRepository: true }))).toHaveLength(1);
  });

  it("refuses a body without the Claude Code attribution", () => {
    expect(ownPrRefusals(own({ body: "Fix." }))).toHaveLength(1);
  });

  it("refuses when any commit lacks the Claude co-author trailer", () => {
    const commits = [...own().commits, { message: "fix: by hand", parents: 1 }];
    const refusals = ownPrRefusals(own({ commits }));
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain("fix: by hand");
  });

  it("refuses a merge commit that is not a sync with develop", () => {
    const commits = [...own().commits, { message: "Merge branch 'feature/x' into fix/a", parents: 2 }];
    expect(ownPrRefusals(own({ commits }))).toHaveLength(1);
  });

  it("refuses a PR with no commits of its own", () => {
    expect(ownPrRefusals(own({ commits: [] }))).toHaveLength(1);
  });

  it("refuses unless every check has passed", () => {
    expect(ownPrRefusals(own({ checks: [] }))).toHaveLength(1);
    expect(ownPrRefusals(own({ checks: [{ name: "rust", outcome: "pending" }] }))).toHaveLength(1);
    expect(ownPrRefusals(own({ checks: [{ name: "rust", outcome: "fail" }] }))).toHaveLength(1);
  });
});

describe("checkOutcome", () => {
  it("reads check runs by status and conclusion", () => {
    expect(checkOutcome({ __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" })).toBe("pass");
    expect(checkOutcome({ __typename: "CheckRun", status: "COMPLETED", conclusion: "SKIPPED" })).toBe("pass");
    expect(checkOutcome({ __typename: "CheckRun", status: "COMPLETED", conclusion: "NEUTRAL" })).toBe("pass");
    expect(checkOutcome({ __typename: "CheckRun", status: "IN_PROGRESS", conclusion: "" })).toBe("pending");
    expect(checkOutcome({ __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" })).toBe("fail");
    expect(checkOutcome({ __typename: "CheckRun", status: "COMPLETED", conclusion: "CANCELLED" })).toBe("fail");
  });

  it("reads commit statuses by state", () => {
    expect(checkOutcome({ __typename: "StatusContext", state: "SUCCESS" })).toBe("pass");
    expect(checkOutcome({ __typename: "StatusContext", state: "PENDING" })).toBe("pending");
    expect(checkOutcome({ __typename: "StatusContext", state: "EXPECTED" })).toBe("pending");
    expect(checkOutcome({ __typename: "StatusContext", state: "FAILURE" })).toBe("fail");
  });
});
