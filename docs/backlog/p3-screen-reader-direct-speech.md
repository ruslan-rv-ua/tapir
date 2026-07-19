---
slug: screen-reader-direct-speech
title: "Пряме озвучення через API скрінрідера (Tolk)"
priority: P3
type: idea
status: blocked
effort: S
kind: feature
target: unscheduled
updated: 2026-06-14
a11y: true
depends_on: []
blocks: []
touches: [src/components/common/LiveAnnouncer.tsx, src/stores/announcer.ts, src/hooks/useAnnounce.ts]
gates: []
blocked_reason: "тригер-gated: повернутись лише якщо balloon tips виявляться недостатніми для швидкого фідбеку на глобальні хоткеї (типово — гучність). Scope тоді — лише озвучення глобальних хоткеїв, не заміна LiveAnnouncer."
---

# Пряме озвучення через API скрінрідера (Tolk)

> **Контекст:** свідомо відкладено (вердикт запису: цінність не виправдовує вартість). Не брати без явного тригера.

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

- [accessibility.md — §11 / §15 / §1.4 / §17.1](../accessibility.md)
- Код: `src/components/common/LiveAnnouncer.tsx`, `src/stores/announcer.ts`,
  `src/hooks/useAnnounce.ts`
- Зовнішнє: `tts` crate (tts-rs), `tolk` crate (darbaga/Tolk-rs), dkager/tolk
