# CLI Arguments (Фаза 3G)

- **Слаг:** `cli-arguments`
- **Тип:** ідея
- **Стан:** draft
- **Зусилля:** M
- **Оновлено:** 2026-06-15
- **Залежності:** Phase 1, Phase 2 (stream::manager + player), Фаза 3E ✅ (single instance + argv-проксі)

## Опис

Tapir має підтримувати аргументи командного рядка для автоматизації, інтеграції зі скриптами та планувальниками завдань (Windows Task Scheduler, сторонні автоматизатори).

Для незрячого розробника, який керує усім з клавіатури та NVDA, CLI-аргументи — це природний спосіб запускати дії без взаємодії з вікном: розпочати запис по розкладу, зупинити відтворення з гарячої клавіші системи тощо.

### Що дає користувачу

| Аргумент | Що робить |
|----------|-----------|
| `--record NAME\|URL` | Запустити запис потоку (за назвою або URL) |
| `--play NAME\|URL` | Запустити відтворення потоку |
| `--stop-recording` | Зупинити всі активні записи |
| `--stop-playback` | Зупинити відтворення |
| `--wish-add PATTERN` | Додати паттерн до wishlist |
| `--wish-remove PATTERN` | Видалити паттерн з wishlist |
| `--profile NAME` | Завантажити вказаний профіль при запуску |
| `--minimize` | Запустити згорнутим у system tray (без вікна) |
| `--datadir PATH` | Перевизначити директорію даних (тільки перша інстанція) |

### Поведінка при повторному запуску

Завдяки Phase 3E, друга інстанція не запускається повноцінно — вона форвардить свої argv до першої інстанції через IPC і завершується. Перша інстанція обробляє їх так само, як і власні аргументи при запуску. Це дозволяє `tapir.exe --stop-recording` спрацювати, навіть якщо застосунок вже запущений.

**Обмеження:** `--datadir` і `--profile` мають сенс лише при старті першої інстанції. При форвардингу (друга інстанція → перша) вониігноруються з попередженням і NVDA-оголошенням.

### Архітектурна деталь: три шари

Реалізація розбита на чисті шари (вже закладені в `cli.rs`):

```
parse(argv) → Cli        — clap, pure, без side-effects
plan(Cli, ctx) → Plan   — чиста трансформація + контекст (Startup / Forwarded)
execute(app, Plan)       — async dispatch через IPC-команди (recording, player, wishlist)
```

`parse` → `plan` → `execute` викликується з двох місць:
- **Старт першої інстанції:** `lib.rs` парсить argv ранньо (до `.setup()`), виконання відкладається до `frontend_ready` через `StartupPlan` (щоб фронт встиг підписатися на події).
- **Форвард другої інстанції:** `single_instance.rs` викликає `parse` → `plan(_, Forwarded)` → `execute` в tokio runtime.

### Зворотний зв'язок для NVDA

Feedback-модель: backend надсилає структурний тег (`CliFeedback` enum → kebab-case), фронт локалізує через Paraglide і оголошує через `LiveAnnouncer`. Помилки (stream-not-found, invalid-url, action-failed) — assertive (перебивають); підтвердження (wishlist-added/removed, flag-ignored) — polite.

### Стан реалізації

**Вже є (скаффолдинг у поточній гілці):**
- `src-tauri/src/cli.rs` — повна реалізація `parse`, `plan`, `execute`, `CliFeedback`, `find_stream`, `validate_needle`, unit-тести
- `src-tauri/src/lib.rs` — ранній парсинг argv, exit codes (0/2), `--minimize`, `StartupPlan`
- `src-tauri/src/single_instance.rs` — argv-проксі готовий до Phase 3G
- `src/hooks/useCliFeedback.ts` — фронтенд-хук для всіх варіантів CliFeedback
- i18n-ключі для CLI-фідбеку (uk/en)

**Не реалізовано:**
- `--datadir` — відсутній у `Cli` struct і в `portable.rs`
- Ручне end-to-end тестування всього ланцюга

## Критерії готовності

- [ ] `--record NAME|URL` запускає запис (за назвою профілю або URL)
- [ ] `--play NAME|URL` запускає відтворення
- [ ] `--stop-recording` зупиняє всі активні записи
- [ ] `--stop-playback` зупиняє відтворення
- [ ] `--wish-add PATTERN` / `--wish-remove PATTERN` керують wishlist і оголошуються через NVDA
- [ ] `--profile NAME` вибирає профіль при запуску (session-only, не зберігається в settings.json)
- [ ] `--minimize` запускає застосунок у tray (без видимого вікна)
- [ ] `--datadir PATH` перевизначає директорію даних на першій інстанції
- [ ] При повторному запуску argv форвардиться першій інстанції і виконується
- [ ] `--profile` / `--minimize` при форвардингу → polite NVDA-оголошення про ігнорування
- [ ] Exit codes: 0 (success / --help / --version), 1 (runtime error), 2 (invalid args)
- [ ] Помилки (stream not found, invalid URL, action failed) → assertive NVDA + error-toast
- [ ] `--help` і `--version` → exit 0, без відкриття вікна
- [ ] Документація `--datadir` обмеження (global mutex — тільки перша інстанція)
- [ ] `pnpm test` і `cargo test` проходять

## Відкриті питання

- **`--datadir` і `portable.rs`:** `data_dir()` зараз захардкоджено як `base_dir()/data/`. Як саме `--datadir` має його перевизначати? Через глобальну `OnceLock`? Через змінну середовища? Рішення треба прийняти до реалізації.
- **`--datadir` при форвардингу:** якщо перша інстанція вже запущена з іншим data dir, друга форвардить argv — перша ігнорує `--datadir` (глобальний mutex). Чи треба окреме NVDA-оголошення саме для цього кейсу, а не загального "flag-ignored-forwarded"?
- **Скоупінг `--record`/`--play`:** чи шукаємо потік лише в активному профілі, чи у всіх профілях? Поточна реалізація — лише активний.
- **Exit code 1 (runtime error):** коли саме? Якщо `--stop-recording` викликав помилку, застосунок вже відкрився. Чи exit(1) має сенс лише для помилок до `.setup()`?
- **`--record URL` (URL без профілю):** якщо URL не знайдено в жодному потоці профілю, що робити — відмова з `stream-not-found` чи тимчасовий безіменний запис? Поточна реалізація — відмова.
- **Тестування скаффолдингу:** unit-тести в `cli.rs` є, але інтеграційного тесту (реальний запуск → перевірка дії) немає. Чи достатньо ручного тестування?

## Документи

- [implementation-phases.md §3G](../implementation-phases.md)
- [implementation-phases.md §3E](../implementation-phases.md) — argv-проксі контракт
- Код: `src-tauri/src/cli.rs`
- Код: `src-tauri/src/lib.rs` — ранній парсинг, `StartupPlan`, exit codes, `--minimize`
- Код: `src-tauri/src/single_instance.rs` — `on_second_instance`, argv-форвард
- Код: `src-tauri/src/portable.rs` — `data_dir()` (потребує розширення для `--datadir`)
- Код: `src/hooks/useCliFeedback.ts` — фронтенд-хук

## Промпт для агента

Каталог промптів за типом: [README — Каталог промптів](README.md#каталог-промптів-за-типом).
Тип `ідея`.
