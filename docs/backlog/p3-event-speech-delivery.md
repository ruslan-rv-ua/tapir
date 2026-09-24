---
slug: event-speech-delivery
title: "Один шлях доставки Оголошень і тостів для подій бекенду"
summary: "13 подій бекенду доносять шість хуків і App.tsx, кожен сам обирає пріоритет і тост; ідея — чисті селектори подій і одна доставка у вікні"
priority: P3
type: idea
status: draft
effort: M
kind: chore
target: 0.3.0
updated: 2026-09-24
a11y: true
depends_on: []
blocks: []
touches:
  - src/App.tsx
  - src/hooks/useAutostartFeedback.ts
  - src/hooks/useBrowserProbeFeedback.ts
  - src/hooks/useCliFeedback.ts
  - src/hooks/useCrashResumeFeedback.ts
  - src/hooks/useHotkeyBusyFeedback.ts
  - src/hooks/useScheduleEvents.ts
  - src/lib/recordingAnnounce.ts
  - src/components/common/ToastContainer.tsx
  - docs/accessibility.md
gates: [pnpm test, pnpm typecheck, pnpm vite:build]
---

# Один шлях доставки Оголошень і тостів для подій бекенду

> **Контекст:** побічна знахідка [огляду архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md),
> фронтенд. Режим — **ОБГОВОРЕННЯ** (`idea` + `draft`): інтерфейс не спроєктовано, коду не
> правити. Номери рядків — стан на `f09f36b`.

## Опис

Події бекенду, про які треба сказати людині, вебв'ю обробляє за одним кістяком: підписка
спільним `useTauriEvent` (`src/hooks/useTauriEvent.ts:4-17`) → вибір тексту →
`announce(msg, priority)` і, можливо, `addToast(msg, variant)`. Так зроблено в шести хуках і
чотирьох обробниках `App.tsx` — 13 подій. Змістовне в кожному — вибір тексту; пріоритет і те,
чи потрібен тост, кожен вирішує сам. Правильна форма вже є, з одним користувачем:
`RecordingSpeech { message, priority, toast }` (`src/lib/recordingAnnounce.ts:28-33`, викликач
`src/App.tsx:190`). Оголошення програвача (`player-status`, `player-announce`) — поза записом, їх
бере [player-mirror-module](p2-player-mirror-module.md); оновлення дзеркал —
[backend-mirror-stores](p2-backend-mirror-stores.md).

## Тертя

**Один кістяк — десять копій**: 18 викликів `announce` і 9 `addToast`; пріоритет і вид тоста —
літералами на місці, крім `recording-status`:

- `useAutostartFeedback.ts:16-23`, `useBrowserProbeFeedback.ts:19-36`, `useCrashResumeFeedback.ts:19-43`,
  `useHotkeyBusyFeedback.ts:24-43` — `polite` + тост тим самим текстом;
- `useCliFeedback.ts:18-57` — сім гілок: три з тостом (`:26`, `:32`, `:47`), чотири лише вголос
  (`:35-43`, `:50-51`); `useScheduleEvents.ts:21-47` — чотири події, лише вголос, усі `assertive`,
  і кожна заодно перечитує розклади (`loadSchedules`);
- `App.tsx`: `recording-status` (`:187-192`, опис із `describeRecording`), `stream-unsupported` —
  лише тост (`:208-217`), `recording-completed` — лише вголос (`:305-309`), `wishlist-match` —
  вголос, `assertive` (`:315-324`); назва із запасним `payload.streamId` — тричі (`:190`, `:210`, `:307`).

**Правило пари вирішено двічі, по-різному.** [transport-skip-silent-failure](done/p1-transport-skip-silent-failure.md)
прибрав `announce` поруч із тостом: `ToastContainer` сам є live region (`ToastContainer.tsx:10-11`),
пара дала б дубль. Вісім місць вище тримають саме пару, і [accessibility.md](../accessibility.md)
§11.1 її приписує (рядки 975, 978). Docstring'и хуків наголошують, що `announce` «працює і в
модалці» (`useAutostartFeedback.ts:11`, `useCliFeedback.ts:13`): у `ToastContainer` немає
`data-live-announcer`, тож під модалкою тост німий. Коли давати тост, записано (§11, рядки 968-969:
факт, якого більше ніде немає); чи потрібен поруч `announce` — ніде, і NVDA-прогоном не звірено.

**Правило пріоритету живе лише в прозі.** Критерій «близькість до дії» (`accessibility.md` §1.4,
рядки 95-101; `recordingAnnounce.ts:72-75`) переніс поразку в `polite`
([ADR 2026-09-06](../decisions/2026-09-06-error-is-the-diagnosis-attention-is-the-bucket.md) §4).
Події планувальника настають годинами після дії, а `useScheduleEvents.ts` дає їм `assertive`:
таблиця §1.4 (рядок 93) це дозволяє, критерій під нею — ні.

**Носій стереже лише рев'ю.** Чотири гілки CLI лише вголос — відповідь на дію без видимого
носія ([ADR 2026-08-31](../decisions/2026-08-31-visible-carrier-for-announced-facts.md) §2–§3),
хоча [довідка](../help/uk/background.md) (рядок 59) обіцяє звіт про кожну команду у вікні.
Кандидат у ваду, у застосунку не перевірений. Таблиця §11.1 теж дрейфує: `crash-resume` — лише
«announce» (рядок 1000), а хук дає й тост (`useCrashResumeFeedback.ts:38-39`); у рядку CLI (999)
немає тостів; `autostart-deactivated`, `browser-station-probe-result`, `hotkeys-busy` відсутні.

**Ціна тестів.** П'ять тестів хуків пишуть ту саму мапу слухачів із моком
`@tauri-apps/api/event` (`useAutostartFeedback.test.tsx:6-14`, так само ще три;
`useHotkeyBusyFeedback.test.tsx:9-17`), монтують хост і чекають підписки `vi.waitFor` — щоб
перевірити «дані → текст». `useCliFeedback` без тесту, обробники `App.tsx` — теж (`App.test`
немає). Правок мало (1–4 коміти на хук): тертя в розмазаних правилах, а не в частоті змін.

## Тест видалення

- **`use*Feedback`, `useScheduleEvents`** — мілкі: інтерфейс «виклич раз в `App`». Прибери —
  вибір тексту повернеться в `App.tsx`, кістяк зникне; правила каналу не тримає жоден.
- **`recordingAnnounce.ts`** — проходить: чистий селектор під тестом; `RecordingSpeech` — зразок.
- **`announce`, `addToast`** — примітиви поверхонь, проходять; правила над ними немає.

## Напрям

Два шари. **Селектор на подію** — чиста функція: дані події (і потрібне з дзеркал — назва
Потоку, гарячі клавіші) → опис: текст, пріоритет, тост і його вид або «мовчати»; тестується
без React і `listen`, як `recordingAnnounce`. **Одна доставка у вікні** виконує опис за одним
правилом: пара чи тост сам, одна змінна на обидві поверхні, поведінка під діалогом. Хуки й
`App.tsx` лише підписують подію на селектор; назви й типи подій могла б дати мапа, яку пропонує
[ipc-seam-test-adapter](p2-ipc-seam-test-adapter.md). Сповіщення в треї лишаються в Rust. Форму
інтерфейсу вирішує обговорення.

## Що дає

- **Локальність:** канал, пріоритет і запасна назва — в одному місці; §11.1 звіряють з одним
  переліком селекторів, а не з десятьма файлами.
- **Важіль:** нова подія — селектор і рядок підписки; як із `ToastKind` (ADR 2026-08-17 §4),
  опис не скласти, не назвавши пріоритет і тост.
- **Тести через інтерфейс:** селектор — таблиця «дані → опис», доставка — один тест на правило;
  п'ять мап слухачів зникають, CLI дістає тест дешево.
- **Клас дефектів** «канал вирішено на місці»: дубль пари, текст вголос без носія, дрейф §11.1.
  Вад цієї партії огляду зміна не прибирає.

## Обмеження

- [ADR 2026-08-31 про видимий носій](../decisions/2026-08-31-visible-carrier-for-announced-facts.md)
  §2, §6 — носій обов'язковий, обидва тексти з однієї змінної; для подій, яких людина не
  викликала, — [ADR 2026-08-31 про носії подій станції](../decisions/2026-08-31-carriers-for-station-events.md).
- [ADR 2026-09-01](../decisions/2026-09-01-response-surfaces-ear-window-system.md) §3: поверхню
  обирає модуль дії за фокусом; для дій у Rust (`resume_last`, аргументи CLI) це Rust — доставка
  у вебв'ю тримає лише віконну половину.
- [ADR 2026-08-17](../decisions/2026-08-17-tray-toast-categories.md): категорії Сповіщень у треї
  живуть у Rust, а показ їх із фронтенду — тригер перегляду ADR. Сповіщення цим подіям додають
  [stream-failure-tray-toast](p2-stream-failure-tray-toast.md) і
  [wishlist-match-tray-notification](p2-wishlist-match-tray-notification.md) — у Rust, тим самим
  ключем, що й Оголошення ([локалізація нативного шару](../decisions/2026-08-17-native-layer-localisation.md) §2).
- [ADR 2026-09-15](../decisions/2026-09-15-event-carries-what-the-transition-knows.md) §6: рішення —
  чиста функція в `src/lib/`, в `App.tsx` — проводка; [accessibility.md](../accessibility.md)
  §11.3 (рядок 1053): підписки живуть там, де в події господар, — вони лишаються, виноситься доставка.

## Відкриті питання

- **Пара чи тост сам?** Страховка в діалозі чи дубль поза ним? Або `data-live-announcer` на
  `ToastContainer` і один канал. Відповідь змінює §11.1.
- **Хто обирає пріоритет:** селектор чи доставка за класом події (відповідь на дію / фоновий
  факт)? Від цього залежить `assertive` у подій планувальника.
- **Межа з дзеркалами** (те саме питання в backend-mirror-stores): `recording-status` і
  `useScheduleEvents` і оновлюють дзеркало, і говорять — селектор бере дзеркало параметром чи
  дзеркало кличе доставку?
- **CLI без носія:** окремий bug-запис зараз чи рішення тут?
- **Чи варто:** якщо мапа подій із ipc-seam-test-adapter зніме тестову ціну, решта може не
  окупитись — «ні» теж відповідь.

## Критерії готовності

- [ ] `docs/help/` — обговорення видимої поведінки не змінює; якщо зміниться канал відповіді
      на команди CLI, `planned`-запис оновлює [uk/background.md](../help/uk/background.md) і
      [en/background.md](../help/en/background.md)
- [ ] Обрано форму модуля й місце шва; межі з `player-mirror-module`, `backend-mirror-stores`,
      `ipc-seam-test-adapter` узгоджено
- [ ] Вирішено правило пари «Оголошення + тост» і власника пріоритету; `accessibility.md` §1.4 і
      §11.1 узгоджено з рішенням
- [ ] Для гілок CLI лише вголос заведено bug-запис або вирішено тут
- [ ] Запис переведено в `planned` з критеріями або закрито з причиною

## Документи

- [Огляд архітектури 2026-09-24](../notes/architecture-review-2026-09-24.md) — звідки запис
- [accessibility.md](../accessibility.md) §1.4, §11; ADR — посилання в «Терті» й «Обмеженнях»
- [CONTEXT.md](../../CONTEXT.md) — Оголошення, Сповіщення в треї, видимий носій
- шляхи коду: `src/hooks/use*Feedback.ts`, `src/hooks/useScheduleEvents.ts`,
  `src/hooks/useTauriEvent.ts`, `src/lib/recordingAnnounce.ts`, `src/App.tsx`
