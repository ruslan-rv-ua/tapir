# SMTC через прямий `windows`-crate

- **Статус:** ПРИЙНЯТО
- **Дата:** 2026-06-11
- **Тип:** ADR — вибір технічного шару для SMTC-інтеграції
- **Контекст:** вимоги — [FRD: SMTC-інтеграція](../frd/2026-06-11-smtc-integration.md);
  дизайн — [спека](../superpowers/specs/2026-06-11-smtc-integration-design.md).

## Проблема

FRD §5 лишає вибір: crate `souvlaki` (готова обгортка SMTC) чи прямий
`windows`-crate (`ISystemMediaTransportControlsInterop::GetForWindow`).
Третій шлях — `navigator.mediaSession` у webview — нежиттєздатний: аудіо
грає rodio в Rust-процесі, а не media-елемент у WebView2, тож Media Session
API без реального відтворення в webview не активується.

## Рішення

**Прямий `windows`-crate.** Додаємо фічі `Media`, `Foundation`,
`Win32_System_WinRT` до наявної залежності `windows` 0.62; весь WinRT/COM
ізольовано в новому модулі `src-tauri/src/smtc.rs`.

Чому не souvlaki:

1. **Нуль нових залежностей.** `windows` уже в Cargo.toml; souvlaki тягне
   *власну* версію `windows`-crate — ймовірне дублювання компіляції та ріст
   бінарника (портативний EXE, `opt-level = "s"`).
2. **Повний контроль над деталями протоколу:** керування окремими кнопками
   (`IsNextEnabled`…), `ClearAll()` для FR-8 («зняти сесію» в souvlaki — лише
   через drop усього об'єкта), майбутня обкладинка через
   `RandomAccessStreamReference` (FR-6).
3. **Кросплатформна абстракція не потрібна:** Tapir — Windows-only; проєкт
   уже має прецедент прямого Win32/WinRT (`tray/notify.rs`,
   `settings_commands.rs`).

Ціна — ~200 рядків власного WinRT-коду (COM-події, маршрутизація потоків).

## Супутні рішення

- **Серіалізація через worker-канал:** усі оновлення SMTC ідуть через один
  `mpsc::unbounded_channel` + worker-таск, а не окремі spawn'и — інакше
  швидкі Pause→Play оновлення можуть перегнати одне одного, і SMTC покаже
  застарілий стан. Невдала ініціалізація (Windows N без Media Feature Pack)
  → порожній `OnceLock`, усі виклики — мовчазний no-op; запис і хоткеї
  не залежать від SMTC.
- **Спільний debounce з хоткеями:** SMTC Play/Pause і хоткей
  `toggle_playback` ділять один cell (`recently_fired`, 500 мс) — хоткей +
  медіа-клавіша одночасно дають одну дію, не подвійний toggle (NFR FRD §4).

## Наслідки

- Компілюється лише на Windows — як і весь проєкт; cfg-розгалуження не
  потрібні.
- Оновлення `windows`-crate можуть зачіпати WinRT-сигнатури — COM-код
  зосереджено в одному модулі, міграція локальна.
- COM-шар юніт-тестами не покривається (свідомо); чисті функції (composition
  метаданих, мапінг станів) — покриваються.
