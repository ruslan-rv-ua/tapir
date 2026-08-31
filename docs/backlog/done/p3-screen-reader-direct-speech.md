---
slug: screen-reader-direct-speech
title: "Пряме озвучення через API скрінрідера (Tolk)"
priority: P3
type: idea
status: done
effort: S
kind: feature
target: unscheduled
updated: 2026-08-17
completed: 2026-08-17
a11y: true
depends_on: []
blocks: []
touches: [src/components/common/LiveAnnouncer.tsx, src/stores/announcer.ts, src/hooks/useAnnounce.ts]
gates: []
---

# Пряме озвучення через API скрінрідера (Tolk)

> **Контекст:** **відхилено 2026-08-17** — запис закрито, а не відкладено. Тригер
> повернення (нижче) знято: умовного «якщо balloon tips виявляться недостатніми»
> більше не існує. Читати як зафіксоване рішення проти нативного SR-API.

## Рішення: відхилено (2026-08-17)

Розробник відмовився від ідеї. Раніше запис стояв `blocked` із тригером — тепер
тригера немає: `blocked_reason` вилучено, повернення не передбачене.

**Що це закріплює назавжди:**

- Озвучення в застосунку йде **лише** через `aria-live` (`LiveAnnouncer`) плюс tray
  balloon tips для фонового шару. Третьої поверхні мовлення не буде.
- **Нативної DLL поруч із EXE не буде** — «portable single EXE» лишається інваріантом,
  а LGPL-комплаєнс (Tolk + NVDA Controller Client) і крос-SR тести не входять у проєкт.
- Narrator лишається читачем першого класу: гібрид «SR з контролерним API → Tolk,
  решта → aria-live» відпадає разом із записом.

**Наслідок для чинної черги:** [sound-hotkeys-feedback-announce-only](p1-sound-hotkeys-feedback-announce-only.md)
(P1, 0.1.0) втрачає резервний вихід «а швидкий фідбек колись озвучимо напряму». Тепер
видима поверхня у вікні — **єдина** можлива відповідь на «клавіша нічого не робить»,
і політика тостів, яку той запис ухвалює, є остаточною, а не проміжною.

## Опис

Озвучувати транзитні оголошення (`accessibility.md §11`) напряму через API
скрінрідера (Tolk / `tts-rs`) замість/на додачу до `aria-live`. Навіяно
accessible_output2 / Tolk / VocaBraille.

**Вердикт: відкладено** — цінність не виправдовує вартість.

## Чому відкладено

- `aria-live` (`LiveAnnouncer`) працює; задокументовані болі (модальний хак
  `§1.4`, перегони старту `§17.1`) **вже** полагоджені workaround'ами. Ідея
  полірує робоче, а не лагодить зламане.
- Єдине, чого `aria-live` не вміє — говорити, коли вікно не у фокусі (фон/трей +
  глобальні хоткеї). Але це **вже** дешево покрито tray balloon tips (`§15`), які
  NVDA озвучує автоматично, без жодної нативної DLL.
- Вартість висока як на marginal-цінність: нативна DLL поруч з EXE (рве «single
  EXE»), LGPL-комплаєнс (Tolk + NVDA Controller Client), FFI, крос-SR тести,
  регрес Narrator (немає controller-API → SAPI/тиша), втрата SR review-буфера.

## Тригер повернення

Повертатись **лише якщо** реальне користування покаже, що balloon tips недостатні
для швидкого повторюваного фідбеку на глобальні хоткеї (типово — гучність: спам
нотифікацій vs чистий `output(interrupt)` «85%»). І тоді scope — **тільки** ця
вузька фіча (озвучення глобальних хоткеїв), а **не** заміна `LiveAnnouncer`.

## Якщо колись робити

- Бібліотека: `tts` crate (tts-rs) з feature `tolk` — один API: SR через Tolk +
  WinRT/SAPI fallback; альтернатива — `tolk` crate напряму заради
  `detect_screen_reader()`.
- Модель — **гібрид**: SR з контролерним API → Tolk; Narrator / без SR → лишити
  `aria-live`. Повну заміну `aria-live` не робити (втрата Narrator, review-буфера,
  налаштувань verbosity, DOM-fallback, автотестів).
- Місце — Rust-бекенд (backend-first); фронт кличе Tauri-команду.

## Документи

- [accessibility.md — §11 / §15 / §1.4 / §17.1](../../accessibility.md)
- Код: `src/components/common/LiveAnnouncer.tsx`, `src/stores/announcer.ts`,
  `src/hooks/useAnnounce.ts`
- Зовнішнє: `tts` crate (tts-rs), `tolk` crate (darbaga/Tolk-rs), dkager/tolk
