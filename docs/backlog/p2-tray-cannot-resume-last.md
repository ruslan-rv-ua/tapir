---
slug: tray-cannot-resume-last
title: "Пункт трея сірий, коли `Ctrl+Shift+K` уміє відновити останнє джерело"
priority: P2
type: planned
status: draft
effort: S
kind: bug
target: 0.3.0
updated: 2026-09-03
a11y: true
depends_on: [tray-toggle-label-vs-action]
blocks: []
touches:
  - src-tauri/src/tray/menu.rs
  - src-tauri/src/tray/mod.rs
  - src-tauri/src/tray/handlers.rs
  - src-tauri/src/playback_control.rs
  - docs/help/uk/background.md
  - docs/help/en/background.md
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes:
  - "Знахідка grilling tray-toggle-label-vs-action (2026-09-03). Розвилки НЕ закриті — грилити перед кодом."
  - "Хронологія: .enabled() з f9248f2 (2026-05-28), ResumeLast з ea6995c (2026-07-17) — трей після цього не переглядали."
  - "Доккоментар handlers.rs уже описує шлях cold=resume-last, який із трея недосяжний."
---

# Пункт трея сірий, коли `Ctrl+Shift+K` уміє відновити останнє джерело

> **Контекст:** знахідка під час grilling
> [tray-toggle-label-vs-action](done/p2-tray-toggle-label-vs-action.md). Запис **не огрилено** —
> розвилки внизу відкриті.

## Опис

Головний пункт відтворення в меню трея вимкнено, коли нічого не грає:

```rust
.enabled(!matches!(snap.player_state, PlaybackState::Stopped))
```
([menu.rs:78](../../src-tauri/src/tray/menu.rs:78))

Але той самий жест із клавіатури в тому самому стані **працює**: `decide_toggle(None, …)`
віддає `ToggleAction::ResumeLast` ([playback_control.rs:78](../../src-tauri/src/playback_control.rs:78)),
і `Ctrl+Shift+K` на холодну вмикає останнє джерело — потік із профілю або файл із позиції.

Код це навіть **документує як спільну поведінку**: «Same entry point as `Ctrl+Shift+K`:
stream=stop, file=pause/resume, **cold=resume-last**, shared debounce»
([handlers.rs:36](../../src-tauri/src/tray/handlers.rs:36)). Гілка `cold=resume-last` із трея
недосяжна — пункт, який мав би її запустити, вимкнений.

Це не збіг, а хронологія: рядок з `.enabled()` — з `f9248f2` (2026-05-28), `ResumeLast` — з
`ea6995c` (2026-07-17). Трей після появи відновлення не переглядали.

## Чому окремим записом

Батьківський запис лікує **розходження слова й дії**: мітка обіцяє паузу там, де дія зупиняє.
Тут слово не бреше — «Грати» сказало б правду, якби пункт був активний. Бракує **самої дії**:
це прогалина в можливості, а не неправда.

Різні класи дефекту, різне приймання — там треба довести, що меню каже правильні слова, тут —
що відновлення справді стартує потрібне джерело при схованому вікні.

## Що вже відомо

- Після батьківського запису знімок меню несе `MenuPlayback { Idle, Live, FilePlaying,
  FilePaused }`, а рішення про пункти живе в чистій `playback_items` з табличним тестом.
  Шов для цього запису готовий: `Idle` розпадається на два стани — «є що відновити» і «немає».
- Чи є що відновлювати, видно з `profile.player_session` — сьогодні в знімку меню його немає.
  `decide_cold_start` уже вміє відповісти на це питання
  ([playback_control.rs:93](../../src-tauri/src/playback_control.rs:93)), але робить це
  всередині `resume_last`, після натискання, а не до побудови меню.
- `resume_last` спілкується **через вебв'ю**: `emit_announce(app, "connecting" | "error", …)`
  ([playback_control.rs:293](../../src-tauri/src/playback_control.rs:293)). Із трея вікно
  зазвичай сховане, і ці репліки нікуди не потраплять.

## Розвилки, які треба закрити грилінгом

1. **Чи трей узагалі відновлює останнє.** Альтернатива — свідомо лишити сірим і записати,
   що холодний старт належить клавіатурі, а трей керує лише тим, що вже грає. Тоді треба
   виправити доккоментар `handlers.rs`, який обіцяє протилежне.
2. **Що бачить людина, коли відновлювати нічого.** Сірий пункт «Грати», відсутній пункт, або
   активний пункт, що відповість поясненням.
3. **Зворотний зв'язок при схованому вікні.** За [ADR 2026-09-01](../decisions/2026-09-01-response-surfaces-ear-window-system.md)
   на вдалий старт відповідає саме вухо — звук пішов, і більше нічого не винні. Але
   `ColdStart::Unavailable` (потік видалено з профілю, файл переміщено) і помилка з'єднання
   сьогодні йдуть у вебв'ю, якого не видно: це випадок «вікно не сфокусоване» → нативний тост.
4. **Довідка.** Речення про меню значка правиться батьківським записом («не показуються або
   лишаються неактивними»); цей запис міняє його ще раз.

## Критерії готовності

- [ ] Рішення про сірий пункт ухвалено й записано (розвилка 1)
- [ ] `playback_items` лишається чистою й вичерпною; новий стан названо в табличному тесті
- [ ] Доккоментар `handlers.rs` описує рівно ті шляхи, які з трея досяжні
- [ ] Відмова й помилка при схованому вікні мають поверхню (розвилка 3)
- [ ] `docs/help/` оновлено в обох локалях
- [ ] `cargo test`, `cargo clippy`, `pnpm test`, `pnpm vite:build` зелені

## Документи

- [tray-toggle-label-vs-action](done/p2-tray-toggle-label-vs-action.md) — звідки знахідка; дає шов `MenuPlayback` / `playback_items`
- [resume-last-playback](done/p1-resume-last-playback.md) — звідки взявся `ResumeLast`
- [ADR 2026-09-01](../decisions/2026-09-01-response-surfaces-ear-window-system.md) — вибір поверхні фонового відгуку
- Код: `src-tauri/src/tray/menu.rs`, `src-tauri/src/tray/handlers.rs`,
  `src-tauri/src/playback_control.rs`
