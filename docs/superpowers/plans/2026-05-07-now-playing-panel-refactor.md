# Now Playing Panel Refactor — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рефакторинг Panel 1 («Зараз грає») у `PlayerPanel` — чистий idle-стан, видалення зайвого тексту, коректна підтримка локальних файлів, `aria-live` для NVDA.

**Architecture:** Зміни обмежені трьома областями: i18n-ключі (2 файли), новий `RecordingBadge` компонент (аналог `LiveBadge`), рефакторинг Panel 1 в `PlayerPanel.tsx`. Жодних Rust-змін.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Paraglide.js (i18n), React Aria Components.

**Spec:** `docs/superpowers/specs/2026-05-07-now-playing-panel-design.md`

**Перевірка компіляції:** `npx tsc --noEmit` (TypeScript), `cargo check --manifest-path src-tauri/Cargo.toml` (Rust — лише щоб впевнитись що нічого не зламано).

---

## Chunk 1: i18n + RecordingBadge + Panel 1 рефакторинг

### Task 1: i18n-ключі

**Files:**
- Modify: `src/i18n/messages/uk.json`
- Modify: `src/i18n/messages/en.json`

- [ ] **Step 1: Додати `player_nothing_playing` і `player_recording_badge` в `uk.json`**

Знайти рядок `"player_listening": "Прослуховування"` і замінити на два нових ключі (старий видалити):

```json
"player_nothing_playing": "Нічого не грає",
"player_recording_badge": "Запис",
```

Результат — `player_listening` зникає, два нових ключі на його місці.

- [ ] **Step 2: Те саме в `en.json`**

Замінити `"player_listening": "Listening"` на:

```json
"player_nothing_playing": "Nothing playing",
"player_recording_badge": "Recording",
```

- [ ] **Step 3: Регенерувати Paraglide-файли**

```powershell
cd C:\dev\Tapir
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide
```

Очікувано: команда завершується без помилок. У `src/i18n/paraglide/messages.js` з'являться `player_nothing_playing` і `player_recording_badge`, `player_listening` зникне.

- [ ] **Step 4: Перевірити що старий ключ зник**

```powershell
npx tsc --noEmit 2>&1 | Select-String "player_listening"
```

Очікувано: 0 збігів (або тільки помилка в `PlayerPanel.tsx` — це виправимо в Task 3).

- [ ] **Step 5: Commit**

```powershell
git add src/i18n/messages/uk.json src/i18n/messages/en.json
git commit -m "i18n: replace player_listening with player_nothing_playing + player_recording_badge"
```

---

### Task 2: Компонент `RecordingBadge`

**Files:**
- Create: `src/components/player/RecordingBadge.tsx`

`RecordingBadge` — без пропсів, аналог `LiveBadge` але без анімованої точки і з сірим стилем.

- [ ] **Step 1: Створити файл**

```tsx
// src/components/player/RecordingBadge.tsx
import * as m from "../../i18n/paraglide/messages";

export function RecordingBadge() {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5
                 rounded-full bg-slate-500/15 border border-slate-500/25
                 text-slate-400 text-xs font-semibold
                 forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]
                 shrink-0"
    >
      {m.player_recording_badge()}
    </span>
  );
}
```

- [ ] **Step 2: Регенерувати Paraglide і перевірити TypeScript**

```powershell
cd C:\dev\Tapir
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide
npx tsc --noEmit 2>&1 | Select-String "RecordingBadge"
```

Очікувано: 0 помилок для нового файлу.

- [ ] **Step 3: Commit**

```powershell
git add src/components/player/RecordingBadge.tsx
git commit -m "feat: add RecordingBadge component"
```

---

### Task 3: Рефакторинг Panel 1 у `PlayerPanel.tsx`

**Files:**
- Modify: `src/components/player/PlayerPanel.tsx`

Зміни:
1. Імпортувати `RecordingBadge`
2. Виправити `trackDisplay` — для файлів повертати `""` (порожньо)
3. Видалити `player_listening` з JSX
4. Переписати Panel 1 JSX — idle-стан, `aria-live`, `min-h`, підтримка файлів

- [ ] **Step 1: Додати імпорт `RecordingBadge`**

Знайти рядок:
```tsx
import { LiveBadge } from "./LiveBadge";
```
Замінити на:
```tsx
import { LiveBadge } from "./LiveBadge";
import { RecordingBadge } from "./RecordingBadge";
```

- [ ] **Step 2: Виправити `trackDisplay`**

Знайти блок:
```tsx
const trackDisplay = source?.type === "stream"
  ? (currentTrack ? `${currentTrack.artist} — ${currentTrack.title}` : "—")
  : source?.type === "file"
  ? (source.path.split(/[\\/]/).pop() ?? "—")
  : "—";
```
Замінити на:
```tsx
// For files: empty string — reserved for future ID3 metadata tags
const trackDisplay = source?.type === "stream"
  ? (currentTrack ? `${currentTrack.artist} — ${currentTrack.title}` : "—")
  : "";
```

- [ ] **Step 3: Переписати Panel 1 JSX**

Знайти весь блок Panel 1:
```tsx
      {/* ── Panel 1: Зараз грає ── */}
      <article aria-label={m.player_now_playing()} className="rounded-[20px] bg-white/[0.04] border border-white/[0.06] p-4 flex flex-col gap-2 min-w-0">
        <h3 aria-hidden="true" className="text-base font-bold text-slate-100">
          {m.player_now_playing()}
        </h3>
        <p className="text-base font-bold text-slate-100 truncate">{sourceLabel}</p>
        <p className="text-sm text-slate-400 truncate">{trackDisplay}</p>
        <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
          <span>{m.player_listening()}</span>
          <span>{bitrateDisplay}</span>
          {source?.type === "stream" && <LiveBadge />}
        </div>
      </article>
```

Замінити на:
```tsx
      {/* ── Panel 1: Зараз грає ── */}
      <article aria-label={m.player_now_playing()} className="rounded-[20px] bg-white/[0.04] border border-white/[0.06] p-4 flex flex-col gap-2 min-w-0 min-h-[130px]">
        <h3 aria-hidden="true" className="text-base font-bold text-slate-100">
          {m.player_now_playing()}
        </h3>
        <div aria-live="polite">
          {!source ? (
            <p className="text-sm text-slate-500 italic">{m.player_nothing_playing()}</p>
          ) : (
            <>
              {source.type === "file" ? (
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-base font-bold text-slate-100 truncate flex-1 min-w-0">{sourceLabel}</p>
                  <RecordingBadge />
                </div>
              ) : (
                <p className="text-base font-bold text-slate-100 truncate">{sourceLabel}</p>
              )}
              <p className="text-sm text-slate-400 truncate">{trackDisplay}</p>
              {source.type === "stream" && (
                <div className="flex items-center gap-2 text-sm text-slate-500 flex-wrap">
                  <span>{bitrateDisplay}</span>
                  <LiveBadge />
                </div>
              )}
            </>
          )}
        </div>
      </article>
```

- [ ] **Step 4: Перевірити TypeScript — нуль помилок у змінених файлах**

```powershell
cd C:\dev\Tapir
npx @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/i18n/paraglide
npx tsc --noEmit 2>&1
```

Очікувано: або 0 помилок, або лише **вже існуючі** помилки пов'язані з Paraglide (вони pre-existing, не наші).

- [ ] **Step 5: Запустити `just dev` і перевірити вручну**

```powershell
just dev
```

Перевірити у додатку:
- [ ] Нічого не грає → панель показує «Нічого не грає» (italic, сірий)
- [ ] Грає стрім → назва станції, трек, бітрейт, [LIVE] — без «Прослуховування»
- [ ] Грає стрім без треку → «—» у рядку трека
- [ ] Грає файл → назва файлу + бейдж «Запис», порожній рядок трека, без meta-рядка
- [ ] При зміні треку NVDA оголошує нову назву
- [ ] Розмітка не стрибає при зміні станів

- [ ] **Step 6: Commit**

```powershell
git add src/components/player/PlayerPanel.tsx
git commit -m "feat: refactor now-playing panel — idle state, remove player_listening, file support, aria-live"
```
