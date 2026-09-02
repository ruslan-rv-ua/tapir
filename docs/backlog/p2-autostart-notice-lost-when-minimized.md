---
slug: autostart-notice-lost-when-minimized
title: "Репліка про вимкнений автозапуск губиться при старті згорнутим"
priority: P2
type: planned
status: blocked
effort: S
kind: bug
target: 0.2.0
updated: 2026-09-02
a11y: true
depends_on: [hotkey-registration-silent-at-startup]
blocks: []
blocked_reason: "Гейт «перший показ вікна» з'являється в hotkey-registration-silent-at-startup; тут лише переїзд на нього."
touches:
  - src-tauri/src/commands/app_commands.rs
  - src-tauri/src/autostart.rs
  - src/hooks/useAutostartFeedback.ts
gates: [cargo test, pnpm test]
notes:
  - "Знахідка grilling hotkey-registration-silent-at-startup (2026-09-02): та сама діра, що й у репліки про зайняту комбінацію."
---

# Репліка про вимкнений автозапуск губиться при старті згорнутим

> **Контекст:** хвіст [hotkey-registration-silent-at-startup](p1-hotkey-registration-silent-at-startup.md),
> рішення 8. Заведено, щоб не розширювати той запис; сам переїзд — кілька рядків.

## Опис

Коли `tapir.exe` перемістили, Tapir при старті вимикає автозапуск і повідомляє про це
одноразово: `StartupNotice` → `take()` у `frontend_ready` → подія `autostart-deactivated`
→ оголошення polite і тост `info` ([useAutostartFeedback.ts](../../src/hooks/useAutostartFeedback.ts)).

Автозапуск за замовчуванням стартує згорнутим (`autostart_minimized` = true). Під
`--minimize` вікно ховається ще в setup ([lib.rs:160](../../src-tauri/src/lib.rs:160)),
`frontend_ready` спрацьовує при схованому вікні, віконний тост гасне за 4 с, а NVDA
читає live region лише переднього вікна. Отже репліка йде в порожнечу саме в тому
режимі, в якому автозапуск і працює. Людина дізнається, що автозапуск вимкнено, лише
коли Tapir наступного разу не запуститься.

Гірше: репліка **споживається** (`take()`), тож повторно не прозвучить ніколи.

## Рішення

Перевести `StartupNotice` на гейт «перший показ вікна», який заводить батьківський
запис для репліки про зайняту комбінацію: `take()` при першому показі й фокусі
головного вікна замість `frontend_ready`. Текст, тип тосту й хук не змінюються.

Гейт **витягти, а не скопіювати**: у батьківському записі він зшитий із payload
(`hotkey_busy::BusyNotice` тримає і два прапорці, і перелік комбінацій), а вираз
«вікно на передньому плані» (`is_visible && is_focused`) живе inline у
`frontend_ready`. Другий споживач — момент винести спільний тип гейта з узагальненим
payload і одну функцію «чи вікно на передньому плані»; дві копії з двома наборами
тестів — це те, що рев'ю батьківського запису назвало наперед.

## Критерії готовності

- [ ] При старті згорнутим репліка про вимкнений автозапуск звучить, коли вікно вперше
      відкрили з трею чи клавішею
- [ ] При звичайному старті поведінка не змінилась (репліка одразу після завантаження)
- [ ] Reload вебв'ю репліку не повторює
- [ ] Ручна перевірка з NVDA: старт `--minimize` з переміщеним EXE, показ із трею —
      оголошення чутно, тост видно
- [ ] `docs/help/` не змінюється: довідка вже обіцяє повідомлення, не називаючи моменту
- [ ] `cargo test`, `pnpm test` — без помилок

## Документи

- [hotkey-registration-silent-at-startup](p1-hotkey-registration-silent-at-startup.md) —
  батьківський запис, рішення 8
- [autostart](done/p2-autostart.md) — походження `StartupNotice`
- `src-tauri/src/commands/app_commands.rs`, `src-tauri/src/autostart.rs`
