---
slug: data-models-doc-drift
title: "Звірити data-models.md зі станом коду"
priority: P2
type: planned
status: ready
effort: L
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: [architecture-doc-drift]
blocks: []
touches:
  - docs/data-models.md
gates: [pnpm test]
notes:
  - "Знайдено 2026-09-04 під час architecture-doc-drift: §5 виявилась не канонічним власником IPC-контракту, а близнюком §6.2 architecture.md — та сама підмножина подій і ті самі фікції."
  - "Метод уже вирішено: ADR 2026-09-04 «Документація посилається, а не цитує». Грилити метод удруге не треба, лише застосувати."
---

# Звірити data-models.md зі станом коду

> **Контекст:** третій документ у ряду `tech-stack.md` →
> [`architecture.md`](done/p2-architecture-doc-drift.md) → `data-models.md`.
> Метод не треба виводити наново: він записаний в
> [ADR 2026-09-04](../decisions/2026-09-04-docs-reference-rather-than-quote.md),
> і `data-models.md` названий у ньому як документ, на який правило поширюється.

## Опис

Знахідка зроблена не «в проході», а виміряна: `architecture.md` §6.2 збиралась
послатись на `data-models.md` §5 як на канонічного власника IPC-контракту, і
перевірка показала, що власника там немає.

### Виміряне

**Події.** Код emit-ить **28** різних подій. `data-models.md` §5 описує **18**, з них
**4 неіснуючі** (`disk-space-low`, `postprocess-started`, `postprocess-completed`,
`postprocess-error`) — тобто реально описано **14 із 28**. Це **та сама** підмножина,
яку описувала §6.2 `architecture.md`, і **ті самі** фікції: обидва тексти писались з
одного плану й жодного не оновлювали відтоді.

Не описані ніде: `player-announce`, `player-ended`, `transport-skip`,
`streams-changed`, `wishlist-changed`, `crash-resume`, `cli-feedback`, `song-deleted`,
`song-renamed`, `song-tags-updated`, `stream-import-progress`, `scheduled-skipped`,
`autostart-deactivated`, `browser-station-probe-result`.

**§5 — третя копія від руки.** TypeScript-інтерфейси в ній дублюють
[src/lib/tauri.ts](../../src/lib/tauri.ts), де лежать 13 справжніх `*Payload`, які
споживає фронтенд і перевіряє `tsc`. Копія не перевіряється нічим — і вже розійшлась:
`StreamErrorPayload` у `data-models.md` збігається з кодом, а в `architecture.md`
мала два вигадані поля.

### Що звірити

- **§5 IPC Event Payloads** — під правило ADR: зняти копію типів, лишити те, чого
  `src/lib/tauri.ts` сказати не може (коли подія летить, які інваріанти тримає).
- **§1–§3, §6 Defaults** — цитують `GlobalSettings`, `Profile`, вкладені типи й
  значення за замовчуванням. Кожне поле дрейфує окремо; `serde`-дефолти живуть у
  `src-tauri/src/profile.rs` і `settings.rs`.
- **§4 Runtime-only типи** — перетин з `architecture.md` §2/§7; перевірити, що
  власник один.
- **§7 Міграція даних** — звірити з реальністю: AGENTS.md каже «no migrations,
  no backward-compatibility guarantees».
- **§8–§9** (`state.json`, `hotkeys-reported.json`) — наймолодші секції, найімовірніше
  найточніші; звірити й переконатись.

Зміна поведінки не входить.

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] Жодна секція не містить копії типів, полів або дефолтів, які вже є в коді
- [ ] Кожен вцілілий вказівник веде або в код, або в звірений документ
- [ ] Опису неіснуючих подій і підсистем немає
- [ ] Рядок «Звірено з кодом» у шапці
- [ ] `pnpm test` зелений, зокрема сторож шляхів у `docsLinks.test.ts`

## Документи

- [data-models.md](../data-models.md) — документ, що звіряється
- [ADR: документація посилається, а не цитує](../decisions/2026-09-04-docs-reference-rather-than-quote.md)
- [architecture-doc-drift](done/p2-architecture-doc-drift.md) — запис, під час якого знайдено
- код: `src/lib/tauri.ts`, `src-tauri/src/profile.rs`, `src-tauri/src/settings.rs`
