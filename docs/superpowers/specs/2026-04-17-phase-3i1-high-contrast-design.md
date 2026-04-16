# Phase 3I-1 — Windows High Contrast

> **Дата:** 2026-04-17
> **Статус:** Затверджено
> **Залежності:** Жодних (незалежна підфаза)

## Ціль

Забезпечити повну видимість усіх кастомних UI-елементів при увімкненому Windows High Contrast mode. Використати Tailwind `forced-colors:` класи для підміни кольорів на системні.

## Scope

**Включено:**
- `forced-colors:` класи для 24 компонентів (inline Tailwind)
- Глобальне правило для focus ring у `styles.css`
- Чекліст для візуальної перевірки третьою особою

**Виключено:**
- Нові залежності
- Зміни у Tailwind config
- Зміни в Rust-бекенді

---

## Підхід

### Стратегія

Inline `forced-colors:` Tailwind класи безпосередньо у JSX компонентах. Tailwind 4 підтримує `forced-colors:` нативно — жодних конфігурацій не потрібно.

Єдиний виняток: **глобальний focus ring** — одне правило в `styles.css` через `@media (forced-colors: active)`, бо фокус-стилі визначені там глобально і повторюються у 10+ місцях.

### Системні кольори

| Колір CSS | Призначення |
|-----------|-------------|
| `ButtonFace` | Фон кнопок, контейнерів |
| `ButtonText` | Текст, бордери елементів |
| `Canvas` | Фон основного контенту |
| `CanvasText` | Текст основного контенту |
| `Highlight` | Фокус/виділення — фон |
| `HighlightText` | Текст на виділенні |
| `GrayText` | Disabled елементи |

### Принципи

1. **Бордер замість фону** — у High Contrast фони часто перезаписуються системою; бордери надійніші для видимості
2. **Не покладатись тільки на колір** — кожен статус вже має текстову мітку (REC, ●, тощо); `forced-colors:` лише забезпечує видимість
3. **Мінімальний вплив** — класи `forced-colors:` не впливають на звичайний режим

---

## Компоненти — деталі змін

### Критичні (елементи невидимі без `forced-colors:`)

#### 1. StreamRow.tsx — Status Indicators

**Файл:** `src/components/streams/StreamRow.tsx`

Кольорові dot-індикатори статусу потоку:

| Статус | Поточний клас | Додати |
|--------|---------------|--------|
| Recording (червона пульсуюча точка) | `bg-red-500` | `forced-colors:bg-[ButtonText]` |
| Recording label "REC" | `text-red-400` | `forced-colors:text-[ButtonText]` |
| Connecting (жовта точка) | `bg-yellow-400` | `forced-colors:bg-[ButtonText]` |
| Reconnecting (жовта точка) | `bg-yellow-500` | `forced-colors:bg-[ButtonText]` |
| Error (червона точка) | `bg-red-600` | `forced-colors:bg-[ButtonText]` |
| Idle (сіра точка) | `bg-slate-600` | `forced-colors:bg-[GrayText]` |

Усі точки також мають отримати `forced-colors:border forced-colors:border-[ButtonText]` для контрастності з фоном.

#### 2. ToastContainer.tsx — Toast backgrounds

**Файл:** `src/components/common/ToastContainer.tsx`

| Тип тосту | Поточний клас | Додати |
|-----------|---------------|--------|
| Error | `bg-red-700` | `forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]` |
| Warning | `bg-amber-600` | те ж саме |
| Success | `bg-green-700` | те ж саме |
| Info | `bg-slate-700` | те ж саме |

#### 3. PlaybackPosition.tsx — Slider

**Файл:** `src/components/player/PlaybackPosition.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Track | `bg-slate-600` | `forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]` |
| Thumb | `bg-white` | `forced-colors:bg-[ButtonText]` |
| Progress fill | `bg-blue-400` | `forced-colors:bg-[Highlight]` |
| Live pulse | `bg-blue-400 animate-pulse` | `forced-colors:bg-[Highlight]` |

#### 4. VolumeSlider.tsx — Slider

**Файл:** `src/components/player/VolumeSlider.tsx`

Аналогічно PlaybackPosition:

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Track | `bg-slate-600` | `forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]` |
| Thumb | `bg-white` | `forced-colors:bg-[ButtonText]` |

#### 5. StreamRow.tsx + StreamsPanel.tsx — Action Buttons

**Файли:** `src/components/streams/StreamRow.tsx`, `src/components/streams/StreamsPanel.tsx`

| Кнопка | Поточний клас | Додати |
|--------|---------------|--------|
| Play (active) | `bg-blue-700` | `forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]` |
| Record (active) | `bg-red-700` | `forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]` |
| Inactive | `bg-slate-700` | `forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]` |
| Add stream | `bg-blue-600` | `forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]` |

### Важливі (UX деградує)

#### 6. styles.css — Global Focus Ring

**Файл:** `src/styles.css`

Додати блок:

```css
@media (forced-colors: active) {
  button:focus-visible,
  [role="row"]:focus-visible,
  [role="menuitem"]:focus-visible,
  input:focus-visible,
  select:focus-visible,
  [tabindex]:focus-visible {
    outline: 2px solid Highlight !important;
    outline-offset: 2px;
  }
}
```

#### 7. SettingsDialog.tsx — Active Tab Indicator

**Файл:** `src/components/settings/SettingsDialog.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Selected tab border | `selected:border-blue-400` | `forced-colors:selected:border-[Highlight]` |
| Selected tab text | `selected:text-slate-100` | `forced-colors:selected:text-[HighlightText]` |
| Unselected tab text | `text-slate-400` | `forced-colors:text-[ButtonText]` |

#### 8. CommandPalette.tsx — Selection Highlight

**Файл:** `src/components/common/CommandPalette.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Selected item | `bg-blue-600/30` | `forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]` |
| Input | `bg-slate-800 border-slate-600` | `forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]` |

#### 9. ActivityBar.tsx — Button States

**Файл:** `src/components/layout/ActivityBar.tsx`

| Стан | Поточний клас | Додати |
|------|---------------|--------|
| Active | `bg-slate-700 text-blue-400` | `forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]` |
| Disabled | `text-slate-600` | `forced-colors:text-[GrayText]` |
| Normal | `text-slate-400` | `forced-colors:text-[ButtonText]` |
| Hover | `hover:bg-slate-700` | `forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]` |

### Середні (консистентність)

#### 10. AddStreamDialog.tsx — Input Borders & Error Text

**Файл:** `src/components/streams/AddStreamDialog.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Input border | `border-slate-600` | `forced-colors:border-[ButtonText]` |
| Focus border | `focus:border-blue-500` | `forced-colors:focus:border-[Highlight]` |
| Error text | `text-red-400` | `forced-colors:text-[CanvasText]` |

#### 11. GeneralTab.tsx — Disabled Checkboxes

**Файл:** `src/components/settings/GeneralTab.tsx`

Disabled checkboxes та їх описи:

| Елемент | Додати |
|---------|--------|
| Disabled label | `forced-colors:text-[GrayText]` |
| Description text | `forced-colors:text-[GrayText]` |

#### 12. PlayerPanel.tsx — Disabled Buttons

**Файл:** `src/components/player/PlayerPanel.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Disabled button | `disabled:opacity-40` | `forced-colors:disabled:text-[GrayText] forced-colors:disabled:border-[GrayText]` |

#### 13. ConfirmDialog.tsx — Danger Button

**Файл:** `src/components/common/ConfirmDialog.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Delete/confirm button | `bg-red-600` | `forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]` |

#### 14. StreamContextMenu.tsx — Delete Item

**Файл:** `src/components/streams/StreamContextMenu.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Delete menu item | `text-red-400` | `forced-colors:text-[CanvasText]` |

#### 15. StreamRow.tsx + PatternTable.tsx — Row Hover

**Файли:** `src/components/streams/StreamRow.tsx`, `src/components/wishlist/PatternTable.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Row hover | `hover:bg-slate-800/50` | `forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]` |

#### 16. HotkeysTab.tsx — Duplicate Warning

**Файл:** `src/components/settings/HotkeysTab.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Warning text | `text-red-300` | `forced-colors:text-[CanvasText]` |

#### 17. WishlistPanel.tsx — Buttons

**Файл:** `src/components/wishlist/WishlistPanel.tsx`

Аналогічно StreamsPanel — кнопки «Додати»:

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Add wishlist/ignorelist button | `bg-blue-600 hover:bg-blue-700` | `forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]` |
| Focus outline | `focus-visible:outline-blue-400` | `forced-colors:focus-visible:outline-[Highlight]` |

#### 18. AddPatternDialog.tsx — Input Borders

**Файл:** `src/components/wishlist/AddPatternDialog.tsx`

Аналогічно AddStreamDialog:

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Modal background | `bg-slate-800` | `forced-colors:bg-[Canvas] forced-colors:border forced-colors:border-[ButtonText]` |
| Input border | `border-slate-600 bg-slate-700` | `forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]` |
| Focus border | `focus:border-blue-500` | `forced-colors:focus:border-[Highlight]` |
| Cancel button | `hover:bg-slate-700` | `forced-colors:text-[ButtonText]` |

#### 19. KeyRecorder.tsx — Buttons & Error

**Файл:** `src/components/settings/KeyRecorder.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Record button | `border-slate-600 bg-slate-700` | `forced-colors:bg-[Canvas] forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]` |
| Clear button | `border-slate-600 bg-slate-700 text-slate-400` | `forced-colors:bg-[ButtonFace] forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]` |
| Focus ring | `focus:ring-blue-400` | `forced-colors:focus:ring-[Highlight]` |
| Error text | `text-red-400` | `forced-colors:text-[CanvasText]` |

#### 20. RecordingTab.tsx / ReconnectionTab.tsx / AudioTab.tsx — Setting Inputs

**Файли:** `src/components/settings/RecordingTab.tsx`, `ReconnectionTab.tsx`, `AudioTab.tsx`

Ці таби використовують React Aria компоненти (TextField, NumberField, Select, Checkbox), які здебільшого коректно обробляють `forced-colors` автоматично. Потрібно перевірити і за потреби додати:

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Input fields | `border-slate-600 bg-slate-700` | `forced-colors:bg-[Canvas] forced-colors:border-[ButtonText]` |
| Browse button (RecordingTab) | `bg-slate-700` | `forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]` |
| Refresh button (AudioTab) | `bg-slate-700` | `forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]` |

#### 21. StatusBar.tsx — Border & Text

**Файл:** `src/components/layout/StatusBar.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Container | `border-slate-700 text-slate-400` | `forced-colors:border-[ButtonText] forced-colors:text-[CanvasText]` |

#### 22. SectionHeader.tsx — Border & Button

**Файл:** `src/components/layout/SectionHeader.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Header border | `border-slate-700` | `forced-colors:border-[ButtonText]` |
| Button text | `text-slate-400` | `forced-colors:text-[ButtonText]` |
| Button hover | `hover:bg-slate-700` | `forced-colors:hover:bg-[Highlight] forced-colors:hover:text-[HighlightText]` |
| Focus outline | `focus-visible:outline-blue-400` | `forced-colors:focus-visible:outline-[Highlight]` |

#### 23. StreamTable.tsx — Table Border

**Файл:** `src/components/streams/StreamTable.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Table border | `border-slate-700` | `forced-colors:border-[ButtonText]` |

#### 24. ErrorBoundary.tsx — Error Text

**Файл:** `src/components/common/ErrorBoundary.tsx`

| Елемент | Поточний клас | Додати |
|---------|---------------|--------|
| Error text | `text-red-400` | `forced-colors:text-[CanvasText]` |

---

## Чекліст візуальної перевірки (для третьої особи)

> **Як увімкнути High Contrast:**
> Windows 11: Параметри → Спеціальні можливості → Контрастні теми → обрати «Водяна» або «Пустеля» або «Нічне небо» або «Висока контрастність білий» → Застосувати
> **Важливо:** перевірити і темну (Нічне небо), і світлу (Висока контрастність білий) теми

### Загальна перевірка

- [ ] Усі кнопки мають видимий бордер
- [ ] Усі текстові мітки читабельні (контрастні з фоном)
- [ ] Фокус-кільце (Tab-навігація) видиме на кожному елементі
- [ ] Disabled елементи відрізняються від активних (сірий текст)

### Потоки

- [ ] Dot-індикатори статусу видимі (recording, connecting, error, idle)
- [ ] Мітка "REC" видима
- [ ] Кнопки ▶/⏺ мають видимий бордер
- [ ] Hover на рядку потоку виділяє рядок

### Player

- [ ] VolumeSlider: thumb видимий, track має бордер
- [ ] PlaybackPosition: thumb, track, progress fill — все видиме
- [ ] Disabled кнопки (коли нічого не грає) мають сірий стиль

### Тости

- [ ] Error/warning/success/info тости мають бордер і читабельний текст

### Налаштування (SettingsDialog)

- [ ] Активний таб підкреслений (Highlight колір)
- [ ] Input поля мають бордер
- [ ] Disabled checkboxes (Tray) — сірий текст
- [ ] Duplicate hotkey warning — текст видимий

### Command Palette

- [ ] Обраний елемент виділений (Highlight фон)
- [ ] Input поле має бордер

### ActivityBar

- [ ] Активна секція виділена
- [ ] Disabled кнопка (Settings при відкритому діалозі) — сірий текст
- [ ] Hover на кнопці виділяє її

### Wishlist

- [ ] Кнопки «Додати» (wishlist/ignorelist) мають видимий бордер
- [ ] Input у AddPatternDialog має бордер і контрастний текст

### Context Menu

- [ ] Пункт «Видалити» читабельний (не покладається тільки на червоний)

### Інше

- [ ] StatusBar: текст і бордер видимі
- [ ] SectionHeader: кнопка і бордер видимі
- [ ] ErrorBoundary: текст помилки читабельний
- [ ] KeyRecorder: кнопки запису/очищення мають бордер; error text видимий

---

## Тестування

Оскільки розробник не бачить екран, візуальну перевірку виконує третя особа за чеклістом вище. Функціональне тестування (NVDA, Tab-навігація) — розробник.

Мінімальний автоматизований тест: перевірити, що `forced-colors:` класи присутні у рендері (snapshot або grep по коду).

---

## Обсяг змін

| Файл | Тип змін |
|------|----------|
| `src/styles.css` | +1 `@media (forced-colors: active)` блок |
| `src/components/streams/StreamRow.tsx` | inline forced-colors класи |
| `src/components/common/ToastContainer.tsx` | inline forced-colors класи |
| `src/components/player/PlaybackPosition.tsx` | inline forced-colors класи |
| `src/components/player/VolumeSlider.tsx` | inline forced-colors класи |
| `src/components/player/PlayerPanel.tsx` | inline forced-colors класи |
| `src/components/streams/StreamsPanel.tsx` | inline forced-colors класи |
| `src/components/streams/AddStreamDialog.tsx` | inline forced-colors класи |
| `src/components/streams/StreamContextMenu.tsx` | inline forced-colors класи |
| `src/components/streams/StreamTable.tsx` | inline forced-colors класи |
| `src/components/settings/SettingsDialog.tsx` | inline forced-colors класи |
| `src/components/settings/GeneralTab.tsx` | inline forced-colors класи |
| `src/components/settings/RecordingTab.tsx` | inline forced-colors класи |
| `src/components/settings/ReconnectionTab.tsx` | inline forced-colors класи |
| `src/components/settings/AudioTab.tsx` | inline forced-colors класи |
| `src/components/settings/HotkeysTab.tsx` | inline forced-colors класи |
| `src/components/settings/KeyRecorder.tsx` | inline forced-colors класи |
| `src/components/common/CommandPalette.tsx` | inline forced-colors класи |
| `src/components/common/ConfirmDialog.tsx` | inline forced-colors класи |
| `src/components/common/ErrorBoundary.tsx` | inline forced-colors класи |
| `src/components/layout/ActivityBar.tsx` | inline forced-colors класи |
| `src/components/layout/SectionHeader.tsx` | inline forced-colors класи |
| `src/components/layout/StatusBar.tsx` | inline forced-colors класи |
| `src/components/wishlist/WishlistPanel.tsx` | inline forced-colors класи |
| `src/components/wishlist/AddPatternDialog.tsx` | inline forced-colors класи |
| `src/components/wishlist/PatternTable.tsx` | inline forced-colors класи |
