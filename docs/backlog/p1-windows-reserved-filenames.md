# Баг: sanitize_component не перевіряє Windows-зарезервовані імена файлів

- **Слаг:** `windows-reserved-filenames`
- **Тип:** заплановано
- **Стан:** ready
- **Зусилля:** S
- **Оновлено:** 2026-06-15
- **Залежності:** Phase 1 (sanitize.rs ✅)

## Опис

`sanitize_component()` у `src-tauri/src/sanitize.rs` видаляє заборонені символи Windows (`\ / : * ? " < > |`) і трімає крапки/пробіли в кінці, але **не перевіряє зарезервовані імена Windows**.

Windows не дозволяє файли з іменами: `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9` (регістронезалежно, з розширенням або без: `CON.mp3`, `NUL`, `nul.aac` — всі заблоковані).

**Сценарій:** станція з артистом "COM" або "NUL" → файл `NUL - Something.mp3` → `File::create()` поверне помилку на Windows.

**Місце:** `src-tauri/src/sanitize.rs` рядки 68-79 (`sanitize_component`).

## Виправлення

```rust
const WINDOWS_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

pub fn sanitize_component(name: &str) -> String {
    // ... existing logic ...
    let stem = sanitized.split('.').next().unwrap_or(&sanitized);
    if WINDOWS_RESERVED.iter().any(|r| r.eq_ignore_ascii_case(stem)) {
        format!("_{}", sanitized)
    } else {
        sanitized
    }
}
```

## Критерії готовності

- [ ] `sanitize_component("NUL")` → `"_NUL"`
- [ ] `sanitize_component("CON.mp3")` → `"_CON.mp3"`
- [ ] `sanitize_component("nul")` → `"_nul"` (регістронезалежно)
- [ ] `sanitize_component("Normal Name")` → `"Normal Name"` (без змін)
- [ ] Юніт-тести у `sanitize.rs` покривають всі 22 зарезервовані імена

## Документи

- Код: `src-tauri/src/sanitize.rs` — `sanitize_component()` (рядки 68-79)
- Microsoft docs: [Naming Files, Paths, and Namespaces — Reserved Names](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file#naming-conventions)

## Промпт для агента

```text
Реалізуй цей запис. Рішення вже прийняте — мета довести до робочого, протестованого коду.

Що реалізуємо: Баг: sanitize_component не перевіряє Windows-зарезервовані імена файлів

Почни зі скіла `superpowers:brainstorming` — пройди його, щоб узгодити вимоги й дизайн перед кодом, а далі веди роботу за процесом superpowers: план → реалізація через TDD → перевірка.

Перед стартом звірся з контекстом: цей запис беклогу, його критерії готовності та залежності, пов'язаний код і документи (AGENTS.md, implementation-phases.md та ін.).

Дотримуйся конвенцій проєкту з AGENTS.md. Де доречно — закладай доступність/NVDA від початку, не як доробку.

Питання, якщо виникають, став по одному: контекст, варіанти відповіді, рекомендований. Дочекайся відповіді перед наступним.

Гейти перед завершенням: `pnpm test` і `pnpm vite:build` мають проходити. Онови критерії готовності в записі; коли все зроблено — запис можна видаляти (історія лишається в git).
```
