# Volume NaN Validation у set_volume()

- **Слаг:** `p2-volume-nan-validation`
- **Тип:** заплановано
- **Стан:** ready
- **Зусилля:** S
- **Оновлено:** 2026-06-15
- **Залежності:** Phase 2A (PlayerEngine ✅)

## Опис

У `src-tauri/src/player/engine.rs` метод `set_volume()` використовує `clamp()` для обмеження гучності:

```rust
pub async fn set_volume(&self, volume: f32, app: &AppHandle) -> Result<()> {
    let volume = volume.clamp(0.0, 1.0);  // BUG: f32::NaN.clamp() = NaN!
    ...
    s.player.set_volume(volume);  // set_volume(NaN) → undefined behavior
}
```

`f32::NaN.clamp(0.0, 1.0)` у Rust повертає `NaN` — не `0.0` і не `1.0`. Якщо фронтенд надішле `NaN` через IPC-виклик `set_volume`, бекенд не відфільтрує некоректне значення.

**OWASP A03 — Input Validation**: усі числові параметри на системній межі (IPC) мають перевірятись на скінченність перед використанням.

Зараз практично малоймовірно — фронтендовий слайдер обмежує значення діапазоном `0..1`. Але boundary validation є архітектурним правилом проєкту.

**Виправлення:**

```rust
let volume = if volume.is_finite() { volume.clamp(0.0, 1.0) } else { 0.0 };
```

## Критерії готовності

- [ ] `set_volume()` перевіряє `is_finite()` перед `clamp()`
- [ ] NaN та ±Infinity замінюються на `0.0`
- [ ] Додано unit-тест: `set_volume(f32::NAN)` → повертає `Ok(())` без паніки
- [ ] Додано unit-тест: `set_volume(f32::INFINITY)` → гучність = `0.0`

## Документи

- [architecture.md](../architecture.md) — межі системи та IPC
- [OWASP A03: Injection / Input Validation](https://owasp.org/Top10/A03_2021-Injection/)

## Промпт для агента

```text
Реалізуй цей запис. Рішення вже прийняте — мета довести до робочого, протестованого коду.

Що реалізуємо: Volume NaN Validation у set_volume()

Почни зі скіла `superpowers:brainstorming` — пройди його, щоб узгодити вимоги й дизайн перед кодом, а далі веди роботу за процесом superpowers: план → реалізація через TDD → перевірка.

Перед стартом звірся з контекстом: цей запис беклогу, його критерії готовності та залежності, пов'язаний код і документи (AGENTS.md, implementation-phases.md та ін.).

Дотримуйся конвенцій проєкту з AGENTS.md. Де доречно — закладай доступність/NVDA від початку, не як доробку.

Питання, якщо виникають, став по одному: контекст, варіанти відповіді, рекомендований. Дочекайся відповіді перед наступним.

Гейти перед завершенням: `pnpm test` і `pnpm vite:build` мають проходити. Онови критерії готовності в записі; коли все зроблено — запис можна видаляти (історія лишається в git).
```
