# Section Navigation Shortcuts

- **Статус:** ПРИЙНЯТО (рішення, реалізація — попереду)
- **Дата:** 2026-06-02
- **Тип:** ADR — архітектурне рішення про шорткати для переключення між екранами

## Проблема

Навігація між секціями (Streams, Browser, Wishlist, Songs, Profiles) вимагає Tab до ActivityBar, роving-focus по кнопках, Enter. Для незрячих користувачів це зайві кроки — особливо якщо потрібно часто перемикатись між записом і браузером.

## Рішення

**`Alt+1` ... `Alt+N`** для секцій за порядком у ActivityBar, **`Alt+0`** для Profiles (позиція окремо від основних секцій).

Поточний порядок у ActivityBar:

| Шорткат | Секція | Стан |
|---------|--------|------|
| `Alt+0` | Profiles | після Phase 3F |
| `Alt+1` | Streams | ✅ |
| `Alt+2` | Browser | ✅ |
| `Alt+3` | Wishlist | ✅ |
| `Alt+4` | Schedule | ⬜ (Phase 3D) |
| `Alt+5` | Songs | ✅ |

`Alt+0` для Profiles відповідає його візуальній позиції: Profiles винесено окремо **вгорі**, до основних секцій (з роздільником). Нумеровані `Alt+1`..`Alt+5` — лінійна послідовність решти секцій зверху вниз.

### Чому `Alt+` а не `Ctrl+`

- `Ctrl+1`..`Ctrl+9` — NVDA у browse mode перехоплює частину Ctrl-комбінацій (наприклад, `Ctrl+Insert` для зупинки озвучення). `Alt+digit` у focus mode (де Tapir завжди працює) значно рідше конфліктує.
- `Alt+F4` зарезервований ОС, `Alt+Tab` теж — але `Alt+1..9` вільні.

### Реалізація

Глобальний обробник в `App.tsx` (той самий `useEffect` де `Ctrl+K` і `Ctrl+,`):

```ts
if (e.altKey && !e.ctrlKey && !e.shiftKey) {
  const sections: (Section | null)[] = [
    "profiles",  // Alt+0
    "streams",   // Alt+1
    "browser",   // Alt+2
    "wishlist",  // Alt+3
    "schedule",  // Alt+4
    "songs",     // Alt+5
  ];
  // e.code, не e.key — фізичний цифровий ряд це "Digit0".."Digit9",
  // незалежно від розкладки (конвенція: accessibility.md §12). Numpad навмисно
  // не матчимо: Alt+Numpad на Windows — це введення alt-кодів символів.
  const digit = /^Digit(\d)$/.exec(e.code);
  if (digit) {
    const section = sections[parseInt(digit[1], 10)];
    if (section) {
      e.preventDefault();
      $activeSection.set(section);
    }
  }
}
```

## Обмеження

- Якщо порядок секцій зміниться, числа зміщуються — потенційно заплутує збережену м'язову пам'ять. Порядок секцій в ActivityBar слід вважати стабільним після Phase 3I.
- `Alt+4` (Schedule) не активний до Phase 3D — натискання ігнорується (disabled-секція).
- `Alt+0` (Profiles) не активний до Phase 3F.
