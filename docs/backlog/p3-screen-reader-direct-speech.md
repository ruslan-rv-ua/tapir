# Пряме озвучення через API скрінрідера (Tolk)

- **Слаг:** `screen-reader-direct-speech`
- **Тип:** ідея
- **Стан:** draft (відкладено під сумнівом)
- **Зусилля:** S (вузька фіча, якщо колись)
- **Оновлено:** 2026-06-14
- **Залежності:** немає

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

## Промпт для агента

Каталог промптів за типом: [README — Каталог промптів](README.md#каталог-промптів-за-типом).
Тип `ідея`.
