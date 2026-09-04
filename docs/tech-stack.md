# Технологічний стек Tapir

> **Версія продукту:** 0.1.0 | **Звірено з кодом:** 2026-09-04  
> **Платформа:** Windows 11+, portable EXE  
> **Архітектура:** Tauri v2 (Rust backend + WebView2 frontend)

Джерело правди про залежності — [`package.json`](../package.json) і
[`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml). Цей документ пояснює **чому** обрано
кожен інструмент; версії тут наведені з точністю до мажорної й мусять збігатися з
маніфестами.

---

## Зведена таблиця

### Frontend (`package.json`)

| Шар | Технологія | Версія | Призначення |
|---|---|---|---|
| **Runtime** | Tauri v2 | 2.x | Портативний EXE, WebView2, Rust backend |
| **Frontend** | React | 19.x | UI framework |
| **UI Components** | react-aria-components | 1.x | Accessible headless components (Adobe) |
| **Іконки** | lucide-react | 1.x | Tree-shakeable SVG іконки (ISC) |
| **CSS** | Tailwind CSS | 4.x | Стилі, forced-colors, dark mode |
| **State** | nanostores + @nanostores/react | 0.11 / 0.8 | Міст між Tauri-подіями і React |
| **i18n** | @inlang/paraglide-js | 2.x | Compiler-based, uk/en |
| **Bundler** | Vite + @vitejs/plugin-react | 8.x / 6.x | Frontend build |
| **Тести** | Vitest + @testing-library/react + jsdom | 4.x / 16.x / 29.x | `pnpm test`; поруч `@testing-library/dom` 10.x, `/jest-dom` 6.x, `/user-event` 14.x |
| **Довідка** | unified | 11.x | Компіляція `docs/help/` у HTML на збірці — remark-parse, remark-gfm, remark-rehype, rehype-sanitize, rehype-stringify у [`build/markdownHelpPlugin.ts`](../build/markdownHelpPlugin.ts) |
| **Типи** | TypeScript | 5.7 | `pnpm typecheck` |

З боку JS імпортується лише `@tauri-apps/api` (`core`, `event`, `window`): усі плагіни
викликаються з Rust, а webview дістає результат через IPC — див.
[Tauri Plugins](#tauri-plugins).

### Backend (`src-tauri/Cargo.toml`)

| Шар | Крейт | Версія | Призначення |
|---|---|---|---|
| **HTTP Streaming** | reqwest | 0.13 | Async HTTP client (rustls, без OpenSSL) |
| **ICY Protocol** | icy-metadata | 0.6 | Заголовки підключення (`IcyHeaders`) і розмітка ефіру (`IcyMetadataReader`) |
| **Stream Buffer** | rtrb | 0.3 | Lock-free ring buffer між мережевим писарем і декодером |
| **Playback** | rodio | 0.22 | WASAPI audio output, mixer, гучність |
| **Decoding** | symphonia | 0.5 | MP3 + AAC-LC decoder (прямий доступ для `LiveSource`) |
| **Tags** | lofty | 0.24 | ID3v2 + M4A metadata |
| **CLI** | clap | 4 | Розбір argv (`cli.rs`), `derive` |
| **Async** | tokio + tokio-util + futures-util + bytes | ~1.51 / 0.7 / 0.3 / 1 | Async runtime і потокові утиліти |
| **Logging** | tauri-plugin-log + log | 2 / 0.4 | Файловий лог у `data/logs/`, `log::*` макроси |
| **Win32 / WinRT** | windows | 0.62 | MessageBox підтвердження виходу, Shell (кошик, «відкрити у програмі»), WinRT Media для SMTC |
| **Реєстр** | winreg | 0.55 | AUMID для тостів + `HKCU\…\Run` для автозапуску |
| **Errors** | anyhow + thiserror | 1 / 2 | Error handling |
| **Serde** | serde + serde_json | 1 / 1 | Серіалізація стану й IPC |
| **Time** | chrono | 0.4 | Date/time з serde |
| **Locale** | sys-locale | 0.3 | System locale detection |
| **Ідентифікатори** | nanoid | 0.4 | Ключі потоків, записів, патернів |
| **Файли** | walkdir | 2 | Обхід каталогів записів |
| **Кодування** | encoding_rs | 0.8 | cp1251-fallback для старих плейлистів Winamp/SHOUTcast |

---

## Frontend

### React 19 + React Aria Components

React Aria (Adobe) — єдина UI-бібліотека з документованим тестуванням проти JAWS та NVDA
на Windows. У коді використано ці компоненти (звірено з імпортами в `src/`):

- **Modal + ModalOverlay + Dialog + Heading** — усі діалоги з focus trap. `DialogTrigger`
  **не** використовується: діалоги відкриваються зі стану, а не з тригера-кнопки.
- **Tabs + TabList + Tab + TabPanel** — вкладки **всередині** екранів і діалогів: Wishlist,
  налаштування профілю, налаштування програми, довідка `F1`. Головна навігація — не
  вкладки, а кнопки Activity Bar із `aria-pressed` і `Alt+0`…`Alt+5`.
- **Button** — кнопки скрізь, `aria-pressed` для перемикачів.
- **Menu + MenuTrigger + MenuItem + Popover + Separator** — контекстні меню списків.
- **Slider + SliderThumb + SliderTrack** — гучність і позиція відтворення.
- **ProgressBar** — позиція в прямому ефірі, де перемотка неможлива.
- **SearchField, TextField, Input, Label, Group** — поля форм і фільтрів.
- **Select + SelectValue + ListBox + ListBoxItem** — випадні списки (формати, пристрої,
  рівні логування). `ComboBox` у коді немає.
- **NumberField** — числові поля налаштувань.
- **Checkbox, RadioGroup + Radio** — прапорці й перемикачі форм.

**Списків React Aria в застосунку немає.** `TableView` і `GridList` не використовуються:
всі списки — станції, записи, патерни, збіги, розклади, профілі — це власний
[`CompositeList`](../src/components/common/composite-list/CompositeList.tsx) із
`role="application"`, роумінг-фокусом і `role="listitem"` на кожному рядку. Причини й
клавіатурна модель — [accessibility.md](accessibility.md) §3.

### lucide-react

Tree-shakeable SVG icon library (~1,500+ іконок, ISC ліцензія). Кожна іконка ~400 Б після
tree-shaking. Імпорт:

```tsx
import { Radio, Play, Pause, Settings } from 'lucide-react';

// Декоративна іконка (React Aria надає accessible name через Button):
<Button aria-label="Відтворити">
  <Play aria-hidden="true" size={20} />
</Button>
```

Обрано за результатами дослідження: tree-shakeable SVG, ISC ліцензія, повний набір
media/UI іконок. Перелік конкретних іконок тут **не дублюється** — він дрейфує з кожним
новим екраном; актуальний список дає пошук імпортів `lucide-react` у `src/`.

### Tailwind CSS v4

- `forced-colors:` — Windows High Contrast
- `dark:` — dark/light theme
- `sr-only` — screen reader-only text
- `focus-visible:ring-*` — видимий focus indicator

### Nanostores

Framework-agnostic state (286 bytes). Bridge між Tauri events і React через
`@nanostores/react`.

### Paraglide.js

Compiler-based i18n. Мінімальний runtime, tree-shakable, typesafe. Українські множини
через `Intl.PluralRules` (one/few/many/other). Компілюється **на диск** у
`src/i18n/paraglide/` під час `pnpm vite:build` — тому `just check` починається зі збірки.

---

## Rust Backend

### HTTP Streaming

| Crate | Призначення |
|---|---|
| `reqwest` 0.13 | Async HTTP client: streaming body, TLS (rustls), proxy, basic auth. `default-features = false` — без OpenSSL |
| `icy-metadata` 0.6 | Заголовки підключення (`IcyHeaders`) і метадані ефіру: `IcyMetadataReader` рахує metaint, знімає блоки й віддає `StreamTitle` у callback ([`stream/connection.rs`](../src-tauri/src/stream/connection.rs)) |
| `rtrb` 0.3 | Кільцевий буфер між async-писарем і блокуючим декодером ([`player/engine.rs`](../src-tauri/src/player/engine.rs)) |

### Audio

| Crate | Призначення |
|---|---|
| `rodio` 0.22 | Playback через WASAPI (cpal), mixer, volume |
| `symphonia` 0.5 | MP3 (Excellent) + AAC-LC (Great) decoder, pure Rust. Підключений і через фічі `rodio`, і напряму — для власного `LiveSource` |

⚠️ **Обмеження:** HE-AAC (aacPlus, 32-64 kbps) не підтримується symphonia. Запис raw
bytes працює, відтворення — ні.

### Tags

`lofty` 0.24 — єдиний API для MP3 (ID3v2) + M4A (iTunes ilst).

### PLS/M3U

Ручна реалізація ([`stream/playlist.rs`](../src-tauri/src/stream/playlist.rs)). Існуючі
крейти застарілі. cp1251-fallback для імпорту старих списків Winamp/SHOUTcast —
`encoding_rs`.

---

## Tauri Plugins

У `Cargo.toml` рівно п'ять плагінів; трей у таблиці — не плагін, а core-фіча Tauri:

| Функція | Плагін / Рішення | Portable |
|---|---|---|
| System Tray | Tauri core (`tray-icon` feature) | ✅ |
| Global Shortcuts | `tauri-plugin-global-shortcut` | ✅ |
| Single Instance | `tauri-plugin-single-instance` | ✅ |
| File Dialog | `tauri-plugin-dialog` | ✅ |
| Logging | `tauri-plugin-log` | ✅ |
| Notifications | `tauri-plugin-notification` + реєстрація AUMID (`winreg`) | ✅ |

Тости трею йдуть саме через плагін: Windows 10+ перенаправляє balloon-виклики
`Shell_NotifyIconW` у toast і **мовчки викидає** їх, коли AUMID не зареєстровано.
Portable-збірка не має ярлика в меню «Пуск», тому AUMID реєструється сама, одним ключем
під `HKCU\Software\Classes\AppUserModelId`
([`tray/notify.rs`](../src-tauri/src/tray/notify.rs)).

### Розглянуто й відхилено

| Плагін | Чому не потрібен |
|---|---|
| `tauri-plugin-cli` | argv розбирає `clap` у Rust (`cli.rs`) — один парсер і для власного argv, і для argv другого екземпляра |
| `tauri-plugin-http` | HTTP ходить із Rust через `reqwest`; webview зовнішніх запитів не робить (у CSP немає жодного зовнішнього `connect-src`) |
| `tauri-plugin-fs` | усі файли читає й пише Rust; webview отримує готові дані через IPC |
| `tauri-plugin-shell` | «відкрити у програмі за замовчуванням» робить `ShellExecuteW`, кошик — `SHFileOperationW` (обидва з крейта `windows`); scope плагіна нічого не додає |
| `tauri-plugin-window-state` | писав у `%APPDATA%`; геометрія тепер у `data/window.json` (`window_state.rs`) — [ADR межа портативності](decisions/2026-09-04-portable-boundary.md) |
| `tauri-plugin-autostart` | запис `HKCU\…\Run` робимо самі (`autostart.rs`): команда залежить від `autostart_minimized`, а при переїзді EXE запис треба звіряти й гасити |

---

## Конфігурація проекту

Файли конфігурації тут **не цитуються**: копія дрейфує при кожній правці, і читач
однаково мусить відкрити оригінал.

| Файл | Що в ньому |
|---|---|
| [`package.json`](../package.json) | JS-залежності, скрипти (`dev`, `build`, `test`, `typecheck`), `packageManager` |
| [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml) | Rust-залежності, профілі `release` і `release-fast` |
| [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) | `identifier` (`ua.ruslanrv.tapir`), вікно, CSP, bundle |
| [`src-tauri/capabilities/default.json`](../src-tauri/capabilities/default.json) | Дозволи IPC — ядро плюс чотири плагіни, які webview кличе: `dialog`, `log`, `global-shortcut`, `notification` (single-instance дозволу не потребує) |
| [`justfile`](../justfile) | Команди збірки й ворота (`just check`) |

Два місця, де легко помилитись:

- **Capabilities.** Tauri v2 вимагає явного дозволу на кожну команду плагіна. Немає
  дозволу — плагін мовчки не працює, хоча підключений у `Cargo.toml`.
- **`--no-bundle`.** Пропускає створення NSIS/MSI, виробляючи standalone `.exe` — саме
  той файл, який роздається користувачам.

### Синхронізація версій

Три файли мають завжди мати однакову версію; сторож —
[`src/lib/versionSync.test.ts`](../src/lib/versionSync.test.ts).

| Файл | Поле |
|------|------|
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` |
| `src-tauri/Cargo.toml` | `version =` |

---

## Accessibility

### Вимоги до WebView2

- **`decorations: true`** — обов'язково (NVDA mouse tracking bug Tauri #12901)
- ARIA → UIA mapping через W3C Core AAM 1.2 (підтверджено)
- Upstream NVDA #19276: рекомендувати користувачам `Use UI Automation when available → Yes`

### React Aria забезпечує

- Focus trap і повернення фокуса для модальних діалогів
- `Slider` з `aria-valuemin`/`max`/`now`, `ProgressBar` з `aria-valuenow`
- Клавіатурну модель меню, вкладок і полів форм

Live-регіони React Aria (`@react-aria/live-announcer`) Tapir **не** використовує: у
застосунку власний `LiveAnnouncer` (`role="log"`, новий вузол на кожне повідомлення) —
[accessibility.md](accessibility.md) §1.4.

---

## Відомі обмеження

| Обмеження | Вплив | Мітигація |
|---|---|---|
| HE-AAC не декодується | Деякі 32-64 kbps станції не програються | Запис raw bytes працює; моніторити symphonia roadmap |
| `decorations: true` | Кастомний titlebar неможливий | Стандартний Windows titlebar — прийнятно для a11y-first |
| NVDA IA2 vs UIA | Mouse tracking обмежений без налаштувань | Документувати для користувачів |
| Тост без AUMID | Windows мовчки викидає сповіщення portable-збірки | Одноразова реєстрація AUMID у `HKCU` при запуску (`tray/notify.rs`) |
| Autostart portable | Шлях у реєстрі стає невалідним при переміщенні EXE | Звірка при кожному запуску; якщо EXE переїхав — автозапуск вимикається (`autostart.rs`) |
| WebView2 у `%LOCALAPPDATA%` | Портативність неповна: профіль движка лишається на машині | Свідомо прийнято — [ADR межа портативності](decisions/2026-09-04-portable-boundary.md) |
| symphonia MPL-2.0 | Copyleft на рівні файлів | Дозволяє комбінування; модифіковані файли мають бути відкритими |
