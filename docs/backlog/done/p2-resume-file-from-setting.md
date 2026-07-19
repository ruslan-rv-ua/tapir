---
slug: resume-file-from-setting
title: "Налаштування «відновлювати файл з позиції / з початку»"
priority: P2
type: planned
status: done
effort: S
kind: feature
target: 0.2.0
updated: 2026-07-18
completed: 2026-07-18
a11y: true
depends_on: [playback-toggle-stop-pause]
blocks: []
touches: [src-tauri/src/settings.rs, src-tauri/src/shortcuts.rs, src/components/settings]
gates: [cargo test, cargo clippy, pnpm test, pnpm vite:build]
notes: ["реалізовано у feature/p2-resume-file-from"]
---

# Налаштування «відновлювати файл з позиції / з початку»

> **Контекст:** виконано, реалізовано у `feature/p2-resume-file-from`. Адитивне scoped-покращення поверх [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md).

## Опис

[playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md) запроваджує resume останнього: cold-start `Ctrl+Shift+K` відновлює останній файл **з збереженої позиції** (`last_file_position.position_ms`). Цей запис додає **користувацький вибір**, чи це cold-start-відновлення стартує з позиції чи з початку файлу.

**Чому це реальний вибір.** Розкол уподобань за довжиною/типом: 2-годинний запис ефіру / подкаст → продовжити з 40-ї хвилини; 4-хвилинна пісня → радше з початку. Один глобальний дефолт не вгодить обом.

**Чому це окремий P2, а не частина P1.** Чисто **адитивне, нульовий ризик переробки**: позиція (`position_ms`) персиститься **завжди**, незалежно від цього перемикача (рішення №7 у [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md)). Тож додати його = лише «прочитати прапорець перед seek»; нічого з базового запису не переписується. Тримає базовий запис вузьким; кожен пункт у Settings для NVDA-застосунку — навігаційна поверхня + рядки i18n + лейбли + тести.

## Рішення / дизайн (уже узгоджено)

| Аспект | Рішення |
|---|---|
| Форма | Глобальний enum **`resume_file_from: position \| start`**, default **`position`**. Бінарний, не поріг — тут так зрозуміліше. |
| Місце | `GlobalSettings`, поруч із `auto_advance` / `prev_restart_threshold_ms` / `double_click_action` ([settings.rs:30-55](../../../src-tauri/src/settings.rs#L30-L55)) — кластер поведінки плеєра вже є. Global, не per-profile (як `auto_advance`). |
| Скоуп | **ТІЛЬКИ cold-start / `Stopped→K` resume-гілка.** **НЕ** чіпати `pause→resume` у межах сесії — там завжди з позиції (це семантика паузи; «з початку» зламало б її). Зафіксувати явно, щоб перемикач випадково не змінив поведінку паузи. |
| NVDA | Коли resume з позиції — анонс містить позицію («Відтворення — <трек>, з 12:30»), щоб старт «із середини» не був сюрпризом. |

## Деталі реалізації

- Додати поле в `GlobalSettings` + `default_resume_file_from()` + `#[serde(default = ...)]` (back-compat: старий `settings.json` без поля → `position`). Узгодити з тестами серіалізації в [settings.rs](../../../src-tauri/src/settings.rs#L291).
- Cold-start-гілка `Ctrl+Shift+K` (з [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md), [shortcuts.rs](../../../src-tauri/src/shortcuts.rs)): прочитати прапорець → `play_file(path)` + `seek(position_ms)` (mode `position`) або старт з 0 (mode `start`).
- UI: перемикач/radio у **AudioTab → секція «Керування плеєром» (`player_controls`)**, поруч із `auto_advance` ([AudioTab.tsx:138](../../../src/components/settings/AudioTab.tsx#L138)) і `prev_restart_threshold_ms` ([AudioTab.tsx:150](../../../src/components/settings/AudioTab.tsx#L150)) — спільний кластер resume/advance. **Не** GeneralTab: там у окремій секції «Поведінка» живе лише `double_click_action` ([GeneralTab.tsx:172](../../../src/components/settings/GeneralTab.tsx#L172)) — це поведінка взаємодії зі списком, інший клас. i18n EN/UK + NVDA-лейбл.
- Лишити enum, а не bool — на випадок майбутнього третього варіанту (найімовірніше «питати» — як `Never/Ask/Always` для «Continue playback» у VLC — а не «за довжиною»), хоча зараз лише два.

## Критерії готовності

- [x] `resume_file_from` у `GlobalSettings`, default `position`; старий `settings.json` без поля вантажиться (back-compat тест)
- [x] Cold-start K, mode `position` → файл з `position_ms`; mode `start` → з 0
- [x] `pause→resume` у межах сесії **не зачеплено** (завжди з позиції) — регресійний guard
- [x] Перемикач у Settings + i18n EN/UK + коректний NVDA-лейбл, доступний з клавіатури
- [x] `cargo test` + `cargo clippy` зелені; `pnpm test` + `pnpm vite:build` зелені

## Відкриті питання

_Закрито 2026-06-25 (аудит коду + рішення)._

- ✅ **Tab — AudioTab, секція «Керування плеєром» (`player_controls`)**, поруч із `auto_advance` ([AudioTab.tsx:138](../../../src/components/settings/AudioTab.tsx#L138)) і `prev_restart_threshold_ms`. Припущення «GeneralTab» було хибним: у коді `auto_advance` живе в AudioTab, а `double_click_action` — окремо в GeneralTab → «Поведінка» ([GeneralTab.tsx:172](../../../src/components/settings/GeneralTab.tsx#L172)); вони **не** в одному табі. `resume_file_from` належить до кластера resume/advance → AudioTab.
- ✅ **«За довжиною» (поріг хвилин) — ні (фінально).** Поріг лише ховає рішення (магічне число, яке саме треба налаштовувати) і ламає передбачуваність для NVDA (незрячий не бачить тривалості → старт «із середини» дезорієнтує); до того ж потребує знати повну тривалість файлу до seek. Бінарний enum `position|start` лишається; back-compat-двері для 3-го варіанту відчинені — найімовірніший кандидат «питати» (`Never/Ask/Always`, як VLC), а не «за довжиною».

## Документи

- Залежить від: [playback-toggle-stop-pause](p1-playback-toggle-stop-pause.md)
- Код: [src-tauri/src/settings.rs](../../../src-tauri/src/settings.rs) (`GlobalSettings` + тести), [src-tauri/src/shortcuts.rs](../../../src-tauri/src/shortcuts.rs) (cold-start-гілка), [src/components/settings/](../../../src/components/settings/)
- [docs/data-models.md](../../data-models.md) (GlobalSettings), [docs/accessibility.md](../../accessibility.md) (Settings/NVDA)
