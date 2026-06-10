# KB-10: Reset-to-defaults для хоткеїв — дизайн

- **Дата:** 2026-06-10
- **Беклог:** [keyboard-shortcuts-backlog.md → KB-10](../../keyboard-shortcuts-backlog.md)
- **Гілка:** `feature/kb10-hotkeys-reset`

## Мета

У Settings → Hotkeys користувач повертає всі п'ять Tier-1 комбінацій до
стандартних однією дією. Зараз відкату немає: дефолти існують лише в Rust
(`HotkeyMap::default()`, [settings.rs:115-125](../../../src-tauri/src/settings.rs#L115)),
і єдиний спосіб «скинути» — вручну перезаписати кожне комбо рекордером.

## Рішення (узгоджено з користувачем)

1. **Без підтвердження.** Кнопка діє одразу: дія легко відворотна (комбо
   перезаписуються рекордером), беклог вимагає «однією дією».
2. **Джерело дефолтів — Rust.** Нова Tauri-команда `default_hotkeys` повертає
   `HotkeyMap::default()`. Єдине джерело правди, нуль дрейфу між мовами.

## Архітектура

### Backend

Нова команда в [settings_commands.rs](../../../src-tauri/src/commands/settings_commands.rs):

```rust
#[tauri::command]
pub fn default_hotkeys() -> HotkeyMap {
    HotkeyMap::default()
}
```

Чиста довідка: нічого не пише на диск і не чіпає реєстрацію шорткатів.
Реєстрація в `invoke_handler` ([lib.rs](../../../src-tauri/src/lib.rs), поруч із
`register_hotkeys`).

### Frontend

- **`tauri.ts`:** wrapper `defaultHotkeys(): Promise<HotkeyMap>`.
- **[HotkeysTab.tsx](../../../src/components/settings/HotkeysTab.tsx):** кнопка
  «Скинути до стандартних» під списком KeyRecorder-ів. Обробник:
  1. `const defaults = await tauri.defaultHotkeys();`
  2. `$settings.set({ ...current, hotkeys: defaults });`
  3. наявний `save()` (useAutoSave → `saveSettings` + `registerHotkeys`;
     помилки реєстрації потрапляють у вже наявний `role="alert"`);
  4. `announce(m.settings_hotkeys_reset_done(), "polite")` — оголошення для NVDA.

Кнопка завжди активна (без порівняння поточного стану з дефолтом — зайва
логіка). KeyRecorder-и оновлюються самі через `useStore($settings)`.

### i18n

Два нові ключі (uk + en):

| Ключ | uk | en |
| --- | --- | --- |
| `settings_hotkeys_reset` | Скинути до стандартних | Reset to defaults |
| `settings_hotkeys_reset_done` | Гарячі клавіші скинуто до стандартних | Hotkeys reset to defaults |

## Помилки

- `defaultHotkeys` падає лише якщо invoke зламаний (констант-функція) — окремої
  обробки не потрібно понад звичний шлях.
- Помилки `registerHotkeys` після скидання йдуть у наявний блок
  `registrationErrors` (як і при ручній зміні комбо).

## Тестування

[HotkeysTab.test.tsx](../../../src/components/settings/HotkeysTab.test.tsx),
мок `tauri.defaultHotkeys`:

- клік по кнопці → store містить дефолтні комбо;
- `saveSettings` і `registerHotkeys` викликані;
- зроблено polite-оголошення про скидання.

Rust-команда тривіальна (повертає `Default`), окремий тест не потрібен.

## Поза скоупом

- Скидання окремого хоткея (per-row reset).
- Підтвердження / undo.
- Tier-2 хоткеї — вони хардкодні за ADR
  [2026-06-07-shortcut-configurability-asymmetry](../../decisions/2026-06-07-shortcut-configurability-asymmetry.md).

## Готово коли

Кнопка в Settings → Hotkeys одним кліком повертає всі п'ять комбо до
`Ctrl+Shift+R/P/Up/Down/H`, зберігає settings, перереєструє глобальні шорткати
й оголошує результат для NVDA. Тести зелені (`pnpm test`), збірка проходить
(`pnpm vite:build`).
