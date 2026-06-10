# KB-10 Hotkeys Reset-to-Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Кнопка в Settings → Hotkeys, що одним кліком повертає всі п'ять Tier-1 хоткеїв до дефолтів (`Ctrl+Shift+R/P/Up/Down/H`), зберігає settings, перереєструє глобальні шорткати й оголошує результат для NVDA.

**Architecture:** Дефолти лишаються в одному місці — Rust `HotkeyMap::default()`. Нова Tauri-команда `default_hotkeys` віддає їх фронтенду; кнопка в `HotkeysTab` підставляє їх у `$settings` і йде наявним шляхом `useAutoSave` → `saveSettings` + `registerHotkeys`. Спека: [2026-06-10-kb10-hotkeys-reset-design.md](../specs/2026-06-10-kb10-hotkeys-reset-design.md).

**Tech Stack:** Tauri 2 (Rust), React 19 + nanostores, paraglide i18n (генерується vite-плагіном), vitest + testing-library.

**Гілка:** `feature/kb10-hotkeys-reset` (вже створена).

**Важливо про i18n:** файли `src/i18n/paraglide/*` — згенеровані. Після зміни `src/i18n/messages/{en,uk}.json` треба запустити `pnpm vite:build`, інакше нових `m.*` функцій не існуватиме і тести впадуть на імпорті. Згенеровані файли комітяться разом із JSON.

**Важливо про verification:** `tsc` має ~51 наперед існуючу помилку (нетипізований paraglide) — НЕ ганяти `tsc` як gate. Реальні гейти: `pnpm test` і `pnpm vite:build` (+ `cargo check` для Rust).

---

### Task 1: i18n-ключі для кнопки та оголошення

**Files:**
- Modify: `src/i18n/messages/en.json` (після `settings_hotkey_registration_failed`, ~рядок 253)
- Modify: `src/i18n/messages/uk.json` (після `settings_hotkey_registration_failed`, ~рядок 253)

- [ ] **Step 1: Додати ключі в en.json**

Після рядка `"settings_hotkey_registration_failed": "Failed to register hotkey {combo}",` додати:

```json
  "settings_hotkeys_reset": "Reset to defaults",
  "settings_hotkeys_reset_done": "Hotkeys reset to defaults",
```

- [ ] **Step 2: Додати ключі в uk.json**

Після рядка `"settings_hotkey_registration_failed": "Не вдалося зареєструвати хоткей {combo}",` додати:

```json
  "settings_hotkeys_reset": "Скинути до стандартних",
  "settings_hotkeys_reset_done": "Гарячі клавіші скинуто до стандартних",
```

- [ ] **Step 3: Перегенерувати paraglide**

Run: `pnpm vite:build`
Expected: збірка проходить; у `src/i18n/paraglide/messages` з'явилися `settings_hotkeys_reset` / `settings_hotkeys_reset_done` (перевірити: `git status` показує зміни в `src/i18n/paraglide/`).

- [ ] **Step 4: Commit**

```pwsh
git add src/i18n/messages/en.json src/i18n/messages/uk.json src/i18n/paraglide
git commit -m "i18n(settings): keys for hotkeys reset-to-defaults (KB-10)"
```

---

### Task 2: Rust-команда `default_hotkeys`

**Files:**
- Modify: `src-tauri/src/commands/settings_commands.rs` (після `register_hotkeys`, ~рядок 61)
- Modify: `src-tauri/src/lib.rs` (invoke_handler, після `commands::settings_commands::register_hotkeys,` — рядок 161)

- [ ] **Step 1: Додати команду**

У `settings_commands.rs` змінити імпорт на початку файлу:

```rust
use crate::settings::{GlobalSettings, HotkeyMap};
```

(зараз там `use crate::settings::GlobalSettings;`)

Після функції `register_hotkeys` додати:

```rust
/// Default Tier-1 hotkey combos. Pure lookup for the Settings → Hotkeys
/// reset button (KB-10): writes nothing, registers nothing.
#[tauri::command]
pub fn default_hotkeys() -> HotkeyMap {
    HotkeyMap::default()
}
```

- [ ] **Step 2: Зареєструвати в invoke_handler**

У `lib.rs` після рядка `commands::settings_commands::register_hotkeys,` додати:

```rust
            commands::settings_commands::default_hotkeys,
```

- [ ] **Step 3: Перевірити компіляцію**

Run: `cargo check` (з робочої директорії `src-tauri`)
Expected: `Finished` без помилок.

- [ ] **Step 4: Commit**

```pwsh
git add src-tauri/src/commands/settings_commands.rs src-tauri/src/lib.rs
git commit -m "feat(settings): default_hotkeys command (KB-10)"
```

---

### Task 3: Wrapper у tauri.ts

**Files:**
- Modify: `src/lib/tauri.ts` (після `registerHotkeys`, ~рядок 295)

- [ ] **Step 1: Додати wrapper**

Після функції `registerHotkeys` додати:

```ts
export async function defaultHotkeys(): Promise<HotkeyMap> {
  return invoke("default_hotkeys");
}
```

(`HotkeyMap` уже визначений у цьому файлі, рядок 62.)

- [ ] **Step 2: Перевірити збірку**

Run: `pnpm vite:build`
Expected: збірка проходить.

- [ ] **Step 3: Commit**

```pwsh
git add src/lib/tauri.ts
git commit -m "feat(settings): defaultHotkeys tauri wrapper (KB-10)"
```

---

### Task 4: Кнопка скидання в HotkeysTab (TDD)

**Files:**
- Test: `src/components/settings/HotkeysTab.test.tsx`
- Modify: `src/components/settings/HotkeysTab.tsx`

- [ ] **Step 1: Написати failing-тест**

У `HotkeysTab.test.tsx`:

1. Розширити мок tauri (фабрика `vi.mock` на початку файлу) полем `defaultHotkeys`:

```tsx
vi.mock("../../lib/tauri", () => ({
  saveSettings: vi.fn().mockResolvedValue(undefined),
  registerHotkeys: vi.fn().mockResolvedValue([]),
  defaultHotkeys: vi.fn().mockResolvedValue({
    toggleRecording: "Ctrl+Shift+R",
    togglePlayback: "Ctrl+Shift+P",
    volumeUp: "Ctrl+Shift+Up",
    volumeDown: "Ctrl+Shift+Down",
    toggleWindow: "Ctrl+Shift+H",
  }),
}));
```

2. Додати імпорти:

```tsx
import { waitFor } from "@testing-library/react";
import * as tauri from "../../lib/tauri";
import { $announcer } from "../../stores/announcer";
```

(`waitFor` додати до наявного імпорту з `@testing-library/react`.)

3. У `beforeEach` додати рядок `$announcer.set(null);`.

4. Додати describe-блок:

```tsx
describe("HotkeysTab — reset to defaults (KB-10)", () => {
  it("resets all combos, saves, re-registers and announces", async () => {
    const { getByRole } = render(<HotkeysTab />);
    fireEvent.click(getByRole("button", { name: m.settings_hotkeys_reset() }));

    // Store gets the defaults from the backend command.
    await waitFor(() => {
      expect($settings.get()?.hotkeys.toggleRecording).toBe("Ctrl+Shift+R");
    });
    expect($settings.get()?.hotkeys.toggleWindow).toBe("Ctrl+Shift+H");
    expect($announcer.get()?.message).toBe(m.settings_hotkeys_reset_done());

    // Debounced auto-save (300ms) persists and re-registers.
    await waitFor(() => {
      expect(tauri.saveSettings).toHaveBeenCalled();
      expect(tauri.registerHotkeys).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Переконатися, що тест падає**

Run: `pnpm test -- HotkeysTab`
Expected: новий тест FAIL — кнопки з ім'ям `settings_hotkeys_reset` немає (`Unable to find an accessible element with the role "button"`); два старі тести (KB-09) PASS.

- [ ] **Step 3: Реалізувати кнопку**

У `HotkeysTab.tsx` всередині функції `HotkeysTab` (після `validateHotkey`) додати обробник:

```tsx
  async function resetToDefaults() {
    const defaults = await tauri.defaultHotkeys();
    const current = $settings.get();
    if (!current) return;
    $settings.set({ ...current, hotkeys: defaults });
    save();
    announce(m.settings_hotkeys_reset_done(), "polite");
  }
```

(`current` читаємо ПІСЛЯ `await`, щоб не накласти застарілий знімок поверх свіжих змін.)

У JSX між списком KeyRecorder-ів і блоком `registrationErrors` додати кнопку (стиль — як «Browse» у [RecordingTab.tsx:57-62](../../../src/components/settings/RecordingTab.tsx#L57)):

```tsx
      <button
        onClick={resetToDefaults}
        className="rounded border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600 outline-none focus:ring-2 focus:ring-blue-400 forced-colors:bg-[ButtonFace] forced-colors:border forced-colors:border-[ButtonText]"
      >
        {m.settings_hotkeys_reset()}
      </button>
```

- [ ] **Step 4: Переконатися, що тести проходять**

Run: `pnpm test -- HotkeysTab`
Expected: усі тести PASS (2 старі KB-09 + 1 новий KB-10).

- [ ] **Step 5: Commit**

```pwsh
git add src/components/settings/HotkeysTab.tsx src/components/settings/HotkeysTab.test.tsx
git commit -m "feat(settings): reset-to-defaults button in Hotkeys tab (KB-10)"
```

---

### Task 5: Закрити KB-10 у беклозі + фінальна верифікація

**Files:**
- Modify: `docs/keyboard-shortcuts-backlog.md` (секція KB-10, рядки 166-168)

- [ ] **Step 1: Повна верифікація**

Run: `pnpm test`
Expected: усі тести PASS.

Run: `pnpm vite:build`
Expected: збірка проходить.

Run: `cargo check` (з `src-tauri`)
Expected: без помилок.

- [ ] **Step 2: Відмітити KB-10 зробленим**

У `docs/keyboard-shortcuts-backlog.md` замінити:

```markdown
### ☐ KB-10 · 🔍 Reset-to-defaults для хоткеїв
Перевірити наявність відкату до дефолтів у Settings → Hotkeys.
- **Готово коли:** користувач може повернути дефолтні комбінації однією дією.
```

на:

```markdown
### [x] KB-10 · 🔍 Reset-to-defaults для хоткеїв
Перевірити наявність відкату до дефолтів у Settings → Hotkeys.
- **Готово коли:** користувач може повернути дефолтні комбінації однією дією.
- **Зроблено (2026-06-10):** відкату не було — додано кнопку «Скинути до
  стандартних» у Settings → Hotkeys
  ([HotkeysTab.tsx](../src/components/settings/HotkeysTab.tsx)). Дефолти віддає
  нова Tauri-команда `default_hotkeys`
  ([settings_commands.rs](../src-tauri/src/commands/settings_commands.rs)) —
  єдине джерело правди `HotkeyMap::default()`. Далі звичний шлях: store →
  auto-save → `registerHotkeys`; помилки реєстрації — у наявний `role="alert"`;
  polite-оголошення для NVDA. Без підтвердження (дія відворотна). Спека/план:
  `docs/superpowers/{specs,plans}/2026-06-10-kb10-hotkeys-reset*`. Тест:
  [HotkeysTab.test.tsx](../src/components/settings/HotkeysTab.test.tsx).
```

- [ ] **Step 3: Commit**

```pwsh
git add docs/keyboard-shortcuts-backlog.md
git commit -m "docs(shortcuts): mark KB-10 done in backlog"
```
