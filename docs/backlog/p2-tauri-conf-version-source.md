---
slug: tauri-conf-version-source
title: "tauri.conf.json бере версію з package.json: три джерела версії стають двома"
priority: P2
type: planned
status: draft
effort: S
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: []
blocks: []
touches:
  - src-tauri/tauri.conf.json
  - src/lib/versionSync.test.ts
  - docs/tech-stack.md
gates: [pnpm test, pnpm vite:build]
notes:
  - "Аудит 2026-09-04: Tauri v2 приймає у полі version шлях до package.json (підтверджено мейнтейнером у discussion 6347); офіційної команди синхронізації версій немає, issue 15264 відкрито без відповіді."
---

# tauri.conf.json бере версію з package.json: три джерела версії стають двома

> **Контекст:** знахідка аудиту 2026-09-04. Версію написано в трьох файлах, і тест
> `versionSync` стереже лише те, що вони збігаються. Tauri дозволяє прибрати одне
> джерело. Рішення за розробником, тому `draft`.

## Опис

`package.json`, `src-tauri/tauri.conf.json` і `src-tauri/Cargo.toml` несуть по копії
версії. [versionSync.test.ts](../../src/lib/versionSync.test.ts) ловить розбіжність,
але не прибирає причину: підняти версію означає торкнутися трьох файлів.

Схема Tauri v2 дозволяє у `tauri.conf.json` написати
`"version": "../package.json"`: тоді значення читається з поля `version` того файлу
на етапі збірки, і `package_info().version` у діалозі «Про програму» показує саме
його. Джерел лишається два, і обидва потрібні своїм інструментам: `package.json` для
pnpm, `Cargo.toml` для cargo. Тест спрощується до однієї перевірки.

Сторонні інструменти (`tauri-version` для bumpp, `cargo-workspaces`, `release-plz`)
кожен бачить лише свою половину, тож самі по собі проблему не закривають.

## Відкрите питання

- Чи влаштовує розробника, що `tauri.conf.json` перестане бути самодостатнім
  (агент, який читає його без `package.json`, побачить шлях замість числа)? Якщо ні,
  запис закривається як «не робити», а тест лишається єдиним сторожем.

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] `tauri.conf.json` має `"version": "../package.json"`; `just build-fast`
      збирає exe, діалог «Про програму» показує версію з `package.json`,
      `tapir --version` показує ту саму з `Cargo.toml`
- [ ] `versionSync.test.ts` звіряє `package.json` із `Cargo.toml` і перевіряє, що
      `tauri.conf.json` посилається на `package.json`
- [ ] tech-stack.md у секції «Синхронізація версій» описує два джерела замість трьох

## Документи

- https://github.com/tauri-apps/tauri/discussions/6347 — підтвердження, що `version` приймає шлях
- https://github.com/tauri-apps/tauri/issues/15264 — відкрите прохання про команду `tauri version`
