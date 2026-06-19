# Технологічний стек Tapir

> **Версія:** 0.1 (draft) | **Версія продукту:** 0.1.0  
> **Платформа:** Windows 11+, portable EXE  
> **Архітектура:** Tauri v2 (Rust backend + WebView2 frontend)

---

## Зведена таблиця

| Шар | Технологія | Версія | Призначення |
|---|---|---|---|
| **Runtime** | Tauri v2 | 2.x | Портативний EXE, WebView2, Rust backend |
| **Frontend** | React 19 | 19.x | UI framework |
| **UI Components** | React Aria Components | latest | Accessible headless components (Adobe) |
| **Іконки** | lucide-react | latest | Tree-shakeable SVG іконки (ISC) |
| **CSS** | Tailwind CSS v4 | 4.x | Стилі, forced-colors, dark mode |
| **State** | Nanostores | latest | Tauri IPC bridge (286 bytes) |
| **i18n** | Paraglide.js | latest | Compiler-based, uk/en |
| **Bundler** | Vite | 8.x | Frontend build |
| **HTTP Streaming** | reqwest | 0.13 | Async HTTP client |
| **ICY Protocol** | icy-metadata | 0.6 | ICY заголовки (лише `IcyHeaders`; парсинг метаданих потоку — ручний) |
| **Stream Buffer** | stream-download | 0.24 | Ring buffer для стрімів |
| **Playback** | rodio | 0.22 | WASAPI audio output |
| **Decoding (MP3/AAC-LC)** | symphonia | 0.5.5 | MP3 + AAC-LC decoder (pure Rust) |
| **Decoding (HE-AAC)** | Windows Media Foundation | OS | HE-AAC/HE-AACv2 (SBR+PS) через `IMFSourceReader`; Windows-only, без бандлу |
| **Tags** | lofty | 0.23 | ID3v2 + M4A metadata |
| **Async** | tokio | ~1.51 | Async runtime (LTS) |
| **Logging** | tauri-plugin-log + log | 2.x / 0.4 | Файловий лог у `data/logs/`, `log::*` макроси |
| **Win API** | windows-rs | 0.62 | Registry, toast, balloon tip, Media Foundation (HE-AAC) |
| **Errors** | anyhow + thiserror | 1 / 2 | Error handling |
| **Time** | chrono | 0.4 | Date/time з serde |
| **Locale** | sys-locale | 0.3 | System locale detection |

---

## Frontend

### React 19 + React Aria Components

React Aria (Adobe) — єдина UI-бібліотека з документованим тестуванням проти JAWS та NVDA на Windows. Використовувані компоненти:

- **TableView** — потоки, збережені пісні, розклад (sortable)
- **Tabs** — основна навігація
- **DialogTrigger + Modal** — діалоги з focus trap
- **ComboBox** — пошук станцій
- **Slider** — гучність
- **ProgressBar** — конвертація, позиція відтворення
- **Menu / ContextMenu** — контекстне меню
- **Button** — з aria-pressed для toggle

### lucide-react

Tree-shakeable SVG icon library (~1,500+ іконок, ISC ліцензія). Кожна іконка ~400 Б після tree-shaking. Імпорт:

```tsx
import { Radio, Play, Pause, Settings } from 'lucide-react';

// Декоративна іконка (React Aria надає accessible name через Button):
<Button aria-label="Відтворити">
  <Play aria-hidden="true" size={20} />
</Button>
```

Обрано за результатами дослідження (lucide-react: tree-shakeable SVG, ISC ліцензія, повний набір media/UI іконок).

#### Маппінг іконок

| Lucide іконка | Імпорт | Де використовується |
|---|---|---|
| `Radio` | `Radio` | Activity Bar — секція «Потоки» |
| `Globe` | `Globe` | Activity Bar — секція «Браузер» |
| `Music` | `Music` | Activity Bar — секція «Пісні» |
| `Calendar` | `Calendar` | Activity Bar — секція «Розклад» |
| `Heart` | `Heart` | Activity Bar — секція «Wishlist/Ignorelist» |
| `Settings` | `Settings` | Activity Bar — кнопка налаштувань (⚙️) |
| `Play` | `Play` | Player bar — відтворення |
| `Pause` | `Pause` | Player bar — пауза |
| `Square` | `Square` | Player bar — стоп |
| `Circle` | `Circle` | Player bar — запис (record) |
| `Volume2` | `Volume2` | Player bar — гучність (нормальна) |
| `VolumeX` | `VolumeX` | Player bar — гучність (muted) |
| `Search` | `Search` | Command Palette, пошук станцій |
| `Plus` | `Plus` | Додати потік/розклад |
| `Trash2` | `Trash2` | Видалити елемент |
| `Pencil` | `Pencil` | Редагувати елемент |
| `MoreVertical` | `MoreVertical` | Контекстне меню (kebab) |
| `ChevronUp` | `ChevronUp` | Розгортання/згортання |
| `ChevronDown` | `ChevronDown` | Розгортання/згортання |
| `Download` | `Download` | Завантажити/зберегти запис |
| `FolderOpen` | `FolderOpen` | Відкрити папку записів |
| `List` | `List` | Перемкнути вигляд списку |
| `Check` | `Check` | Підтвердження, вибраний елемент |
| `X` | `X` | Закрити діалог, скасувати |
| `Star` | `Star` | Wishlist — додати/прибрати |
| `Ban` | `Ban` | Ignorelist — заблокувати пісню |

### Tailwind CSS v4

- `forced-colors:` — Windows High Contrast
- `dark:` — dark/light theme
- `sr-only` — screen reader-only text
- `focus-visible:ring-*` — видимий focus indicator

### Nanostores

Framework-agnostic state (286 bytes). Bridge між Tauri events і React через `@nanostores/react`.

### Paraglide.js

Compiler-based i18n. Мінімальний runtime, tree-shakable, typesafe. Українські множини через `Intl.PluralRules` (one/few/many/other).

---

## Rust Backend

### HTTP Streaming

| Crate | Призначення |
|---|---|
| `reqwest` 0.13 | Async HTTP client: streaming body, TLS, proxy, basic auth |
| `icy-metadata` 0.6 | Парсинг ICY заголовків підключення (`IcyHeaders`). Метадані потоку (StreamTitle) парсяться вручну через ICY протокол (metaint) |
| `stream-download` 0.24 | Кільцевий буфер для нескінченних (infinite) стрімів |

### Audio

| Crate | Призначення |
|---|---|
| `rodio` 0.22 | Playback через WASAPI (cpal), mixer, volume |
| `symphonia` 0.5.5 | MP3 (Excellent) + AAC-LC (Great) decoder, pure Rust |
| Windows Media Foundation (`windows` crate) | HE-AAC / HE-AACv2 (SBR+PS) decode — OS-наданий кодек, без бандлу |

**Декодування live-стрімів** абстраговане за трейтом `LiveDecoder` (`next_pcm` → інтерлівані f32 + `spec`), а `LiveSource` — тонкий `rodio::Source`-адаптер над *будь-яким* декодером:

- `SymphoniaDecoder` — MP3 та **AAC-LC** (поведінка незмінна).
- `MfAacDecoder` (`#[cfg(windows)]`) — **HE-AAC/HE-AACv2**, які symphonia декодувати не вміє (його AAC-декодер реалізує лише AAC-LC; SBR/PS не підтримуються, тож 16 kbps станції на кшталт SomaFM `groovesalad-16-aac` ніколи не дають придатний фрейм). Бекенд — AAC-декодер Media Foundation через `IMFSourceReader` поверх власного `IMFByteStream`, що обгортає live-кільце байтів (`rtrb`). Уся COM/MF-робота виконується на окремому потоці декодера (MTA), а `next_pcm` лише приймає f32-блоки з каналу.

`LiveSource::new` маршрутизує за `content_type`: `audio/aac`/`audio/aacp`/`application/aac`/`audio/x-aac`/`audio/mp4` → Media Foundation; `audio/mpeg` та невідомі → symphonia. Якщо MF недоступний (напр. Windows «N»-видання без Media Feature Pack), ініціалізація повертає типізовану помилку `UnsupportedStreamFormat`, яку фронтенд локалізує замість «зависання» чи raw-тексту.

> **Чому не просто оновити symphonia?** Станом на 0.6.0 (травень 2026) HE-AAC у symphonia все ще не реалізований (`he-aac`/`he-aac-v2` — зарезервовані заглушки). Тригер перегляду: якщо symphonia додасть реальний SBR/PS, можна буде замінити `MfAacDecoder` на «bump symphonia + увімкнути `he-aac-v2`».

### Tags

`lofty` 0.23 — єдиний API для MP3 (ID3v2) + M4A (iTunes ilst).

### PLS/M3U

Ручна реалізація (~30 рядків кожен формат). Існуючі крейти застарілі.

---

## Tauri Plugins

| Функція | Плагін / Рішення | Portable |
|---|---|---|
| System Tray | Tauri core (`tray-icon` feature) | ✅ |
| Global Shortcuts | `tauri-plugin-global-shortcut` | ✅ |
| Single Instance | `tauri-plugin-single-instance` | ✅ |
| CLI Arguments | `tauri-plugin-cli` | ✅ |
| Window State | `tauri-plugin-window-state` | ✅ |
| File System (JS) | `tauri-plugin-fs` | ✅ |
| HTTP Client (JS) | `tauri-plugin-http` | ✅ |
| Shell / Process | `tauri-plugin-shell` | ✅ |
| File Dialog | `tauri-plugin-dialog` | ✅ |
| Logging | `tauri-plugin-log` | ✅ |
| Autostart | `tauri-plugin-autostart` | ⚠️ абсолютний шлях у реєстрі |
| Notifications | Tray balloon tip (Win32) | ✅ |

`tauri-plugin-notification` показує "PowerShell" у portable mode → використовувати balloon tip через system tray або `windows-rs`.

---

## Конфігурація проекту

### package.json

```json
{
  "name": "tapir",
  "version": "0.1.0",
  "scripts": {
    "tauri": "tauri",
    "dev": "tauri dev",
    "build": "tauri build --no-bundle",
    "build:fast": "tauri build --profile release-fast --no-bundle",
    "vite:dev": "vite dev --port 1420",
    "vite:build": "vite build"
  },
  "packageManager": "pnpm@10.32.1",
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-cli": "^2",
    "@tauri-apps/plugin-global-shortcut": "^2",
    "@tauri-apps/plugin-fs": "^2",
    "@tauri-apps/plugin-http": "^2",
    "@tauri-apps/plugin-log": "^2",
    "@tauri-apps/plugin-notification": "^2",
    "@tauri-apps/plugin-shell": "^2",
    "@tauri-apps/plugin-dialog": "^2",
    "@tauri-apps/plugin-window-state": "^2",
    "@tauri-apps/plugin-autostart": "^2",
    "react": "^19",
    "react-dom": "^19",
    "react-aria-components": "^1",
    "lucide-react": "^1",
    "nanostores": "^0.11",
    "@nanostores/react": "^0.8"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react-swc": "^4",
    "vite": "^8",
    "@tailwindcss/vite": "^4",
    "tailwindcss": "^4",
    "typescript": "^5.7"
  }
}
```

### Cargo.toml

```toml
[package]
name = "tapir"
version = "0.1.0"
description = "Accessible Internet Radio Recorder for Windows"
edition = "2024"

[lib]
name = "tapir_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
# Tauri
tauri = { version = "2", features = ["tray-icon"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# Tauri Plugins
tauri-plugin-single-instance = "2"
tauri-plugin-global-shortcut = "2"
tauri-plugin-cli = "2"
tauri-plugin-window-state = "2"
tauri-plugin-fs = { version = "2", features = ["watch"] }
tauri-plugin-log = "2"
tauri-plugin-http = "2"
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-notification = "2"
tauri-plugin-autostart = "2"

# HTTP Streaming
reqwest = { version = "0.13", features = ["stream"] }
icy-metadata = { version = "0.6", features = ["reqwest"] }
stream-download = { version = "0.24", features = ["reqwest-rustls"] }

# Audio
rodio = { version = "0.22", features = ["symphonia-mp3", "symphonia-aac", "symphonia-isomp4"] }

# Tags
lofty = "0.23"

# Async
tokio = { version = "~1.51", features = ["full"] }  # ~1.51 = >=1.51.0, <2.0.0 (SemVer tilde)
futures-util = "0.3"
bytes = "1"

# Logging
tracing = "0.1"
tracing-log = "0.2"
log = "0.4"

# Errors
anyhow = "1"
thiserror = "2"

# Misc
chrono = { version = "0.4", features = ["serde"] }
sys-locale = "0.3"

[target.'cfg(windows)'.dependencies]
windows = { version = "0.62", features = [
    "Win32_UI_Shell",
    "Win32_System_Registry",
    # Media Foundation — HE-AAC/HE-AACv2 decode (MfAacDecoder)
    "Win32_Media_MediaFoundation",
    "Win32_System_Com",
    "Win32_System_Com_StructuredStorage",
    "Win32_System_Variant",
] }
# Потрібен прямо, бо #[implement] для IMFByteStream емітить абсолютні ::windows_core:: шляхи
windows-core = "0.62"

[profile.release]
opt-level = "s"
lto = true
codegen-units = 1
strip = true
panic = "abort"

[profile.release-fast]
inherits = "release"
opt-level = 1
lto = false
codegen-units = 16
strip = false
panic = "unwind"
```

### tauri.conf.json

```json
{
  "productName": "Tapir",
  "version": "0.1.0",
  "identifier": "com.tapir.app",
  "build": {
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist",
    "beforeDevCommand": "pnpm vite:dev",
    "beforeBuildCommand": "pnpm vite:build"
  },
  "app": {
    "windows": [
      {
        "title": "Tapir",
        "label": "main",
        "width": 900,
        "height": 650,
        "minWidth": 640,
        "minHeight": 480,
        "visible": false,
        "decorations": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src ipc: http://ipc.localhost http://tauri.localhost https://*.api.radio-browser.info"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "cli": {
      "description": "Tapir — Internet Radio Recorder",
      "args": [
        { "name": "datadir", "takesValue": true, "description": "Data directory path" },
        { "name": "tempdir", "takesValue": true, "description": "Temp directory path" },
        { "name": "profile", "takesValue": true, "description": "Profile name to load" },
        { "name": "minimize", "description": "Start minimized" },
        { "name": "record", "short": "r", "takesValue": true, "description": "Record stream URL" },
        { "name": "play", "short": "p", "takesValue": true, "description": "Play stream URL" },
        { "name": "stop-recording", "description": "Stop recording" },
        { "name": "stop-playing", "description": "Stop playback" },
        { "name": "wishadd", "takesValue": true, "description": "Add to wishlist" },
        { "name": "wishremove", "takesValue": true, "description": "Remove from wishlist" }
      ]
    }
  }
}
```

### Capabilities (`src-tauri/capabilities/default.json`)

Tauri v2 вимагає явних дозволів для кожного плагіна. Без capabilities плагіни не працюватимуть.

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default permissions for Tapir",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-set-title",
    "core:window:allow-minimize",
    "core:window:allow-maximize",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:event:default",
    "cli:default",
    "dialog:default",
    "fs:default",
    "global-shortcut:default",
    "http:default",
    "log:default",
    "notification:default",
    "shell:default",
    "window-state:default",
    "autostart:default"
  ]
}
```

### justfile

```just
default:
    @just --list

# Start Tauri dev server (Vite + Rust watcher)
dev:
    pnpm tauri dev

# Production build — minimal exe, slow compile
build:
    pnpm tauri build --no-bundle

# Fast build — larger exe, quick compile (uses [profile.release-fast] in Cargo.toml)
build-fast:
    pnpm tauri build --no-bundle -- --profile release-fast

# Frontend-only dev server on port 1420
vite-dev:
    pnpm vite dev --port 1420

# Frontend-only production build to /dist
vite-build:
    pnpm vite build

# Clean Rust build artifacts
clean:
    cargo clean --manifest-path src-tauri/Cargo.toml

# Install JS dependencies
install:
    pnpm install
```

`--no-bundle` пропускає створення NSIS/MSI, виробляючи standalone `.exe`.

### Синхронізація версій

Три файли мають завжди мати однакову версію:

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

- TableView з ARIA grid pattern (sortable, keyboard navigable)
- Live regions через `@react-aria/live-announcer`
- Focus trap для модальних діалогів
- Slider з aria-valuemin/max/now
- ProgressBar з aria-valuenow

---

## Відомі обмеження

| Обмеження | Вплив | Мітигація |
|---|---|---|
| HE-AAC у symphonia (AAC-LC only) | symphonia сам не декодує HE-AAC/HE-AACv2 | Відтворення через Windows Media Foundation (`MfAacDecoder`); symphonia лишається для MP3/AAC-LC |
| MF AAC-кодек відсутній (Windows «N») | HE-AAC не програється на «N»-виданнях без Media Feature Pack | Типізована помилка `UnsupportedStreamFormat` + локалізоване повідомлення (не зависання) |
| `decorations: true` | Кастомний titlebar неможливий | Стандартний Windows titlebar — прийнятно для a11y-first |
| NVDA IA2 vs UIA | Mouse tracking обмежений без налаштувань | Документувати для користувачів |
| Notifications portable | Toast показує "PowerShell" | Balloon tip через system tray |
| Autostart portable | Шлях у реєстрі стає невалідним при переміщенні | Перевірка + оновлення шляху при кожному запуску |
| symphonia MPL-2.0 | Copyleft на рівні файлів | Дозволяє комбінування; модифіковані файли мають бути відкритими |

---

## Джерела досліджень

Детальні дослідницькі звіти:

- `research-tauri-webview2-accessibility.md` — WebView2 accessibility + screen readers
- `research-rust-radio-streaming-crates.md` — Rust audio crates порівняння
- `research-frontend-framework-accessibility.md` — вибір frontend framework
- `research-tauri-v2-plugins-radioapp.md` — інвентаризація Tauri v2 plugins
