---
slug: error-state-never-reaches-ui
title: "Стан «помилка» не доходить до інтерфейсу: фільтр і метрика збоїв мертві"
priority: P1
type: planned
status: ready
effort: M
kind: bug
target: 0.1.0
updated: 2026-09-06
a11y: true
depends_on: []
blocks: [stream-failure-tray-toast]
touches:
  - src-tauri/src/stream/manager.rs
  - src/App.tsx
  - src/components/streams/StreamsPanel.tsx
  - src/components/streams/StreamItem.tsx
  - src/stores/streams.ts
  - src/lib/tauri.ts
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/help/uk/streams.md
  - docs/help/en/streams.md
gates: [cargo test, cargo clippy --all-targets, pnpm test, pnpm typecheck, pnpm vite:build]
notes:
  - "Знайдено NVDA-прогоном zone-vanishes-under-focus-audit (2026-09-05): сценарій «зроби помилку й перевір фільтр» виявився непрохідним, бо стану «помилка» потік не набуває взагалі."
  - "Grooming 2026-09-06 закрив усі п'ять відкритих питань і ще два, що з них виросли. Рішення — ADR 2026-09-06 error-is-the-diagnosis-attention-is-the-bucket. Нативна плашка відщеплена в окремий запис."
---

# Стан «помилка» не доходить до інтерфейсу: фільтр і метрика збоїв мертві

> **Контекст:** знахідка NVDA-прогону
> [zone-vanishes-under-focus-audit](done/p2-zone-vanishes-under-focus-audit.md) — там сценарій 3
> знято як недосяжний саме через це. Grooming проведено 2026-09-06; **рішення читати в
> [ADR](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md)**, цей
> запис лишає за собою обсяг і критерії приймання.

## Опис

`StreamState` оголошує `"error"`, фронтенд його обробляє, фільтр і метрика на нього
розраховані — але бекенд його **ніколи не надсилає**, а власний внутрішній `Error` затирає
раніше, ніж хтось устигне прочитати.

Ланцюг, звірений з кодом:

1. **Бекенд шле рівно чотири статуси.** Усі виклики `emit_recording_status` несуть
   `connecting`, `reconnecting`, `recording` або `stopped`. Значення `error` не шле ніхто.
2. **Внутрішній `Error` живе мікросекунди.** При невдалому з'єднанні `update_state_error`
   виставляє `StreamState::Error`, але одразу за ним стан затирає або `mark_reconnecting`
   (якщо лишились спроби), або фінальне прибирання `recording_task`: воно ставить `Idle`
   і викидає запис із менеджера зовсім.
3. **Подія `stream-error` статусу не міняє** — [App.tsx](../../src/App.tsx) лише показує тост.

Наслідки, кожен спостережуваний:

- **Фільтр «З помилками» не збігається ні з чим** — [streams.ts](../../src/stores/streams.ts)
  шукає `state === "error"`. Чіп завжди показує 0.
- **Метрика «Потребує уваги» завжди каже «Немає збоїв»** —
  [StreamsPanel.tsx](../../src/components/streams/StreamsPanel.tsx) рахує той самий стан.
- **Мертвий код озвучення.** [App.tsx](../../src/App.tsx) має гілку `payload.status === "error"`,
  яка каже `m.connection_error()` з пріоритетом `assertive`. Умова не буває істинною ніколи,
  тож найгучнішу репліку застосунку не чув жоден користувач.
- **Сегмент стану в рядку для `error` гілки не має зовсім** — падає в запасну й каже
  «Очікування». Тобто рядок звучав би «Помилка, Станція… Очікування».

**Межа, щоб запис не перебільшував.** Поки спроби тривають, рядок **не** мовчить: він
показує «Перепідключення…». Мовчання починається там, де спроби скінчились: за
замовчуванням їх десять зі зростаючою паузою (≈40 хв), після чого потік стає `idle` і
зникає з менеджера — жодного сліду, що він узагалі падав.

## Ухвалені рішення

Grooming 2026-09-06. Обґрунтування, відхилені варіанти й межі — в
[ADR](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md); тут
лише перелік, щоб реалізатор бачив обсяг одним поглядом.

1. **«Перепідключення» — процес, «помилка» — діагноз** (§1). `Error` настає один раз, на
   виході циклу `'reconnect` без успіху.
2. **Відро зветься «Потребує уваги» і рахує обидва стани** (§2). Чіп-фільтр
   перейменовується з «З помилками»; значення метрики рахує **потоки**, не збої.
3. **Позначку тримає дзеркало `$statuses`, не менеджер** (§3). `entries.remove`
   лишається; знімає позначку наступна подія, перемикання профілю або перезапуск.
4. **Репліка `polite`, одна на потік; проміжні тости знято** (§4). Свідома ціна —
   перший обрив не звучить зовсім.
5. **Причина — закритий перелік із двох значень** (§5), їде мертвим сьогодні полем
   `error` події `recording-status`; заповнює сегмент стану в рядку.
6. **Нативна плашка при згорнутому вікні — окремим записом** (§6),
   [stream-failure-tray-toast](p2-stream-failure-tray-toast.md).
7. **Відмова за непідтримуваним кодеком у відро не входить** (§7).

## Критерії готовності

- [ ] `docs/help/uk|en/streams.md` — фільтр названо новим ім'ям, і сказано, що він показує
      і тих, хто ще перепідключається; абзац про розбір імпортованого списку звірено
- [ ] `docs/help/uk|en/recording.md` — звірено: обіцянка «коли спроби вичерпано… рядок
      показує помилку» стала правдою, тексту правити не треба
- [ ] Тест, що падає на невиправленому коді: потік, чиє з'єднання не вдалося і спроби
      вичерпано, доходить до `error` з причиною — і бекенд, і дзеркало
- [ ] Фільтр і метрика — **один** предикат (`error` або `reconnecting`), і він покритий
      тестом на обох станах; метрика рахує потоки
- [ ] Сегмент стану в рядку для `error` каже причину, а не «Очікування»
- [ ] Гілка `payload.status === "error"` в `App.tsx` оживлена, пріоритет `polite`
- [ ] Проміжних тостів на кожну невдалу спробу немає; тост у момент поразки є
- [ ] Причина їде закритим переліком, не сирим рядком; технічний текст лишається в логах
- [ ] Тест: відмова за непідтримуваним кодеком у відро **не** потрапляє
- [ ] `cargo test`, `cargo clippy --all-targets`, `pnpm test`, `pnpm typecheck`,
      `pnpm vite:build` — без помилок
- [ ] NVDA-прогін: поразку чутно, репліка нічого не перебиває, рядок і метрика читаються
      узгоджено; чекліст за скілом `writing-nvda-checklists`

## Документи

- [ADR 2026-09-06](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) — рішення grooming'у
- [CONTEXT.md](../../CONTEXT.md) §«Поразка і потреба в увазі» — словник
- [p2-zone-vanishes-under-focus-audit.md](done/p2-zone-vanishes-under-focus-audit.md) — прогін, що це знайшов
- [p2-stream-failure-tray-toast.md](p2-stream-failure-tray-toast.md) — відщеплена нативна поверхня
- [p2-reconnect-counter-not-live.md](p2-reconnect-counter-not-live.md) — сусідня вада того ж
  вузла; цим записом **не** закривається
- [ADR 2026-08-13](../decisions/2026-08-13-reconnect-attempt-semantics.md) — семантика спроби
- [ADR 2026-09-01](../decisions/2026-09-01-response-surfaces-ear-window-system.md) — вибір поверхні відгуку
- код: [manager.rs](../../src-tauri/src/stream/manager.rs), [App.tsx](../../src/App.tsx),
  [StreamsPanel.tsx](../../src/components/streams/StreamsPanel.tsx),
  [StreamItem.tsx](../../src/components/streams/StreamItem.tsx),
  [streams.ts](../../src/stores/streams.ts)
