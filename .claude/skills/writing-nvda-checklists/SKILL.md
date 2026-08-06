---
name: writing-nvda-checklists
description: Use when a Tapir backlog record with `a11y: true` has been implemented and its acceptance criteria include an NVDA run («NVDA-прогін»), or when revising, running, or accepting an existing docs/testing/nvda-*.md checklist. Also triggers on keyboard, focus, zone-navigation or announcement changes that are waiting on manual sign-off before an a11y record can move to done/.
---

# Writing NVDA run checklists

## Overview

The developer is blind, uses NVDA, and is the only person who runs these
checklists. A completed one is the acceptance evidence for the `a11y: true` gate —
it turns "implemented" into "accepted".

So **a checklist that can be walked end to end without exercising the change is
worse than none**: it converts "untested" into "signed off". Padding is not
neutral here.

Core principle: **scenarios come from the mechanism of the change, not the
surface of the feature.** The checklist earns its place by testing what was
broken and the guarantee the fix now makes.

## Deriving scenarios

Read the diff first, then ask two questions: *what does this fix guarantee*, and
*where could that guarantee hold in one direction only*. Each answer below that
applies to the change becomes one scenario; each that doesn't applies is dropped,
not padded out.

1. **The primary symptom.** The exact user-visible failure from the record's
   «Опис». Mark its key line as the one that decides the run.
2. **Every other symptom, separately.** One root cause often had two surfaces
   (e.g. a dead button *and* a zone dropped from F6). Each gets its own scenario —
   a tester who stops halfway must still have covered something whole.
3. **The mirror case.** The same action in the opposite direction, on the other
   tab/list/order. A guard written for one direction passes its own scenario and
   fails this one.
4. **Where the guarantee must NOT hold.** The negative case an over-eager fix
   breaks — the state that still has to be cleared, disabled, or emptied. This is
   the scenario most often missing, and the one that catches the fix's own risk.
5. **Accumulation.** If the fix touches state reused across repetitions, repeat
   the trigger 5+ times. Bugs of this class work on attempt one and fail on three.
6. **Where focus lands afterwards.** Whenever a change removes what the user was
   standing on, name the exact expected destination. Never `<body>`, never silence.
7. **The untouched path, as regression.** The simplest case, unchanged by the fix,
   confirming the shared mechanism it modified still serves everyone else.

**Proportionality.** A P0 across several screens took 12 scenarios; a single
component S bug took 7; a one-line fix needs 3. Scenario count follows the blast
radius of the change, never a template.

**Phrase every check as what should be HEARD.** The tester cannot see the screen,
and half these bugs *are* silence:

```
❌ - [ ] З'являється діалог підтвердження з кнопками «Видалити» і «Скасувати».
✅ - [ ] Відкрився діалог підтвердження і NVDA його озвучив — «Видалити вибрані
         шаблони (5)?». Тиша тут означає, що баг живий.
```

Every scenario opens with a one-sentence `Навіщо:` — what breaks if this check is
skipped. If you cannot write that sentence, the scenario does not belong.

## Harvest the exact strings — never write them from memory

REQUIRED before drafting. Every quoted UI string, key and seed value is read from
source:

- Announced and displayed text: `src/i18n/messages/uk.json` (the app runs Ukrainian first)
- `Alt+<digit>` screen shortcuts: `src/lib/sections.ts`
- All other keys, and which are reserved: `src/lib/shortcuts.ts`
- Data the checklist tells the tester to create: wherever it is defined in code
  (e.g. `src/components/wishlist/examplePatterns.ts`)

A checklist that says «Видалено 5 патернів» where the app says «Видалено: 5»
costs the tester a false `[!]` plus the investigation into which side is wrong —
on the one gate that exists to catch real defects.

While harvesting, note **collisions** and put them in «Підготовка» as warnings:
labels that repeat (a confirm dialog whose title and confirm button read the
same), state that resets underfoot (a selection cleared by switching tabs). These
look like checklist errors during a run and burn the tester's time.

## Format

Start from [template.md](template.md) — copy it and keep the «Як користуватись
цим файлом» block verbatim; it is the part the tester has already learned.

Non-negotiable:

- **No tables.** Cell-by-cell navigation is expensive with a screen reader.
- **One `##` heading per scenario**, so `NVDA+F7` → «Заголовки» lists the run.
- `- [ ]` not checked, `- [x]` correct, `- [!]` wrong.
- **Failure notes go indented under the failing item**, not collected per
  scenario: markdown treats the indented line as a continuation of that list
  item, so the reader hears the note as part of the check it belongs to.
- **No pre-printed empty note slots** under every item. Forty empty «Нотатки:»
  lines are read aloud between checks during every pass and almost none get
  filled. The per-scenario «Нотатки:» line stays — it is for observations that
  belong to no single check.
- Ukrainian, second person singular, imperative («перемкнись», «переконайся»).

## Lifecycle

1. **Create** `docs/testing/nvda-<slug>.md` — same `<slug>` as the backlog record,
   committed with the fix or immediately after.
2. **Link** it from the «Manual testing» list in `AGENTS.md` and from the NVDA
   criterion inside the backlog record.
3. **Accept**: after a clean run, one commit checks the criterion, sets
   `status: done` + `completed:`, `git mv`s the record into `docs/backlog/done/`,
   moves its ROADMAP line to «Виконано», **and deletes both the checklist file and
   its AGENTS.md line** — the record in `done/` keeps the decisions; the checklist
   has done its job.

Because step 3 deletes the file, this skill is the only durable home for the
convention. Improve it here, not in the generated checklist.

## Common mistakes

| Mistake | Fix |
|---|---|
| Symmetric filling — every scenario given ~5 items | Derive from the mechanism; uneven scenario lengths are correct |
| Checks phrased as what appears on screen | Phrase as what is announced; name the exact expected wording |
| Skipping the checklist because the fix is small | The record's criteria decide, not the diff size; scale scenario count instead |
| UI strings written from memory | Read them from `uk.json`; quote exactly, including punctuation |
| Only happy paths — no scenario where the fix must NOT act | Add the negative case (item 4 above); it is where a fix's own risk lives |
| Scenario without `Навіщо:` | Either write the sentence or drop the scenario |

Prior runs in this shape: `done/p0-stream-name-disambiguation.md` (12 scenarios),
`p1-wishlist-stale-list-ref.md` (7).
