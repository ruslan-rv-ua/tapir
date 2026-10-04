---
slug: play-refusals-untranslated
title: "Відмова відтворення приходить у тост англійською: тайм-аут проби й нерозібраний формат"
summary: "play_stream віддає сиру англійську прозу на тайм-аут проби й нерозібраний формат, і тост показує її в обох локалях; найчастіше — на станціях AAC+"
priority: P2
type: planned
status: draft
effort: S
kind: bug
target: 0.1.1
updated: 2026-10-04
a11y: true
depends_on: []
blocks: []
touches:
  - src-tauri/src/player/engine.rs
  - src-tauri/src/commands/player_commands.rs
  - src/lib/playRefusal.ts
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Знахідка огляду беклогу 2026-10-04 (звірка he-aac-mf-playback з HEAD a04e358). Ті самі рядки engine.rs і той самий playRefusal.ts є в тегу v0.1.0."
  - "2026-10-04: перенесено в 0.1.1 рішенням власника — kind: bug, є у відвантаженій збірці, поверхня та сама, тип IPC той самий."
---

# Відмова відтворення приходить у тост англійською: тайм-аут проби й нерозібраний формат

> **Контекст:** знахідка огляду беклогу 2026-10-04, того ж дня перенесена в 0.1.1. Режим —
> **GROOMING** (`planned` + `draft`): треба вибрати слово для тайм-ауту, бо тайм-аут — ще не
> доказ, що винен кодек.

## Опис

`play_stream` (`src-tauri/src/commands/player_commands.rs`) віддає фронтенду `e.to_string()`
усього, що поверне рушій. Стабільні коди мають лише два випадки — `unsupported_codec` і
`stream_not_found`; решта йде прозою з `anyhow`:

- тайм-аут проби — «timed out probing stream format after 15s (unsupported codec?)»
  (`src-tauri/src/player/engine.rs:764-767`);
- нерозібраний формат — «could not decode stream (unsupported format?)» (`engine.rs:756`).

`playRefusalMessage` (`src/lib/playRefusal.ts`) свідомо пропускає «все інше» як є: коментар
пояснює, що помилка з'єднання вже читається як причина. Тож людина з українським інтерфейсом
бачить і чує англійський тост із числом секунд. Найчастіше — на станціях AAC+ (HE-AAC): Tapir
їх називає й записує, а symphonia не декодує, тож кожна спроба слухати закінчується саме цим
рядком ([he-aac-mf-playback](p3-he-aac-mf-playback.md)). Довідка цей випадок описує — «AAC+
записується, але в Tapir мовчить» (`docs/help/{uk,en}/troubleshooting.md`, «Станція
записується, але не відтворюється»), — а тост, який людина бачить у ту мить, лишається неперекладеним.

## Чому це вада

- Тема 0.1.0 обіцяла повні обидві локалі, а
  [ADR про локалізацію нативного шару](../decisions/2026-08-17-native-layer-localisation.md)
  каже: нативний шар шле ключі, не прозу.
- [ADR 2026-09-06](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) §5:
  причина — закритий перелік, деталь із числами — у лозі.
  [record-refusals-untranslated](done/p2-record-refusals-untranslated.md) провів це правило для
  відмов запису; хвіст «та сама проза в `play_stream`» тоді закрили лише для `unsupported_codec`.

## Розвилка

1. **Свій код на тайм-аут** (і, можливо, окремий на нерозібраний формат) плюс ключі в обох
   локалях. Слово мусить бути чесним щодо невизначеності: тайм-аут буває й від повільної
   мережі, тож наявний `stream_play_unsupported` («Tapir не відтворює кодек цього потоку») тут
   хибив би — а `playRefusal.ts` прямо вимагає, щоб цей код не помилявся ніколи.
2. **Один код «потік не вдалося відтворити»** для обох випадків, без гадання про причину;
   деталь — у лозі, а поради дає довідка.

Межа: помилки з'єднання (reqwest) за чинним рішенням `playRefusal.ts` лишаються сирими. Якщо
грумінг вирішить, що й вони потребують коду, обсяг запису ширшає — тоді назвати це явно.

## Умова перебування в 0.1.1

Обидва варіанти лишаються всередині наявного механізму: та сама поверхня (тост відмови), той
самий тип IPC (`Result<(), String>`), додаються лише нові значення коду й ключі в обох
локалях — як у [record-refusals-untranslated](done/p2-record-refusals-untranslated.md). Якщо
грумінг розширить обсяг до нової поверхні чи зміни типу IPC (наприклад, структурованої
помилки замість рядка), запис повертається з 0.1.1 у наступну мінорну версію.

## Критерії готовності

- [ ] `docs/help/` — `troubleshooting.md` (обидві локалі), «Станція записується, але не відтворюється»:
      описати тост, який людина тепер бачить, або зазначити, що опис уже його покриває
- [ ] Обрано варіант розвилки; тайм-аут проби й нерозібраний формат приходять кодом без чисел,
      деталь лишається в лозі
- [ ] `playRefusalMessage` мапить нові коди на ключі обох локалей; тест на кожен код
- [ ] Відмова з'єднання — за обраним варіантом: або далі сира (і це записано тут), або теж код
- [ ] `cargo test`, `cargo clippy --all-targets`, `pnpm test`, `pnpm typecheck`,
      `pnpm vite:build` — без помилок
- [ ] NVDA-прогін: тост відмови на станції AAC+ читається мовою інтерфейсу

## Документи

- [he-aac-mf-playback](p3-he-aac-mf-playback.md) — де вада трапляється найчастіше
- [record-refusals-untranslated](done/p2-record-refusals-untranslated.md) — той самий клас для запису
- [ADR 2026-08-17 — локалізація нативного шару](../decisions/2026-08-17-native-layer-localisation.md)
- [ADR 2026-09-06 — помилка як діагноз](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) §5
- Код: `src-tauri/src/player/engine.rs` (`play_live`, `PROBE_TIMEOUT`),
  `src-tauri/src/commands/player_commands.rs` (`play_stream`), `src/lib/playRefusal.ts`
