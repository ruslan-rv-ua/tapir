---
slug: tauri-ts-type-drift
title: "Дрейф ручних типів tauri.ts проти Rust: track-changed із плеєра без ignored і ще 11 розбіжностей"
priority: P2
type: planned
status: draft
effort: S
kind: bug
target: 0.1.0
updated: 2026-09-05
a11y: false
depends_on: [tauri-specta-bindings]
blocks: []
touches:
  - src/lib/tauri.ts
  - src/App.tsx
  - src-tauri/src/player/engine.rs
  - src-tauri/src/stream/manager.rs
  - src-tauri/src/profile.rs
  - src-tauri/src/browser/types.rs
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm vite:build, pnpm typecheck]
notes:
  - "Знахідка дослідження tauri-specta-bindings (2026-09-05): аудит 67 типів tauri.ts проти Rust, поле в поле. Повна таблиця з номерами рядків станом на 869154c — docs/notes/tauri-specta-bindings.md, розділ «DTO: ручний файл проти Rust»."
  - "Draft, бо для єдиної справжньої розбіжності не обрано, хто рахує ignored для треку з плеєра — див. «Відкриті питання». Пункти 2–12 механічні й розвилки не мають."
---

# Дрейф ручних типів tauri.ts проти Rust: track-changed із плеєра без ignored і ще 11 розбіжностей

> **Контекст:** знахідка дослідження
> [tauri-specta-bindings](done/p3-tauri-specta-bindings.md) (2026-09-05). Міграцію на
> генератор відхилено, поки крейт у RC, але аудит ручних типів залишив перелік
> розбіжностей, і одна з них — жива вада. Читати першим: розділ «DTO: ручний файл
> проти Rust» у [нотатці дослідження](../notes/tauri-specta-bindings.md).

## Опис

Подію `track-changed` шлють два емітери з різними тілами. Менеджер запису
([manager.rs](../../src-tauri/src/stream/manager.rs)) кладе в неї `ignored: bool` —
кваліфікатор «ігнорується», з якого `StreamItem` збирає живий рядок треку. Плеєр
([engine.rs](../../src-tauri/src/player/engine.rs)) шле локальну структуру без цього
поля. TS-тип `TrackChangedPayload` у [tauri.ts](../../src/lib/tauri.ts) описує поле як
обов'язкове, а `handleTrackChanged` в [App.tsx](../../src/App.tsx) переписує
`currentTrack.ignored` значенням із події. Коли потік одночасно записується і грає,
останній емітер вирішує, чи стоїть кваліфікатор у рядку: подія плеєра стирає його
значенням `undefined`. Це єдина з дванадцяти розбіжностей, яку читає код. Чи справді
кваліфікатор зникає з екрана, не відтворювалось — перший крок реалізації саме це.

Решта одинадцять — звуження, приховані `null` і латентні пастки. Жодна сьогодні не
ламає рантайм, але кожна означає, що `tauri.ts` описує не те, що шле Rust:

| # | Тип у `tauri.ts` | Rust | Клас |
|---|---|---|---|
| 2 | `RecordingStatusPayload.error?: string` | `Option<String>` без `skip_serializing_if` — завжди `"error": null` | `?:` замість `\| null` |
| 3 | `StreamState` має `"stopped"` | enum `StreamState` його не має; `"stopped"` існує лише як рядок у `RecordingStatusPayload.status` | одна унія на дві форми |
| 4 | `RecordingStatusPayload.status: StreamState` | `status: String` | звуження |
| 5 | `Profile.playerSession` | Rust `PlayerSession` має ще `last_active` | TS не описує поле |
| 6 | `Profile.savedTracks: unknown[]` | `Vec<SavedTrack>` | розхлябаність |
| 7 | `UiSettings.streamSort: "name" \| "added"` | `stream_sort: String` (рядок навмисно, є коментар) | звуження |
| 8 | `PlaybackAnnounce.kind` — унія з 5 літералів | `kind: String` | звуження |
| 9 | `ImportProgressPayload.status` — унія | `status: String` | звуження |
| 10 | `ScheduledCompletedPayload.status` — 3 варіанти | `ScheduleResultStatus` — 5 | неповна унія |
| 11 | `FilterItem`, `BrowserFilters` | структури без `rename_all` ([browser/types.rs](../../src-tauri/src/browser/types.rs)); збіг лише тому, що всі ключі однослівні | латентна: перше двослівне поле зламає TS мовчки |
| 12 | `volumeStepPercent`, `days`, `SearchParams.*`, `RecordingSettings.*` — `number` | `u8` / `Vec<u8>` / `u32` | від'ємне чи дробове відкине serde на `invoke`, а не клампне |

Для звужень (4, 7–10) є два чесні напрями: підняти Rust до enum'у, щоб звуження стало
правдою з обох боків, або розширити TS до `string`. Вибір — за полем: де є споживач,
який гілкується за значенням, потрібен enum.

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює: кваліфікатор «ігнорується» у
      рядку вже описаний, запис лише повертає йому надійність
- [ ] Відтворено або спростовано зникнення кваліфікатора при одночасному записі й
      відтворенні одного потоку; результат записано в цьому записі
- [ ] Обидва емітери `track-changed` шлють одне тіло з одного `struct` — одна структура в
      одному модулі, не дві локальні копії
- [ ] `TrackChangedPayload` у TS збігається з тим `struct` поле в поле
- [ ] Пункти 2–12 закриті кожен одним із двох напрямів; рішення по кожному названо в
      записі при закритті
- [ ] `FilterItem` і `BrowserFilters` дістають `#[serde(rename_all = "camelCase")]`
      (пункт 11), навіть якщо сьогодні всі ключі однослівні
- [ ] Сторож для класу 1 (обидва емітери — одна структура): тест або обґрунтування в
      записі, чому сторожа немає
- [ ] Ворота з `gates:` зелені

## Відкриті питання

- Хто рахує `ignored` для треку, що прийшов із плеєра? Список ігнорування живе в
  менеджері запису; плеєр його не бачить. Варіанти: (а) плеєр дістає ту саму перевірку
  і шле повний payload; (б) плеєр не шле `track-changed` для потоку, який зараз
  записується, і кваліфікатор лишається за менеджером; (в) поле стає
  `ignored?: boolean`, а обробник зберігає попереднє значення, коли поля немає —
  найдешевше, але це та сама тиша, яку запис має прибрати. Потрібен grooming.
- Чи потрібен сторож дрейфу ширший за один тип — «третій шлях» у нотатці (ts-rs, лише
  типи, ≈ 2–3 дні). Це окреме рішення, не частина цього запису.

## Документи

- [Нотатка дослідження](../notes/tauri-specta-bindings.md) — повна таблиця, номери
  рядків станом на `869154c`
- [tauri.ts](../../src/lib/tauri.ts), [App.tsx](../../src/App.tsx),
  [StreamItem.tsx](../../src/components/streams/StreamItem.tsx) — споживачі
- [engine.rs](../../src-tauri/src/player/engine.rs),
  [manager.rs](../../src-tauri/src/stream/manager.rs),
  [browser/types.rs](../../src-tauri/src/browser/types.rs) — емітери й структури
- [ADR 2026-08-31: видимий носій](../decisions/2026-08-31-visible-carrier-for-announced-facts.md)
  — чому кваліфікатор мусить стояти в самому рядку
