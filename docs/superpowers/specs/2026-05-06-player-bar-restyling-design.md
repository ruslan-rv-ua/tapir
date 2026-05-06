# Design Spec: Рестайлінг PlayerPanel

> Status: approved  
> Date: 2026-05-06  
> Branch: feature/player-bar-restyling

---

## Problem

Поточний `PlayerPanel` стилізований мінімалістично: плаский темний фон (`bg-slate-900`), рівні колонки без візуального поділу, дрібні іконки-кнопки (28px). Цільовий вигляд з `docs/ui/01-streams-screen.html` передбачає виразні картки-панелі, більші кнопки транспорту та помітний Live-індикатор.

Зміни суто візуальні — логіка, доступність, aria-атрибути та zone-навігація не змінюються.

---

## Рішення

### Контейнер player-bar

| Поточно | Цільово |
|---|---|
| `bg-slate-900 border-t border-slate-700` | `bg-gradient-to-b from-white/[0.03] to-white/[0.01] border-t border-white/[0.08]` |
| `grid-cols-3 gap-4 px-4 py-2` | `grid-cols-[1.15fr_1.2fr_minmax(200px,0.85fr)] gap-4 px-6 py-4` |

### Картки-панелі

Кожен `<article>` отримує:
```
rounded-[20px] bg-white/[0.04] border border-white/[0.06] p-4 flex flex-col gap-2
```

### Заголовки панелей (H3)

```
text-base font-bold text-slate-100  (було: text-xs font-semibold uppercase tracking-wide text-slate-500)
```
`aria-hidden="true"` залишається.

### Panel 1 — «Зараз грає»

- Назва потоку: `text-base font-bold text-slate-100 truncate`
- Трек: `text-sm text-slate-400 truncate`
- Метарядок (`player-meta`): `flex items-center gap-2 text-sm text-slate-500 flex-wrap`
  - замість поточного `rounded bg-slate-700 px-1 py-0.5 text-xs` — новий **LiveBadge** (окремий компонент)

### LiveBadge

Новий компонент `src/components/player/LiveBadge.tsx`:

```tsx
<span
  aria-label={m.live_stream()}
  className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-0.5
             rounded-full bg-red-500/15 border border-red-500/30
             text-red-300 text-xs font-bold tracking-widest uppercase
             forced-colors:border-[ButtonText] forced-colors:text-[ButtonText]"
>
  <span
    aria-hidden="true"
    className="w-2 h-2 rounded-full bg-red-500 shrink-0
               motion-safe:animate-live-pulse
               forced-colors:bg-[ButtonText]"
  />
  LIVE
</span>
```

Анімація `animate-live-pulse` додається в `src/styles.css`:

```css
@keyframes live-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
  50%       { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0); }
}
@theme {
  --animate-live-pulse: live-pulse 1.4s ease-in-out infinite;
}
```

`motion-safe:` гарантує що анімація вимкнута при `prefers-reduced-motion: reduce`.  
`aria-label` на контейнері, `aria-hidden` на dot — NVDA оголошує "live stream", не бачить dot.

### Panel 2 — «Керування»

**Транспортні кнопки** (toolbar з rovingFocus — без змін у логіці):

| Кнопка | Поточно | Цільово |
|---|---|---|
| Prev, Stop, Next, Mute | `p-1.5 rounded` (≈28px) | `w-11 h-11 rounded-[14px]` (44×44px) |
| Play/Pause | `p-1.5 rounded` | `w-[52px] h-[52px] rounded-2xl bg-blue-700 border-transparent` |

Hover: `hover:bg-white/[0.07] hover:border-white/[0.18]`  
Disabled: `disabled:opacity-35`  
Усі `focus-visible:ring-2 focus-visible:ring-blue-400` залишаються.

**PlaybackPosition** — трек стає 8px (клас `h-2` замість `h-1`):
- File: `SliderTrack` → `h-2`, `SliderThumb` → `w-3 h-3`  
- Live: outer div `h-2`

### Panel 3 — «Вивід»

**Прибрати:**
- рядок «Активний запис»
- рядок «Гучність %»

**Залишити:**
- H3 «Вивід»
- рядок «Пристрій → `settings.outputDevice`»
- `<VolumeSlider />`

**VolumeSlider** — трек стає 8px (`h-2` замість `h-1`), повзунок `w-3.5 h-3.5`.  
Контейнер `volumeWrapperRef` + `onKeyDown` без змін.

---

## Файли, що змінюються

| Файл | Зміни |
|---|---|
| `src/components/player/PlayerPanel.tsx` | Стилі контейнера, панелей, кнопок, Panel 3 |
| `src/components/player/PlaybackPosition.tsx` | `h-1` → `h-2` на треку |
| `src/components/player/VolumeSlider.tsx` | `h-1` → `h-2`, `w-3 h-3` → `w-3.5 h-3.5` |
| `src/components/player/LiveBadge.tsx` | **Новий** компонент |
| `src/styles.css` | `@keyframes live-pulse` + `@theme` |

---

## Поза межами

- Логіка zone-навігації (useRovingFocus, useZoneNavigation) — без змін
- i18n ключі — без змін (Live використовує наявний `m.live_stream()`)
- Rust/Tauri backend — без змін
- Інші компоненти UI — без змін

---

## Доступність

- `LiveBadge`: `aria-label` на контейнері (NVDA читає), `aria-hidden` на dot
- Анімація: `motion-safe:` prefix — вимикається при `prefers-reduced-motion`
- `forced-colors`: кольори замінюються системними (`ButtonText`, `Highlight`)
- Розмір кнопок збільшується з 28px до 44px — покращує моторну доступність
