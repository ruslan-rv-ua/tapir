---
slug: minimized-start-crashes-release-build
title: "Старт із --minimize кладе release-білд одразу після запуску"
summary: "tray::notify_state_changed у гілці --minimize читає AppState до app.manage; у release (panic = abort) паніка в задачі вбиває процес"
priority: P0
type: planned
status: ready
effort: S
kind: bug
target: 0.1.1
updated: 2026-09-08
a11y: false
depends_on: []
blocks: []
touches:
  - src-tauri/src/lib.rs
  - src-tauri/src/tray/mod.rs
gates: [cargo test, cargo clippy]
notes:
  - "Знайдено 2026-09-08 при спробі пройти NVDA-чекліст autostart-notice-lost-when-minimized: випущений 0.1.0 зі scoop падав на `tapir.exe --minimize`, 5 запусків із 5."
  - "Вада жива й на develop: `lib.rs` і `tray/mod.rs` від тега `v0.1.0` не мінялись. У dev-білдах (`release-fast`, panic = unwind) паніка вбиває лише спавнену задачу, тож розробка її не бачить — видно лише в тому профілі, яким збираються релізи."
---

# Старт із --minimize кладе release-білд одразу після запуску

> **Контекст:** критичний баг випущеної 0.1.0, знайдений збоку — при підготовці
> NVDA-прогону сусіднього запису
> [autostart-notice-lost-when-minimized](p2-autostart-notice-lost-when-minimized.md).
> Корінь інший (порядок ініціалізації трея), тому запис окремий.

## Опис

`tapir.exe --minimize` на **release**-білді завершується миттєво з кодом
`0xC0000409` (`STATUS_FAIL_FAST_EXCEPTION`), не встигнувши написати жодного рядка
в лог. Ні вікна, ні значка в треї, ні сліду — з погляду людини застосунок просто
не запускається.

Виміряно 2026-09-08 на випущеній 0.1.0 (`scoop install tapir`):

- `--minimize` → падіння, 5 запусків із 5, детерміновано;
- без прапорця той самий exe стартує нормально;
- з порожньою текою `data\` падає так само — отже справа не в даних;
- `--version` повертає 0, тобто бінарник доходить до `setup`.

Причина — паніка у фоновій задачі. Перехоплений stderr:

```
thread 'tokio-rt-worker' panicked at tauri-2.10.3/src/lib.rs:740:
state() called before manage() for tapir_lib::app_state::AppState
```

Ланцюг: у `setup` гілка `--minimize` після `hide()` кличе
`tray::notify_state_changed(app.handle())`; той спавнить задачу, задача йде в
`build_snapshot` → `app.state::<AppState>()`. А `app.manage(state)` у `setup`
відбувається **пізніше** — як і `tray::setup_tray`, тож на той момент немає ні
стану, ні самого значка, який ця задача збиралась перемалювати. Виклик не просто
передчасний — він безкорисний у принципі.

Далі все вирішує профіль збірки:

- `release-fast` (розробка) — `panic = "unwind"`: паніка вбиває лише ту задачу,
  застосунок живе, у логу тиша. Тому вада не видима під час розробки;
- `release` (усі релізи) — `panic = "abort"`: та сама паніка кладе процес.

Ціна: `autostart_minimized` — дефолт автозапуску, тобто в кожного, хто ввімкнув
«Запускати разом із Windows», Tapir при вході в систему помирає мовчки. Це ж
робить неможливим будь-який ручний прогін сценаріїв «старт згорнутим» на
справжньому релізному білді.

## Рішення

1. **Прибрати передчасний виклик** із гілки `--minimize` у `lib.rs`. Меню трея
   там перемальовувати нічим і нема для чого: `setup_tray` нижче будує його з
   нуля, і його стартовий знімок уже несе `window_visible: false` — рівно те, що
   ця гілка й намагалась повідомити.
2. **Закрити клас вади, а не випадок.** `notify_state_changed` — публічна
   «вистрели й забудь» функція з десятьма викликами; при `panic = "abort"` будь-
   який виклик до `app.manage` кладе застосунок цілком. Задача має брати стан
   через `try_state` і тихо йти геть (з `log::warn!`), якщо стану ще немає.

Тестом на рівні юніту це не ловиться (потрібен живий `AppHandle`), тож доказ —
відтворення: `--minimize` на білді, зібраному з `panic = "abort"`, до фіксу падає,
після фіксу стартує, і stderr більше не містить `state() called before manage()`.

## Критерії готовності

- [ ] `tapir.exe --minimize` на release-білді стартує: вікно сховане, значок у
      треї є, лог пише звичайну стартову послідовність
      — процес і лог перевірено (див. нижче); **значок у треї лишається за оком
      людини** — єдине, чого командою не видно
- [x] stderr при старті з `--minimize` не містить `state() called before manage()`
- [x] Жоден виклик `notify_state_changed` більше не може вбити процес: стану ще
      немає — попередження в лог, не паніка
- [x] `docs/help/` не змінюється: для користувача це полагоджений запуск, а не
      нова поведінка
- [x] `cargo test`, `cargo clippy --all-targets` — без помилок

### Виміряно 2026-09-08

| Білд | `--minimize` до фіксу | після фіксу |
|---|---|---|
| Випущений 0.1.0 (`release`, `panic = abort`) | падіння `0xC0000409`, 5 із 5 | — |
| `release-fast` (`panic = unwind`) | живий, але stderr несе паніку | живий, stderr чистий |
| `release-fast` + `panic = "abort"` | — | живий, 3 із 3 |

Середній рядок і пояснює, чому вада прожила реліз: у профілі розробки видно лише
мовчазну паніку в stderr, якого в GUI-застосунку ніхто не читає.

## Документи

- [autostart-notice-lost-when-minimized](p2-autostart-notice-lost-when-minimized.md) —
  сусідній запис; його NVDA-прогін і наштовхнув на цю ваду
- [architecture.md](../architecture.md) §5.3 — порядок `setup()` і два гейти
  відкладеного мовлення
- `src-tauri/src/lib.rs` (гілка `--minimize` у `setup`), `src-tauri/src/tray/mod.rs`
  (`notify_state_changed`, `build_snapshot`)
