---
slug: track-line-dangling-dash
title: "Рядок треку з висячим тире («— So What»), коли станція не передає виконавця"
summary: "станція без « - » у метаданих ефіру дає «— So What» у плеєрі, рядку потоку й журналі збігів, у треї — подвійне тире; лік — спільний trackLabel"
priority: P2
type: planned
status: ready
effort: S
kind: bug
target: 0.1.1
updated: 2026-09-24
a11y: true
depends_on: []
blocks: []
touches:
  - src/lib/playbackAnnounce.ts
  - src/components/player/PlayerPanel.tsx
  - src/components/streams/StreamItem.tsx
  - src/components/wishlist/MatchList.tsx
  - src/App.tsx
  - src-tauri/src/tray/menu.rs
  - src-tauri/src/tray/notify.rs
gates: [pnpm test, pnpm typecheck, pnpm vite:build, cargo test, cargo clippy --all-targets]
notes:
  - "Знахідка огляду архітектури 2026-09-24; розслідувач і скептик згодні, що вада справжня. Є і в 0.1.0: ті самі склейки в тегу."
---

# Рядок треку з висячим тире («— So What»), коли станція не передає виконавця

> **Контекст:** знахідка [огляду архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md).
> `planned` + `ready` → **РЕАЛІЗАЦІЯ**. Номери рядків — стан на `f09f36b`.

## Опис

Парсер метаданих ефіру ділить `StreamTitle` лише по першому « - »; без роздільника весь рядок
іде в назву, а виконавець лишається порожнім (`src-tauri/src/stream/connection.rs:385-400`,
тест `title_without_separator_has_no_artist` :430-434) — так приходять назви передач, слогани,
реклама. Це єдина напівпорожня форма: вхід обрізано, тож гілка з роздільником порожньої
половини не дає.

Правильний рендер уже є — `trackLabel` (`src/lib/playbackAnnounce.ts:103-107`), але його
кличуть лише `F9` (`describePlayback`, :165) і заголовок вікна (`src/lib/windowTitle.ts:27`).
Чотири місця фронтенду склеюють половини самі й дають «— So What», меню трея — подвійне тире.

## Як відтворити

1. Додати в профіль потік, що шле метадані ефіру без « - » (`StreamTitle='So What'`), і
   відтворити його.
2. Плеєр, другий рядок під назвою станції: «— So What». Рядок стоїть в `aria-live="polite"` —
   NVDA читає його на кожній зміні треку й коли фокус стає на цей стоп у зоні плеєра.
3. Потоки, сегмент треку в рядку потоку: «— So What»; після зупинки тьмяне «— So What», мітка
   сегмента «Востаннє грав: — So What».
4. Почати запис цього потоку (трей бачить трек лише потоку, що записується). Пункт меню трея:
   «Зараз грає: Станція —  — So What» — подвійне тире й подвійний пробіл; підказка іконки —
   «Tapir — ▶ Станція —  — So What · ● 1 запис».
5. Додати у вішліст патерн `So What`. На збігу під час запису: оголошення «Знайдено бажаний
   трек: — So What (Станція)», у журналі збігів колонка треку й мітка рядка з тим самим тире.
6. Для порівняння: `F9` каже «Станція — So What», заголовок вікна — «So What · Tapir».

Чи вимовить NVDA саме тире, залежить від рівня пунктуації (не перевірено); на екрані воно є
завжди. Факти не губляться — ламається однаковість пунктуації того самого треку.

## Що обіцяно

- Doc-коментар `trackLabel` (`src/lib/playbackAnnounce.ts:96-101`) називає його «The one way
  the app renders» пари «виконавець — назва» і прямо описує цей збій із порожнім виконавцем.
- `src/lib/windowTitle.ts:24-25`: `F9` і заголовок вікна не повинні розходитися в пунктуації
  для того самого треку.
- Сповіщення в треї порожню половину вже обробляє (`src-tauri/src/tray/notify.rs:219-224`) —
  той самий трек у тості правильний, у меню трея ні.
- [ADR про видимий носій](../decisions/2026-08-31-visible-carrier-for-announced-facts.md) §6
  **не** порушено: одна змінна на видимий і озвучений текст елемента є (у `StreamItem` тире в
  обох), а пунктуацію між поверхнями ADR не регулює. Довідка формату рядка теж не обіцяє.

## Причина

| Поверхня | Склейка | Куди йде |
|---|---|---|
| Плеєр | `src/components/player/PlayerPanel.tsx:92-94` (`trackDisplay`) | рядок :280-287 під `aria-live` :258; стоп `trackNameRef` :137 |
| Рядок потоку | `src/components/streams/StreamItem.tsx:177-179` (`trackValue`) | `trackDisplay` :185-187 → локальна `trackLabel` :188-192 → `aria-label` сегмента (:271, `src/components/common/composite-list/CompositeSegment.tsx:41`) |
| Журнал збігів | `src/components/wishlist/MatchList.tsx:52` | колонка :70, мітка `match_row` :61 |
| Оголошення збігу | `src/App.tsx:319` | `announcement_wishlist_match`, `assertive` |
| Трей | `src-tauri/src/tray/menu.rs:202-207` у `build_now_playing_label` (:180) | пункт «Зараз грає» :126-128, підказка `tooltip` :9-25 |

У треї guard (:203) пропускає трек, коли непорожня хоч одна половина, а `format!` (:204)
підставляє обидві — звідси «Станція —  — So What». Збіг вішліста з порожнім виконавцем
можливий: `build_stream_title` (`src-tauri/src/wishlist/matcher.rs:48-57`) віддає саму назву.

## Виправлення

Усередині наявного механізму: IPC, тіла подій, i18n-ключі й поверхні не змінюються.

1. `trackLabel` приймає `Pick<TrackInfo, "artist" | "title"> | null | undefined`, щоб у нього
   влазив `WishlistMatch`. Поведінка та сама.
2. `PlayerPanel.tsx:92-94` → `trackLabel(currentTrack) ?? "—"`.
3. `StreamItem.tsx:177-179` → `trackLabel(status?.currentTrack) ?? "—"`; локальну константу
   `trackLabel` (:188) перейменувати, щоб вона не затінювала імпорт.
4. `MatchList.tsx:52` і `App.tsx:319` → `trackLabel(item) ?? ""` / `trackLabel(payload) ?? ""`.
   `null` там недосяжний: без обох половин `build_stream_title` дає `None`, і збігу немає.
5. Rust: `match` із `notify.rs:219-224` винести в чисту функцію в `notify.rs` (напр.
   `track_line(artist, title) -> Option<String>`). `notify_track_change` кличе її на тому
   самому місці (`else { return }`), `build_now_playing_label` — замість guard'а й `format!`:
   `Some(track)` → `"{station} — {track}"`, `None` → сама назва станції.

## Поза межами

- Префікси рядка «Зараз грає» (подвійна двокрапка) — це
  [tray-now-playing-source-prefix](p3-tray-now-playing-source-prefix.md); туди ж огляд відносить
  і те, що без запису трей треку не показує взагалі. Тут міняється лише склейка треку в
  `build_now_playing_label`; той запис бере вже виправлений рядок.
- Один власник усього про джерело відтворення (назва, рядок треку, «чи грає цей рядок») —
  ідея [playback-source-module](p2-playback-source-module.md) з того самого огляду. Цей запис
  лише доводить `trackLabel` до всіх споживачів.
- `src/components/streams/StreamContextMenu.tsx:46-48` — не вада: склеює « - » і зрізає
  крайній роздільник, бо це заготовка патерну у форматі матчера. Хвіст
  [hotkeys-expansion](done/p2-hotkeys-expansion.md) §«Відхилення реалізації» №4 зараховує його
  помилково.
- Парсер не змінюється: порожній виконавець — законна форма, її тримає тест.

## Критерії готовності

- [ ] `docs/help/` не змінюється: формат рядка треку довідка не описує (`docs/help/en/player.md:49`, `docs/help/en/wishlist.md:9`)
- [ ] У `src/` немає склейки `` `${…artist} — ${…title}` `` поза `trackLabel` (перевірити grep'ом)
- [ ] vitest, `PlayerPanel.test.tsx`: трек `{ artist: "", title: "So What" }` дає рядок «So What» без тире
- [ ] vitest, `StreamItem.test.tsx`: той самий трек — сегмент «So What», після зупинки мітка `m.segment_track_last({ track: "So What" })`
- [ ] vitest, `WishlistPanel.test.tsx`: збіг із порожнім `artist` — колонка треку й мітка рядка без тире
- [ ] `cargo test`: юніт-тест функції з п. 5 — `("", "So What")` → «So What», `("Miles", "So What")` → «Miles — So What», `("", "")` → `None`; її кличуть і `notify_track_change`, і `build_now_playing_label`
- [ ] NVDA, рівень пунктуації «все»: потік без « - » у метаданих ефіру — рядок треку в плеєрі й сегмент у рядку потоку звучать без «тире»; пункт «Зараз грає» в треї під час запису — з одним тире
- [ ] Гейти з front-matter зелені

## Документи

- [Огляд архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md) — звідки знахідка
- [hotkeys-expansion](done/p2-hotkeys-expansion.md) §«Відхилення реалізації» №4, §«Спадок» — народження `trackLabel` і незаведений хвіст
- [tray-now-playing-source-prefix](p3-tray-now-playing-source-prefix.md) — той самий рядок трея
- [playback-source-module](p2-playback-source-module.md) — один власник рядка треку (ідея)
- [wishlist-match-invisible](done/p1-wishlist-match-invisible.md) — звідки журнал збігів і оголошення збігу
- [ADR 2026-08-31 — видимий носій](../decisions/2026-08-31-visible-carrier-for-announced-facts.md) §6 — чому ADR не порушено
- [CONTEXT.md](../../CONTEXT.md) §«Метадані ефіру», §«Вішліст і Ігнор-лист»
- Код: `src/lib/playbackAnnounce.ts`, `src-tauri/src/tray/menu.rs`, `src-tauri/src/tray/notify.rs`
