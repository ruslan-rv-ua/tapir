# Специфікація доступності Tapir

> **Версія:** 0.1 (draft) | **Версія продукту:** 0.1.0  
> **Стандарти:** WCAG 2.1 AA (адаптовано для desktop), UI Automation  
> **Скрінрідери:** NVDA 2023+, JAWS 2023+, Windows Narrator  
> **Технології:** React Aria Components, WebView2 (Chromium ARIA → UIA mapping)

> **Примітка (2026-04-23):** описи `StreamTable`, `ResultsTable`, `WishlistTable`, `SongsTable` і `ScheduleTable` у цьому документі відображають поточний або історичний table/grid-підхід. Для refactor зонної навігації та композиційних списків пріоритет мав `docs/FRD-navigation.md` (видалено).

---

## 1. Загальні принципи

### 1.1. Фундаментальні вимоги

- **Кожен** інтерактивний елемент має accessible name, role, state
- **Повна** навігація клавіатурою — миша не є обов'язковою
- **Видимий** focus indicator на кожному елементі (Tailwind `focus-visible:ring-2 ring-offset-2`)
- **Логічний** tab order відповідає візуальному порядку
- **Live regions** для усіх динамічних змін, що потребують уваги
- **`decorations: true`** — обов'язково (NVDA mouse tracking bug Tauri #12901)

### 1.2. Windows High Contrast

Tailwind `forced-colors:` для всіх кастомних компонентів:

```css
/* Приклад: кнопка запису */
.record-button {
  @apply bg-red-600 text-white;
  @apply forced-colors:bg-[ButtonFace] forced-colors:text-[ButtonText];
  @apply forced-colors:border forced-colors:border-[ButtonText];
}

/* Focus indicator */
.focus-ring {
  @apply focus-visible:ring-2 ring-blue-500 ring-offset-2;
  @apply forced-colors:ring-[Highlight];
}
```

### 1.3. Screen Magnifier (Windows Magnifier, ZoomText)

- Фокус-tracking: кожен елемент при фокусуванні має бути повністю видимим (уникати `overflow:hidden` без `overflow:auto`)
- Activity Bar (48px) — при zoom 400% іконки можуть виходити за межі. Мінімальна ширина — 48px навіть при zoom
- StreamTable рядки — мінімальна висота рядка 40px
- Не використовувати тільки колір для передачі інформації (статус REC — і колір, і текст "REC", і пульсація)
- Компоненти що потребують `forced-colors:` при High Contrast:
  - `StatusIcon` (кольорові dot-індикатори)
  - Badge на Activity Bar іконці
  - Toast контейнер (background/border)
  - Slider thumb / Progress track

### 1.4. LiveAnnouncer — централізовані оголошення

Один `aria-live` контейнер для усього застосунку. React Aria `@react-aria/live-announcer` або кастомний:

```tsx
// Два контейнери: polite + assertive
<div data-live-announcer="true" aria-live="polite" aria-atomic="true" className="sr-only" />
<div data-live-announcer="true" aria-live="assertive" aria-atomic="true" className="sr-only" />
```

**Важливо:** `data-live-announcer="true"` обов'язковий. React Aria `Modal` через
`ariaHideOutside` ставить `aria-hidden` на все поза модалом, окрім елементів з цим
атрибутом — без нього всі `announce()` німі, поки відкритий будь-який діалог.

**Правила пріоритету:**

| Priority | `aria-live` | Коли використовувати |
|---|---|---|
| `polite` | `polite` | Track changed, profile changed, reconnecting |
| `assertive` | `assertive` | Recording started/stopped, errors, wishlist match, disk space |

---

## 2. Головне вікно

### 2.1. Landmarks

```html
<header role="banner">        → Window title + global status
<nav role="navigation"         → Activity Bar (ліва панель секцій)
     aria-label="Секції застосунку">
<main role="main">             → Active section content
<footer role="contentinfo">    → Status bar (recording count, disk space, longest recording)
<div role="complementary">     → Player controls bar
```

### 2.2. Window title

Динамічний `document.title`:

- Без запису: `Tapir`
- З записом: `● 3 записи — Tapir`
- З відтворенням: `▶ Artist - Title — Tapir`
- Комбінація: `▶ Artist - Title ● 3 записи — Tapir`

### 2.3. Tab порядок (головне вікно)

```
[Activity Bar] → [Section Content] → [Player Controls] → [Status Bar]
```

> У Фазі 1 зона `Player Controls` відсутня і пропускається: `[Activity Bar] → [Section Content] → [Status Bar]`.

Activity Bar — вертикальна навігація секцій (Arrow Up/Down).
Пряма навігація: Ctrl+1…5 (Streams, Browser, Songs, Schedule, Wishlist).
Ctrl+, — відкрити діалог налаштувань.

Активний nav item має `aria-current="page"`, оновлюється динамічно при зміні секції (JavaScript).

### 2.3.1. Zone navigation (F6 / Shift+F6)

Навігація між основними зонами вікна (Windows стандарт, знайомий NVDA/JAWS користувачам).

```
F6:       Activity Bar → Section Content → Player → Status Bar → (cycle)
Shift+F6: зворотній напрямок
```

Поведінка:
- Запам'ятовує останній сфокусований елемент у кожній зоні (roving focus)
- Пропускає приховані зони (Player, якщо нічого не відтворюється)
- Оголошує назву зони через LiveAnnouncer (`assertive`): «Програвач», «Потоки», «Статус»
- Реалізація: звичайний `window.addEventListener("keydown", ...)` у frontend; це **не** global shortcut і працює лише коли фокус у вікні Tapir
- Не працює всередині модальних діалогів (focus trap)
- При спробі F6 у відкритому діалозі — ігнорується (focus trap активний). NVDA не оголошує зону.
### 2.4. Command Palette (Ctrl+K)

- `role="dialog"`, `aria-label="Command Palette"`
- Внутрі: combobox pattern (input + listbox)
- Escape — закрити, фокус повертається на попередній елемент
- Fuzzy search: секції, станції, пісні, налаштування
- Live region: `aria-live="polite"` — кількість результатів
- Повний перелік клавіатурних шорткатів застосунку — [keyboard-shortcuts.md](keyboard-shortcuts.md)

### 2.5. Profile Switcher [Phase 4]

> У Фазі 1 елемент присутній лише як disabled placeholder з поясненням "Буде доступно у Фазі 4".

- Кнопка внизу Activity Bar: `aria-label="Переключити профіль: {name}"`, `aria-haspopup="listbox"`
- Popover: React Aria `Popover` + `ListBox` (`selectionMode="single"`)
- `ListBox` (`aria-label="Профілі"`) — семантично точний для "вибір одного з кількох профілів"
- Keyboard: Arrow Up/Down між ListBoxItem, Enter/Space — вибір, Escape — закрити
- Внизу Popover: `<Button onPress={() => openSettings("profiles")}>{m.manageProfiles()}</Button>`
- Escape — закрити, фокус повертається на кнопку

```tsx
<MenuTrigger>
  <Button aria-label={m.switchProfile({ name: activeProfile })}>
    <ProfileBadge name={activeProfile} />
  </Button>
  <Popover>
    <ListBox
      aria-label={m.profiles()}
      selectionMode="single"
      selectedKeys={[activeProfile]}
      onSelectionChange={handleSwitch}
    >
      {profiles.map(p => (
        <ListBoxItem key={p.name}>{p.name}</ListBoxItem>
      ))}
    </ListBox>
    <Separator />
    <Button onPress={() => openSettings("profiles")}>{m.manageProfiles()}</Button>
  </Popover>
</MenuTrigger>
```

---

## 3. Секція: Потоки (Streams)

> **Реалізація (звірено 2026-06-14):** фактичний список потоків — **не** `role="grid"`
> `TableView` з чекбоксами (ескізи §3.1–§3.6 — історичний table/grid-підхід, див. ноту
> 2026-04-23 вгорі документа), а `role="application"` з роумінг-фокусом
> ([`useCompositeList`](../src/hooks/useCompositeList.ts) / `CompositeList`). Тож
> комірки `P`/`R`/`Space=toggle selection`/`Ctrl+F`-пошук із §3.2 — застарілі.
>
> **Модель виділення (multi-select)** проєктується окремо — джерело правди:
> беклог `p1-bulk-stream-operations` (реалізовано; запис видалено до появи `done/`) +
> spec віхи A.
> Коротко з її §A6:
> - **Єдиний канал оголошень виділення** — усі повідомлення (одиничний toggle,
>   зведене «Виділено N», «Виділення знято», «Видалено N») йдуть **лише** через
>   центральний `LiveAnnouncer` (§1.4, `announce`). Тулбар-лічильник «{n} вибрано» —
>   **візуальний span БЕЗ `aria-live`**: окремий live-регіон на ньому дав би подвійне
>   озвучення поверх центрального announcer'а.
> - **Pointer-жести** (клік / Ctrl+Click) рухають DOM-фокус, тож рядок читається сам —
>   їх явним `announce` **не** дублюємо; клавіатурний одиничний toggle (`Ctrl+Space`)
>   фокус не рухає → оголошується явно.
> - Стан виділеного рядка кодується **суфіксом «, виділено»** в accessible name
>   (список `role="application"`/`listitem` не підтримує `aria-selected`) + CSS-підсвітка.

### 3.1. Структура

```
StreamsPanel
├── SearchField (aria-label="Пошук потоків", Ctrl+F)
├── StreamTable (role="grid", aria-label="Список потоків")
│   ├── Header Row (role="row")
│   │   ├── Column: Статус (role="columnheader", aria-sort)
│   │   ├── Column: Станція
│   │   ├── Column: Трек
│   │   ├── Column: Бітрейт
│   │   └── Column: Тривалість запису
│   └── Data Rows (role="row")
│       └── Cells (role="gridcell")
├── Toolbar (role="toolbar", aria-label="Дії з потоками")
│   ├── Text: "{n} вибрано" (звичайний span, БЕЗ aria-live — оголошення йде єдиним каналом, див. ноту під §3; показується при selectionCount > 0)
│   ├── Button: Додати потік
│   ├── Button: Видалити вибрані (isDisabled={selectionCount === 0})
│   └── Button: Зупинити всі записи
```

### 3.2. StreamTable — ARIA Grid Pattern

React Aria `TableView` з `selectionMode="multiple"`:

```tsx
<TableView
  aria-label={m.streamsTable()}    // i18n: "Список потоків"
  selectionMode="multiple"
  sortDescriptor={sortDescriptor}
  onSortChange={onSortChange}
>
  <TableHeader>
    <Column key="select">
      <Checkbox aria-label={m.selectAll()} />
    </Column>
    <Column key="status" allowsSorting>{m.columnStatus()}</Column>
    <Column key="name" allowsSorting>{m.columnStation()}</Column>
    <Column key="track">{m.columnTrack()}</Column>
    <Column key="bitrate" allowsSorting>{m.columnBitrate()}</Column>
    <Column key="duration" allowsSorting>{m.columnDuration()}</Column>
  </TableHeader>
  <TableBody items={streams}>
    {(stream) => (
      <Row key={stream.id}>
        <Cell>
          <Checkbox aria-label={m.selectStream({ name: stream.name })} />
          {/* "Вибрати: Radio Paradise - Main Mix" */}
        </Cell>
        <Cell>
          <StatusIcon status={stream.state} aria-label={statusLabel(stream.state)} />
        </Cell>
        <Cell>{stream.name}</Cell>
        <Cell>
          {stream.currentTrack ?? "—"}
          {stream.currentFileName && (
            <span className="text-xs text-slate-500 block truncate"
                  aria-label={m.recordingFile({ name: stream.currentFileName })}>
              {stream.currentFileName}
            </span>
          )}
        </Cell>
        <Cell>{stream.bitrate ? `${stream.bitrate} kbps` : "—"}</Cell>
        <Cell>{stream.duration ?? "—"}</Cell>
      </Row>
    )}
  </TableBody>
</TableView>
```

**Empty state (0 потоків):**

```tsx
<TableBody items={streams} renderEmptyState={() => (
  <div role="row">
    <div role="gridcell" colSpan={6} className="text-center py-16 text-slate-400">
      <p className="text-base mb-2">{m.noStreamsYet()}</p>
      {/* "Потоків ще немає" */}
      <p className="text-sm text-slate-500 mb-4">
        {m.addFirstStream()}
        {/* "Додайте перший потік, щоб розпочати запис" */}
      </p>
      <Button onPress={openAddDialog} autoFocus>
        {m.addStream()}
      </Button>
    </div>
  </div>
)} />
```

`autoFocus` на кнопці — щоб NVDA одразу оголосила CTA після переходу до секції.

**Клавіатурна навігація в таблиці:**

| Клавіша | Дія |
|---|---|
| Arrow Up/Down | Переміщення між рядками |
| Arrow Left/Right | Переміщення між комірками |
| Home/End | Перший/останній рядок |
| Space | Toggle selection |
| Enter | Подвійний клік (запис або відтворення, за `doubleClickAction`) |
| `P` | Відтворити потік (window-scoped shortcut у таблиці; незалежно від `doubleClickAction`) |
| `R` | Toggle запис потоку (window-scoped shortcut у таблиці; незалежно від `doubleClickAction`) |
| F2 | Відкрити діалог редагування потоку (`AddStreamDialog` в edit-режимі: назва й адреса; адреса read-only, поки потік записується) |
| Delete | Видалити вибраний потік (з підтвердженням) |
| Shift+F10 / Context Menu | Контекстне меню |
| Ctrl+A | Вибрати всі |

**Accessible описи стану потоку:**

| State | `aria-label` (uk) | `aria-label` (en) |
|---|---|---|
| idle | Зупинено | Idle |
| connecting | Підключення… | Connecting… |
| recording | Записується | Recording |
| reconnecting | Перепідключення | Reconnecting |
| error | Помилка | Error |

### 3.3. Додавання потоку (AddStreamDialog)

React Aria `DialogTrigger` + `Modal`:

```tsx
<DialogTrigger>
  <Button>{m.addStream()}</Button>
  <Modal>
    <Dialog>
      <Heading slot="title">{m.addStreamTitle()}</Heading>
      <TextField label={m.streamUrl()} autoFocus isRequired />
      <TextField label={m.streamName()} />
      <Disclosure>
        <DisclosureButton>{m.authOptional()}</DisclosureButton>
        {/* "Авторизація (опціонально)" */}
        <DisclosurePanel>
          <TextField label={m.username()} />
          <TextField label={m.password()} type="password" />
        </DisclosurePanel>
      </Disclosure>
      <div role="group" aria-label={m.dialogActions()}>
        <Button slot="close">{m.cancel()}</Button>
        <Button type="submit">{m.add()}</Button>
      </div>
    </Dialog>
  </Modal>
</DialogTrigger>
```

**Focus trap:** фокус залишається всередині діалогу. Escape закриває. Focus повертається до кнопки, що відкрила діалог.

### 3.4. NowPlaying

> **Примітка:** `NowPlaying` з `aria-live="polite"` існує тільки в `PlayerPanel` (§4.1, Phase 2), щоб уникнути подвійного оголошення screen reader.
> У `StreamTable` поточний трек показується статично в комірці "Трек" (без `aria-live`).

### 3.5. First-run experience (перший запуск)

Якщо `streams.length === 0` при першому старті:
- Фокус автоматично переходить до кнопки "Додати потік" (empty state в StreamTable)
- LiveAnnouncer оголошує (`assertive`): _"Tapir відкрито вперше. Додайте перший потік для запису."_
- Empty state StreamTable показує CTA кнопку з `autoFocus` (див. §3.1)
- Оголошення виконується один раз після першого mount головного вікна; повторні ререндери не повинні дублювати announcement

### 3.6. Контекстне меню

React Aria `Menu`:

```tsx
<MenuTrigger>
  <Button aria-label={m.streamActions()}><MoreIcon /></Button>
  <Popover>
    <Menu aria-label={m.streamContextMenu()}>
      <MenuItem onAction={startRecording}>{m.startRecording()}</MenuItem>
      <MenuItem onAction={stopRecording}>{m.stopRecording()}</MenuItem>
      <Separator />
      <MenuItem onAction={playStream}>{m.play()}</MenuItem>
      <Separator />
      <MenuItem onAction={editStream}>{m.edit()}</MenuItem>
      <MenuItem onAction={removeStream}>{m.remove()}</MenuItem>
    </Menu>
  </Popover>
</MenuTrigger>
```

**Shift+F10 / ContextMenu key:** React Aria `MenuTrigger` не обробляє `Shift+F10` автоматично на `Row`. Потрібен явний обробник:

```tsx
<Row
  onKeyDown={(e) => {
    if (e.key === "ContextMenu" || (e.shiftKey && e.code === "F10")) {
      e.preventDefault();
      openContextMenu(stream.id);
    }
  }}
>
```

---

## 4. Секція: Програвач (Player) [Phase 2]

### 4.1. Структура

```
PlayerPanel (role="complementary", aria-label="Програвач")
├── NowPlayingInfo
│   ├── Station name
│   └── Track: Artist - Title (aria-live="polite")
├── PlaybackControls (role="toolbar", aria-label="Управління відтворенням")
│   ├── Button: Попередній трек (aria-label)
│   ├── Button: Play/Pause (aria-pressed для toggle)
│   ├── Button: Зупинити (aria-label)
│   └── Button: Наступний трек (aria-label)
├── ProgressBar (для файлів)
│   └── React Aria ProgressBar (aria-label="Позиція", aria-valuenow, aria-valuemin, aria-valuemax)
└── VolumeSlider
    └── React Aria Slider (aria-label="Гучність", 0-100%)
```

Для Windows High Contrast (`forced-colors:`): thumb, track і focus ring slider мають використовувати системні кольори `ButtonText`, `ButtonFace`, `Highlight`.

### 4.2. Play/Pause Toggle

```tsx
<ToggleButton
  aria-label={isPlaying ? m.pause() : m.play()}
  isSelected={isPlaying}
  onChange={togglePlayback}
>
  {isPlaying ? <PauseIcon /> : <PlayIcon />}
</ToggleButton>
```

NVDA/JAWS читає: "Play, toggle button, not pressed" → "Pause, toggle button, pressed".

Основна кнопка транспорту **джерело-залежна** (як і `Ctrl+Shift+K`, трей-перемикач та SMTC): для **файлу** — Play/Pause (пауза/відновлення з позиції); для **живого потоку** — Stop (паузи в ефірі немає — буфер застаріває й слухач відстає). Для потоку окрема кнопка «Зупинити» не рендериться, щоб скрінрідер не бачив дві однакові кнопки Stop.

### 4.3. Volume Slider

React Aria `Slider`:

```tsx
<Slider
  aria-label={m.volume()}
  minValue={0}
  maxValue={100}
  step={1}
  value={volume}
  onChange={setVolume}
  formatOptions={{ style: "percent", maximumFractionDigits: 0 }}
>
  <Label>{m.volume()}</Label>
  <SliderOutput />   {/* "75%" — screen reader читає це */}
  <SliderTrack>
    <SliderThumb />
  </SliderTrack>
</Slider>
```

**Клавіші:** Arrow Left/Right (±1%), Page Up/Down (±10%), Home (0%), End (100%).

### 4.4. Playback Position (файл)

Для seekable файлів — `Slider` (інтерактивний), для live потоків — `ProgressBar` (read-only, `isIndeterminate`).

```tsx
{source === "file" ? (
  <Slider
    aria-label={m.playbackPosition()}
    minValue={0}
    maxValue={durationMs}
    value={positionMs}
    step={1000}           // 1 секунда
    onChange={(val) => invoke("seek", { positionMs: val })}
    formatOptions={/* MM:SS formatter */}
  >
    <Label>{formatTime(positionMs)}</Label>
    <SliderOutput>{formatTime(durationMs)}</SliderOutput>
    <SliderTrack><SliderThumb /></SliderTrack>
  </Slider>
) : (
  <ProgressBar
    aria-label={m.liveStream()}
    isIndeterminate
  />
)}
```

**Клавіші Slider:** Arrow Left/Right (±1 сек), Page Up/Down (±10 сек), Home (0:00), End (кінець).

---

## 5. Секція: Браузер потоків (Stream Browser)

### 5.1. Структура

```
BrowserPanel
├── SearchForm (role="search", aria-label="Пошук станцій")
│   ├── ComboBox: Назва станції (autocomplete)
│   ├── Select: Формат (MP3/AAC/Усі)
│   ├── NumberField: Мін. бітрейт
│   └── Button: Пошук
├── ResultsTable (role="grid", aria-label="Результати пошуку")
│   ├── Columns: Назва, Жанр, Країна, Бітрейт, Формат
│   └── Rows (з aria-label per row)
└── StatusLine (aria-live="polite")
    └── "Знайдено 42 станції" / "Пошук..." / "Нічого не знайдено"
```

**Empty states:**
- До пошуку: "Введіть назву станції для пошуку" — focus на `SearchForm.input`
- 0 результатів: "Нічого не знайдено за '{query}'" — кнопка "Очистити пошук"

### 5.2. ComboBox (пошук)

React Aria `ComboBox`:

```tsx
<ComboBox
  aria-label={m.searchStation()}
  allowsCustomValue
  onInputChange={setQuery}
>
  <Label>{m.stationName()}</Label>
  <Input />
  <Button aria-label={m.clearSearch()}>×</Button>
  <Popover>
    <ListBox>
      {suggestions.map(s => (
        <ListBoxItem key={s.id}>{s.name}</ListBoxItem>
      ))}
    </ListBox>
  </Popover>
</ComboBox>
```

**Оголошення:** при появі suggestions NVDA/JAWS читає кількість ("5 results available"). При 0 результатах після введення — `announce(m.noSuggestions(), "polite")` ("Жодних підказок").

### 5.3. Додавання станції з результатів

При натисканні Enter або кнопки "Додати" в контекстному меню:

- `announce("Станцію додано: {name}", "assertive")`
- Focus залишається на поточному рядку

---

## 6. Секція: Збережені пісні (Saved Songs)

### 6.1. Структура

```
SongsPanel
├── FilterBar (role="toolbar", aria-label="Фільтри")
│   ├── SearchField: Пошук (aria-label="Пошук пісень")
│   ├── Select: Станція
│   └── Select: Статус (усі / повні / неповні / wishlist)
├── SongsTable (role="grid", aria-label="Збережені пісні")
│   ├── Columns: Артист, Назва, Станція, Бітрейт, Тривалість, Розмір, Дата
│   └── Sortable columns з aria-sort
├── SongActions (role="toolbar", aria-label="Дії з піснями")
│   ├── Button: Відтворити
│   ├── Button: Редагувати теги
│   ├── Button: Видалити
│   └── Button: Показати в провіднику
└── StatusLine (aria-live="polite")
    └── "128 пісень, 2.4 ГБ" / "Фільтр: 15 з 128"
```

**Empty state:** "Збережених пісень ще немає. Вони з'являться тут після записів."

### 6.2. Tag Editor Dialog

```tsx
<DialogTrigger>
  <Button>{m.editTags()}</Button>
  <Modal>
    <Dialog aria-label={m.editTagsTitle()}>
      <Heading slot="title">{m.editTagsTitle()}</Heading>
      <TextField label={m.artist()} value={tags.artist} onChange={...} autoFocus />
      <TextField label={m.title()} value={tags.title} onChange={...} />
      <TextField label={m.album()} value={tags.album} onChange={...} />
      <TextField label={m.genre()} value={tags.genre} onChange={...} />
      <NumberField label={m.trackNumber()} value={tags.trackNumber} onChange={...} />
      <div role="group" aria-label={m.dialogActions()}>
        <Button slot="close">{m.cancel()}</Button>
        <Button type="submit" onPress={saveTags}>{m.save()}</Button>
      </div>
    </Dialog>
  </Modal>
</DialogTrigger>
```

---

## 7. Секція: Розклад (Schedule)

### 7.1. Структура

```
SchedulePanel
├── ScheduleTable (role="grid", aria-label="Заплановані записи")
│   ├── Columns: Назва, Потік, Тип, День, Час, Тривалість, Статус
│   └── Row: aria-label="{name}, {stream}, {day} о {time}, {duration} хв"
├── Toolbar
│   ├── Button: Додати запис
│   └── Button: Увімкнути/Вимкнути
└── StatusLine (aria-live="polite")
```

**Empty state:** "Жодних запланованих записів" — кнопка "Додати запис" (`autoFocus`)

### 7.2. ScheduleForm Dialog

```tsx
<Dialog aria-label={isEdit ? m.editSchedule() : m.addSchedule()}>
  <Heading slot="title">{isEdit ? m.editSchedule() : m.addSchedule()}</Heading>
  
  <TextField label={m.recordingName()} autoFocus />
  
  <Select label={m.stream()} isRequired>
    {streams.map(s => <SelectItem key={s.id}>{s.name}</SelectItem>)}
  </Select>
  
  <RadioGroup label={m.scheduleType()}>
    <Radio value="oneshot">{m.oneshot()}</Radio>
    <Radio value="recurring">{m.recurring()}</Radio>
  </RadioGroup>
  
  {/* Conditional: day selector */}
  {type === "recurring" && (
    <Select label={m.dayOfWeek()}>
      <SelectItem key="0">{m.monday()}</SelectItem>
      {/* ... */}
    </Select>
  )}
  
  {type === "oneshot" && (
    <DatePicker label={m.date()} description="ДД.ММ.РРРР" />
  )}
  
  <TimeField label={m.startTime()} isRequired />
  <NumberField label={m.durationMinutes()} minValue={1} isRequired />
</Dialog>
```

### 7.3. Статус у таблиці

| Enabled | Стан | Accessible текст |
|---|---|---|
| true | Очікує | "Увімкнено, очікує" |
| true | Записує | "Увімкнено, записується" |
| false | — | "Вимкнено" |

Toggle через `aria-pressed` кнопку або checkbox.

---

## 8. Секція: Wishlist / Ignorelist

### 8.1. Структура

```
WishlistPanel
├── Tabs (внутрішні): [Wishlist] [Ignorelist]
│   Keyboard: Arrow Left/Right між табами (React Aria Tabs стандарт)
├── WishlistTable (role="grid", aria-label="Список бажаних пісень")
│   ├── Columns: Патерн, Мін. бітрейт, Формат, Опції
│   └── Row: aria-label описує весь запис
├── Toolbar
│   ├── Button: Додати
│   ├── Button: Видалити вибрані
│   ├── Button: Імпорт з файлу
│   └── Button: Експорт у файл
└── IgnorelistTable (аналогічно)
```

**Empty states:**
- Wishlist: "Wishlist порожній. Додайте патерн для автоматичного запису треків." — кнопка "Додати" (`autoFocus`)
- Ignorelist: "Ignorelist порожній."

### 8.2. Додавання запису

```tsx
<Dialog aria-label={m.addToWishlist()}>
  <TextField label={m.pattern()} autoFocus 
    description={m.patternHint()} />  {/* "Використовуйте * та ? для шаблонів" */}
  <NumberField label={m.minBitrate()} />
  <Select label={m.format()}>
    <SelectItem key="any">{m.anyFormat()}</SelectItem>
    <SelectItem key="mp3">MP3</SelectItem>
    <SelectItem key="aac">AAC</SelectItem>
  </Select>
  <Checkbox>{m.removeAfterRecord()}</Checkbox>
  <Checkbox>{m.addToIgnorelistAfterRecord()}</Checkbox>
</Dialog>
```

---

## 9. Діалоги налаштувань

Налаштувань **два діалоги**, і область дії чути з того, у якому з них поле
лежить (ADR [global-vs-profile-settings-boundary](decisions/2026-08-08-global-vs-profile-settings-boundary.md)):
глобальне — в одному, профільне — в іншому. Межа фізична, а не підписана:
підпис довелося б повторювати на кожному контролі, і він однаково не
оголошується, поки в групу не зайти.

Обидва — `role="dialog"` з `aria-label`, focus trap, Escape закриває, вертикальний
`TabList` з власною міткою «Розділи налаштувань» (не `aria-label` діалогу вдруге),
збереження автоматичне (дебаунс 300 мс) — кнопок «Підтвердити»/«Скасувати» немає.

Точки входу в **налаштування програми**:
- ⚙️ gear (Activity Bar, над ProfileSwitcher)
- `Ctrl+,` (глобальний хоткей, toggle)
- Command Palette → «Налаштування»

Точки входу в **налаштування профілю**:
- `Ctrl+Shift+,` — активний профіль, з будь-якої секції (toggle)
- Command Palette → «Налаштування профілю…» — активний профіль
- Кнопка «Налаштування профілю «X»…» у налаштуваннях програми — вказівник на
  місці старої звички `Ctrl+,` → «Запис»
- Контекстне меню рядка профілю (`Shift+F10`) — працює і для **неактивного**
  профілю

### 9.1. Структура

```
SettingsDialog (role="dialog", aria-label="Налаштування")   ← ТІЛЬКИ глобальне
├── TabList (aria-label="Розділи налаштувань", orientation="vertical")
│   └── Tabs: Загальні, Аудіо, Гарячі клавіші            (рівно три)
│
├── TabPanel: Загальні
│   ├── Select: Мова · Select: Тема
│   ├── Checkbox: Згортати до трею замість закриття
│   ├── Checkbox: Назва треку в заголовку
│   ├── Checkbox: Автозапуск з Windows (+ Запускати згорнутим)
│   └── Select: Дія при активації потоку (Enter / подвійний клік)
│
├── TabPanel: Аудіо
│   ├── Select: Пристрій виведення (з кнопкою Оновити)
│   ├── Checkbox: Інтеграція з медіаклавішами (SMTC)
│   ├── NumberField: Поріг перезапуску для Prev
│   └── NumberField: Крок гучності
│
├── TabPanel: Гарячі клавіші
│   └── Список з KeyRecorder для кожного хоткея
│
└── Footer
    ├── Text: «Зміни зберігаються автоматично»
    └── Button: Налаштування профілю «X»…   → відкриває діалог нижче
```

```
ProfileSettingsDialog (role="dialog", aria-label="Налаштування профілю: X")
├── TabList (aria-label="Розділи налаштувань", orientation="vertical")
│   └── Tabs: Запис, Відтворення, Інтерфейс, Постобробка   (рівно чотири)
│
├── TabPanel: Запис
│   ├── TextField: Папка для записів (+ Button: Огляд → нативний діалог тек)
│   ├── TextField ×3: шаблони імен файлів
│   ├── Checkbox: Зберігати файл потоку
│   ├── Checkbox: Пропускати перший неповний трек
│   ├── NumberField: Мін. тривалість треку · Checkbox: Автокорекція регістру
│   ├── NumberField: Поріг диску (ГБ)          ← профільний: охороняє теку вище
│   ├── NumberField ×2: padding планувальника
│   └── <details>: Перепідключення (4 × NumberField)
│
├── TabPanel: Відтворення
│   ├── Checkbox: Відновлювати останнє відтворення при запуску (+ опис через aria-describedby)
│   ├── Select: Відновлювати файл (З останньої позиції / З початку)
│   └── Checkbox: Автоматично відтворювати наступний трек
│
├── TabPanel: Інтерфейс
│   ├── Select: Сортування (За назвою / За часом додавання)
│   └── Checkbox: Сповіщення при зміні треку
│
├── TabPanel: Постобробка        ← aria-disabled="true", АЛЕ в навігації стрілками
│   └── Text: пояснення, чому вкладка недоступна
│
└── Footer
    └── Text: «Зміни зберігаються автоматично»
```

**Вкладка «Постобробка» — патерн APG «disabled but focusable».** Не `isDisabled`:
react-aria прибрав би вкладку з навігації стрілками, і користувач екранного
читача ніколи б її не зустрів — фіча існувала б, не існуючи. Замість цього
`aria-disabled="true"` (react-aria-components не пропускає цей атрибут як проп,
тож він виставляється через ref-колбек), вкладка лишається в навігації та в
підрахунку — «вкладка 4 з 4», — а панель словами пояснює стан.

**Автозбереження мусить бути чутним.** Візуального фідбеку немає взагалі, тож
після кожного успішного запису діалог профілю оголошує «Налаштування збережено:
X» (`polite`). Тиша тут для незрячого користувача нерозрізненна з «не збереглося».

**Профіль зник із-під відкритого діалогу** (видалено або перейменовано ззовні):
діалог закривається, причина оголошується `assertive` («Профіль «X» більше не
існує. Діалог налаштувань закрито.»), фокус повертається у список профілів.
Такий випадок можливий лише для неактивної цілі, відкритої з екрана профілів,
тож фокусу завжди є куди приземлитися.

### 9.2. KeyRecorder (hotkey input)

Кастомний компонент для запису комбінації клавіш. Рядок — звичайний `<div>`
без ARIA-семантики: `<Label>` лише візуальний, ім'я дії озвучується один раз —
як частина `aria-label` кнопки запису. Не обгортайте рядок у
`role="group" aria-label={actionName}` — тоді NVDA озвучує назву дії двічі
(і на вході в групу, і на самій кнопці), бо `aria-label` кнопки вже починається
з `actionName`.

```tsx
<div>
  <Label>{actionName}</Label>
  <Button
    aria-label={`${actionName}: ${currentHotkey}. ${m.pressToChange()}`}
    onPress={startRecording}
    onKeyDown={captureKeys}
  >
    {isRecording ? m.pressKeys() : currentHotkey}
  </Button>
  <Button aria-label={m.clearHotkey()} onPress={clearHotkey}>×</Button>
</div>
```

### 9.3. Profile operations

При перемиканні профілю:

- Якщо є активні записи — показати `ConfirmDialog` перед `switch_profile`:
  - Заголовок: _"Перемикання профілю"_
  - Текст: _"Перемикання профілю зупинить {count} активних записів. Продовжити?"_
  - Кнопка "Скасувати" — `autoFocus` (safe default)
  - Кнопка "Перемкнути та зупинити" — `variant="destructive"`
- Якщо немає активних записів — перемикання без підтвердження
- `announce("Профіль змінено: {name}", "polite")`
- Focus залишається на Select

При видаленні:

- ConfirmDialog: "Видалити профіль '{name}'? Ця дія незворотна."
- Focus trap в діалозі, Escape для скасування

---

## 10. Діалог підтвердження (ConfirmDialog)

Уніфікований компонент для деструктивних дій:

```tsx
<AlertDialog>
  <Heading slot="title">{title}</Heading>
  <Content>{message}</Content>
  {/* Кнопка "Скасувати" першою — safe default при Enter */}
  <Button slot="close" autoFocus>{m.cancel()}</Button>
  <Button variant="destructive" onPress={onConfirm}>{confirmLabel}</Button>
</AlertDialog>
```

**Focus:** `autoFocus` на "Скасувати" (safe default).  
**Escape:** закриває без дії.  
**Role:** `alertdialog` (NVDA/JAWS оголошують як alert).

---

## 11. Оголошення для Screen Reader

### 11.1. Таблиця подій

| Подія | Пріоритет | Текст (uk) |
|---|---|---|
| Track changed | `polite` | "Зараз грає: {artist} — {title}" |
| Recording started | `assertive` | "Запис розпочато: {station}" |
| Recording stopped | `assertive` | "Запис зупинено: {station}" |
| Connection error | `assertive` | "Помилка з'єднання: {station}" |
| Reconnecting | `polite` | "Перепідключення: {station}, спроба {n}" |
| Reconnected | `polite` | "З'єднання відновлено: {station}" |
| Scheduled started | `assertive` | "Плановий запис розпочато: {station}" |
| Scheduled completed | `assertive` | "Плановий запис завершено: {station}" |
| Wishlist match | `assertive` | "Знайдено бажану пісню: {title}" |
| Disk space low | `assertive` | "Увага: мало місця на диску ({gb} ГБ)" |
| Profile changed | `polite` | "Профіль змінено: {name}" |
| Station added | `polite` | "Станцію додано: {name}" |
| Station removed | `polite` | "Станцію видалено: {name}" |
| Stream deleted (undo) | `polite` | "Потік \"{name}\" видалено. Скасувати — 5 сек." (undo toast з кнопкою) |
| Song deleted | `polite` | "Пісню видалено: {name}" |
| Tags saved | `polite` | "Теги збережено" |
| Settings saved | `polite` | "Налаштування збережено" |
| Search results | `polite` | "Знайдено {n} станцій" |
| No results | `polite` | "Нічого не знайдено" |

### 11.2. Throttling

Track-changed для того самого потоку throttle 3 секунди (ICY metadata іноді мерехтить).

### 11.3. Реалізація

```typescript
// stores/announcer.ts
import { atom } from "nanostores";

interface Announcement {
  message: string;
  priority: "polite" | "assertive";
  id: number;
}

export const $announcement = atom<Announcement | null>(null);

let counter = 0;

export function announce(message: string, priority: "polite" | "assertive" = "polite") {
  $announcement.set({ message, priority, id: ++counter });
}

// hooks/useTauriAnnouncements.ts
// Підписка на Tauri events → announce()
listen("track-changed", (e) => {
  announce(m.nowPlaying({ artist: e.payload.artist, title: e.payload.title }));
});
listen("recording-status", (e) => {
  if (e.payload.status === "recording") {
    announce(m.recordingStarted({ station: e.payload.stationName }), "assertive");
  }
  // ...
});
```

---

## 12. Правило `event.code` vs `event.key`

ВСІ клавіатурні обробники в додатку МАЮТЬ використовувати `event.code` (фізична позиція клавіші), а НЕ `event.key` (символ, залежний від розкладки). Це критично для українських користувачів:

- `event.key` на кириличній розкладці дає `"ф"` замість `"a"`, `"і"` замість `"s"` — хоткеї перестають працювати
- `event.code` завжди повертає `"KeyA"`, `"KeyS"` незалежно від розкладки

```typescript
// ✅ Правильно
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.code === "KeyF") { /* пошук */ }
});

// ❌ Неправильно — не працює на кириличній розкладці
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "f") { /* пошук */ }
});
```

Виняток: `Escape`, `Enter`, `Space`, `Tab`, а також **навігаційні/функційні
клавіші** — стрілки (`ArrowUp`…), `Home`/`End`, `PageUp`/`PageDown`, `Delete` і
функційний ряд `F1`–`F24`. Усі вони не несуть символу, тож `event.key` для них не
залежить від розкладки й дорівнює `event.code`. Саме тому `resolveKeyAction`
([useCompositeList.ts](../src/hooks/useCompositeList.ts)) метчить `F2`/`F5` і
стрілки через `event.key`, а `Ctrl+C`/`Ctrl+A`/`Space` у тому самому місці — через
`event.code`. Правило залишається обов'язковим для **літер і цифр**, де розкладка
й вирішує.

> React Aria Components вже використовує `event.code` внутрішньо. Це правило стосується кастомних обробників.

---

## 13. Глобальні гарячі клавіші

| Дія | Default | Scope |
|---|---|---|
| Toggle recording | Ctrl+Shift+R | Global (працює у фоні) |
| Toggle playback | Ctrl+Shift+K | Global |
| Volume up (+5%) | Ctrl+Alt+Up | Global |
| Volume down (-5%) | Ctrl+Alt+Down | Global |
| Show/hide window | Ctrl+Shift+H | Global |
| Stop all (зупинити весь запис) | Ctrl+Shift+S | Global |
| Previous track | Ctrl+Alt+Left | Global |
| Next track | Ctrl+Alt+Right | Global |

Реалізація через `tauri-plugin-global-shortcut`. Усі клавіші налаштовуються.
Принцип вибору дефолтів (літери на `Ctrl+Shift`, стрілки на `Ctrl+Alt`) —
[keyboard-shortcuts.md](keyboard-shortcuts.md), розділ «Принципи вибору Tier-1 дефолтів».

#### Оголошення toggle_playback (Ctrl+Shift+K)

`toggle_playback` — джерело-залежний перемикач; кожен перехід оголошується
через LiveAnnouncer разом із назвою джерела (назва станції або трек):

| Перехід | Оголошення |
|---|---|
| Стрім зупинено (`stop`) | «Зупинено — <назва станції>» |
| Файл поставлено на паузу | «Пауза — <назва треку>» |
| Файл відновлено | «Відновлено — <назва треку>» |
| Холодний старт → стрім | «Підключення — <назва станції>» → «Відтворення: …» |
| Холодний старт → файл, `resumeFileFrom: position` (дефолт) і збережена позиція > 0 | «Відтворення — <назва треку>, з <mm:ss>» |
| Холодний старт → файл, `resumeFileFrom: start` (або збережена позиція 0) | «Відтворення: <назва треку>» (звичайний start-анонс, без позиції) |
| Останнє джерело недоступне | «Останнє відтворення недоступне» |

Оголошення відповідають подіям `player-announce` (`kind`: `"stop"` / `"pause"` /
`"resume"` / `"connecting"` / `"resuming"` / `"unavailable"` / `"error"`).
`"resuming"` — тільки cold-start-резюме файлу з позиції: озвучується **до**
`play_file`, за тим самим патерном, що й `"connecting"` для стрімів (де-ризик +
one-shot suppression наступного дубльованого «Відтворення: …»). Перемикач
`resumeFileFrom` профільний — діалог профілю (`Ctrl+Shift+,`) → «Відтворення»
([data-models.md](data-models.md#playersession)).

### Локальні клавіші (у вікні)

| Клавіша | Scope | Дія |
|---|---|---|
| Escape | Modal dialog | Закрити діалог |
| Escape | ComboBox popover | Закрити suggestions |
| Delete | Stream table row | Видалити потік (з підтвердженням) |
| F2 | Saved songs table row | Перейменувати |
| Ctrl+F | Saved songs tab | Focus на пошук |
| Ctrl+A | Any table | Вибрати всі |
| F1 | будь-де (якщо focus не в input) | Відкрити довідку клавіатурних скорочень |

---

## 14. Status Bar

```
StatusBar (role="contentinfo", aria-label="Статус")
├── "Записується: 3 потоки" (або "Немає активних записів")
├── "Диск: 45.2 ГБ вільно"
├── "Найдовший: 02:34" (тривалість найдовшого активного запису, приховано якщо немає записів)
└── "↓ 4.2 Mbps" (сумарна пропускна здатність, приховано якщо немає записів)
```

Кожна секція StatusBar має `aria-label`:
- `aria-label="Активні записи"`
- `aria-label="Вільний простір на диску"`
- `aria-label="Тривалість найдовшого запису"`
- `aria-label="Пропускна здатність"`

Текст оновлюється через `aria-live="polite"` тільки при зміні кількості записів або критичному рівні диску.

---

## 15. System Tray

Tray menu — нативне контекстне меню Windows. Доступність забезпечується ОС (NVDA/JAWS читають пункти автоматично).

### Контекстне меню tray (right-click)

```
Зараз грає: Radio Jazz — Miles Davis — So What      ← disabled, тільки якщо грає
─────────
Грати / Пауза
Зупинити                                              ← тільки якщо state != Stopped
─────────
● Записи: 2 активних                                 ← disabled, тільки якщо є записи
Зупинити всі записи                                   ← тільки якщо є записи
─────────
Показати Tapir / Приховати Tapir
─────────
Вихід
```

**Доступність пунктів:**

| Пункт | Screen reader оголосить | Примітка |
|-------|------------------------|----------|
| Зараз грає: … | "Зараз грає: {station} — {title}, недоступний" | `disabled` — NVDA додає "недоступний" |
| Грати / Пауза | "Грати" або "Пауза" | Текст змінюється за станом |
| Зупинити | "Зупинити" | Видимий тільки при відтворенні |
| ● Записи: N | "Записи: N активних, недоступний" | Інформаційний рядок |
| Зупинити всі записи | "Зупинити всі записи" | Видимий тільки коли є записи |
| Показати/Приховати | "Показати Tapir" або "Приховати Tapir" | |
| Вихід | "Вихід" | Якщо є записи → confirm dialog |

**Left-click на іконку:** toggle показу/приховування вікна.

### Balloon tip (сповіщення)

При зміні треку (якщо `showTrayNotifications: true`):

- **Title:** назва станції
- **Body:** "Artist — Title"
- Через system tray balloon API (не toast, щоб уникнути "PowerShell")
- NVDA автоматично оголошує balloon tip як notification
- Throttle: 3 секунди (ICY metadata flicker)

---

## 16. Тестування доступності

### 16.1. Manual testing checklist

Для кожного екрану перевірити:

- [ ] Tab через усі інтерактивні елементи — жоден не пропущений
- [ ] Shift+Tab — зворотний порядок коректний
- [ ] Focus indicator видимий на кожному елементі
- [ ] NVDA browse mode (↓): весь вміст читається логічно
- [ ] NVDA focus mode: таблиці навігуються Arrow keys
- [ ] Кожна кнопка має accessible name
- [ ] Кожен input має label
- [ ] Діалоги trap focus
- [ ] Escape закриває діалоги
- [ ] Live regions оголошують зміни
- [ ] High Contrast: усі елементи видимі

### 16.2. Automated checks

- `eslint-plugin-jsx-a11y` — статичний аналіз ARIA
- React Aria — вбудовані runtime warnings для невалідних ARIA patterns

### 16.3. Screen reader test matrix

| Дія | NVDA | JAWS | Narrator |
|---|---|---|---|
| Tab навігація | ○ | ○ | ○ |
| Table grid navigation | ○ | ○ | ○ |
| Live region announcements | ○ | ○ | ○ |
| Dialog focus trap | ○ | ○ | ○ |
| Slider (volume) | ○ | ○ | ○ |
| ComboBox suggestions | ○ | ○ | ○ |
| Toggle button state | ○ | ○ | ○ |
| High Contrast | ○ | ○ | ○ |

○ = потребує тестування при реалізації

---

## 17. Відомі обмеження та workarounds

| Проблема | Деталі | Workaround |
|---|---|---|
| NVDA mouse tracking | Bug Tauri #12901 — frameless window | `decorations: true` (обов'язково) |
| NVDA IA2 vs UIA | Bug NVDA #19276 — деякі ARIA атрибути ігноруються | Рекомендувати в FAQ: `Use UI Automation when available → Yes` |
| JAWS virtual cursor | JAWS може конфліктувати з SPA routing | React Aria focus management вирішує |
| Toast "PowerShell" | `tauri-plugin-notification` у portable mode | Balloon tip через system tray |
| NVDA мовчить на старті | Вікно `visible:false` показували з JS після завантаження даних → інколи webview ініціалізувався, поки вікно ще не foreground; NVDA приєднувався «у фоні» й не озвучував фокус (≈кожен 5-й запуск працював) | `show()` + `set_focus()` у Rust `setup()`, до завантаження webview (§17.1). Детальніше: [docs/notes/screenreader-startup-foreground.md](notes/screenreader-startup-foreground.md) |

### 17.1. Старт: вікно має бути foreground до ініціалізації webview

**Правило:** якщо головне вікно стартує прихованим (`visible: false`), показуй і фокусуй його з **Rust** (`setup()`), а **не** з JS після `await` завантаження даних.

**Чому.** NVDA приєднується до документа Chromium/WebView2 у момент його ініціалізації. Якщо тоді вікно ще не є OS-foreground, NVDA «чіпляється» до фонового документа й більше **не озвучує** події фокусу для цієї сесії — хоч би коли і куди ми потім ставили фокус. Показ вікна з JS відбувається на ~100+ мс пізніше (після `Promise.all` IPC-викликів), і до того часу Windows foreground-activation grant (виданий на запуск застосунку) часто вже згорів → `setFocus()` не отримує реального foreground.

**Симптом.** Візуально все працює, але NVDA мовчить на старті частіше за все; немає переходу browse/focus mode. Інколи (коли таймінг збігся) — озвучує. Невідтворюваність == гонка.

**Діагностична ознака (100% кореляція):** `document.hasFocus() === true` на момент ініціалізації webview ⇔ NVDA озвучує. `false` ⇔ мовчить.

**Рішення:** [src-tauri/src/lib.rs](../src-tauri/src/lib.rs) — у `setup()` одразу `main_window.show()` + `main_window.set_focus()`. JS лише переводить фокус на перший елемент навігації після завантаження даних ([src/App.tsx](../src/App.tsx)).
