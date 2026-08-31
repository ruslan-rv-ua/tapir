---
slug: accessibility-doc-audit
title: "Звірити accessibility.md зі станом коду"
priority: P2
type: planned
status: ready
effort: M
kind: chore
target: 0.1.0
updated: 2026-08-31
a11y: false
depends_on: []
blocks: []
touches:
  - docs/accessibility.md
gates: []
notes:
  - "Знайдено 2026-08-13 під час grilling запису help-recording: розділ 3.1 описує SearchField, якого в коді немає."
  - "2026-08-31 (реалізація sound-hotkeys-feedback-announce-only): розділи 4.3 і 4.4 — теж задум, не код. Деталі в тілі запису; звіряти при аудиті, окремо не відкривати."
---

# Звірити accessibility.md зі станом коду

> **Контекст:** `docs/accessibility.md` описує структуру екранів у ролях ARIA й служить
> опорою для NVDA-чеклістів. Принаймні один його розділ описує проєкт, а не реалізацію,
> і суперечить сам собі — тому документу не можна вірити без звірки.

## Опис

Знайдені розбіжності (розділ 3, екран «Потоки»):

- [accessibility.md:200](../accessibility.md:200) малює `SearchField (aria-label="Пошук
  потоків", Ctrl+F)`. **Такого елемента немає** — у `StreamsPanel.tsx` немає ні поля, ні
  стану запиту, ні `Ctrl+F` у `SHORTCUTS`. Слідами задуму лишилися два мертві ключі
  (`streams_search_label`, `zone_streams_toolbar`), які видаляє
  [help-recording](done/p1-help-recording.md).
- Той самий розділ описує список як `role="grid"` із `columnheader`, тоді як абзацом вище
  документ каже `role="application"` / `listitem`. **Документ суперечить сам собі**, і
  правильний варіант — другий.

Знайдені розбіжності (розділи 4.3 «Volume Slider» і 4.4 «Playback Position»), додано
2026-08-31 під час реалізації [sound-hotkeys-feedback-announce-only](done/p1-sound-hotkeys-feedback-announce-only.md):

- Обидва ескізи малюють `formatOptions` як спосіб задати текст значення. Для гучності
  наведений `{ style: "percent", maximumFractionDigits: 0 }` при `minValue={0}
  maxValue={100}` дає **«4 500%»**: `style: "percent"` множить на сто. Робочий варіант —
  `{ style: "unit", unit: "percent" }`, але жоден `Intl` не дає формату позиції
  («2 хв 14 с» — `m.time_format_min_sec`), тож `formatOptions` не є шляхом до
  `aria-valuetext` для цієї пари повзунків узагалі.
- Обидва ескізи малюють `<SliderThumb />` без пропсів і покладаються на те, що
  `aria-valuetext` можна задати ззовні. **Не можна:** `useSliderThumb` жорстко ставить
  `aria-valuetext` з `state.getThumbValueLabel(index)`, а проп із `<SliderThumb>` не
  доходить до input узагалі. Код тепер патчить атрибут через `useSliderThumbInput`.
- Таблиці клавіш обох розділів описують типову поведінку React Aria (`←`/`→` міняють
  значення, `PageUp`/`PageDown` ±10, `Home`/`End` в кінці діапазону). Реалізація
  свідомо інша: у зоні плеєра `←`/`→` і `Home`/`End` ходять **між елементами**, а
  `PageUp`/`PageDown` — no-op.
- 4.4 кладе позицію в `<Label>` (це стало б **іменем** повзунка, не значенням), а в
  `<SliderOutput>` — тривалість. Крок там `1000`, у коді `5000`; ключі повідомлень
  названі в camelCase (`m.playbackPosition()`), а справжні — snake_case.

Обсяг звірки — увесь документ, а не два рядки: якщо один розділ лишився на рівні задуму,
припускати, що решта синхронна, підстав немає. Зміна поведінки не входить — тільки
приведення опису до коду або явна позначка «заплановано, не реалізовано».

## Критерії готовності

- [ ] Кожна структура ролей у документі звірена з відповідним компонентом
- [ ] Розбіжності або виправлені, або явно позначені як нереалізований задум
- [ ] Внутрішніх суперечностей (як `grid` проти `listitem`) не лишилось
- [ ] Перевірено, чи наявні `docs/testing/nvda-*.md` не спираються на виправлені місця

## Документи

- [accessibility.md](../accessibility.md) — документ, що звіряється
- [help-recording](done/p1-help-recording.md) — запис, під час якого знайдено
