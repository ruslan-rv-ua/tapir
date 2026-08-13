---
slug: reconnect-zero-retries
title: "«0 = необмежено» в перепідключенні означає «жодної спроби»"
priority: P0
type: planned
status: ready
effort: S
kind: bug
target: 0.1.0
updated: 2026-08-13
a11y: false
depends_on: []
blocks: []
touches:
  - src-tauri/src/stream/manager.rs
  - src-tauri/src/profile.rs
  - src/components/streams/StreamItem.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/help/uk/recording.md
  - docs/help/en/recording.md
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes:
  - "Знайдено 2026-08-13 під час grilling запису help-recording — при звірці дефолтів із кодом."
---

# «0 = необмежено» в перепідключенні означає «жодної спроби»

> **Контекст:** три шари застосунку описують одне число по-різному, і дефолтне значення
> потрапляє саме в розбіжність. Наслідок для користувача: типовий Tapir після обриву
> зв'язку **не відновлює запис**, хоча інтерфейс обіцяє необмежені спроби.

## Опис

`ReconnectConfig::default()` — `max_retries: 0`
([profile.rs:131](../../src-tauri/src/profile.rs:131)). Далі шари розходяться:

| Шар | Що каже про `0` |
|---|---|
| [manager.rs:618](../../src-tauri/src/stream/manager.rs:618), `:1019` | `if max_retries == 0 { break 'reconnect; }` — **жодної спроби**, запис завершується |
| `settings_max_retries_desc` (uk + en) | «0 = необмежено» / "0 = unlimited" |
| [StreamItem.tsx:166](../../src/components/streams/StreamItem.tsx:166) | при `maxRetries === 0` показує `status_reconnecting_attempt_unlimited` — «Спроба {attempt}» без стелі |

Гілка в `StreamItem.tsx` **недосяжна**: бекенд при нулі в перепідключення не заходить,
тож статус `reconnecting` із нульовою стелею не виникає ніколи. Тобто UI написаний під
семантику «необмежено», а бекенд реалізує протилежну — і дефолт стоїть саме на цьому
значенні.

Сценарій, який це ламає: запис нічного ефіру. Мережа мигнула на секунду — Tapir зупиняє
запис і не відновлює, хоча користувач нічого не налаштовував і мав підставу вважати, що
відновлення ввімкнене «необмежено».

## Рішення, яке треба ухвалити

Два несумісні напрямки — вибір за власником продукту:

- **A. `0` починає означати «необмежено»** (як обіцяють підказка і `StreamItem.tsx`).
  Правиться `manager.rs`: нуль перестає бути умовою виходу, цикл обмежується лише
  скасуванням. Дефолтна поведінка стає «відновлювати вічно з паузою до 5 хв».
- **B. `0` лишається «не перепідключатися»**, а брехливими оголошуються підказка й
  мертва гілка: `settings_max_retries_desc` → «0 — не перепідключатися», гілка
  `status_reconnecting_attempt_unlimited` і два її ключі видаляються. Тоді варто окремо
  вирішити, чи дефолт має лишатись `0`.

Не робити нічого — не варіант: сьогодні хибне будь-яке прочитання інтерфейсу.

## Критерії готовності

- [ ] Семантику `0` узгоджено між `manager.rs`, підказкою і `StreamItem.tsx` — усі три
      шари кажуть одне
- [ ] Немає недосяжних гілок: або `status_reconnecting_attempt_unlimited` рендериться в
      реальному сценарії, або ключ і гілка видалені
- [ ] Тест на семантику нуля в `manager.rs` (сьогодні її не покриває жоден)
- [ ] Оновлено `docs/help/uk/recording.md` і `docs/help/en/recording.md` — вони описують
      сьогоднішню поведінку за рішенням grilling-сесії
      [help-recording](p1-help-recording.md); після цієї правки опис стає застарілим
- [ ] `cargo test`, `cargo clippy`, `pnpm test`, `pnpm vite:build` — без помилок

## Документи

- [help-recording](p1-help-recording.md) — запис, під час якого знайдено; містить звірені
  з кодом числа перепідключення
- `src-tauri/src/stream/manager.rs` — цикл `'reconnect` і `compute_backoff_delay`
- `src/components/profile/ProfileRecordingTab.tsx` — поля налаштувань перепідключення
