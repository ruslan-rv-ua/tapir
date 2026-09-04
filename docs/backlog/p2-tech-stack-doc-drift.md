---
slug: tech-stack-doc-drift
title: "Звірити tech-stack.md, architecture.md і AGENTS.md зі станом залежностей"
priority: P2
type: planned
status: ready
effort: M
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: [window-state-outside-data-dir, dead-dependencies]
blocks: []
touches:
  - docs/tech-stack.md
  - docs/architecture.md
  - AGENTS.md
  - DEVELOPERS.md
gates: [pnpm test]
notes:
  - "Аудит 2026-09-04: tech-stack.md перелічує tauri-plugin-cli, fs, http, shell, autostart і tracing, яких у Cargo.toml немає; версії windows і lofty застарілі; ідентифікатор com.tapir.app чужий; секція «Джерела досліджень» посилається на чотири файли, яких у репозиторії немає."
  - "AGENTS.md на п'ятому рядку каже «Active development — Phase 3F», таблиця нижче показує 3K завершеною."
  - "Прецедент і формат: accessibility-doc-audit (2026-09-03)."
---

# Звірити tech-stack.md, architecture.md і AGENTS.md зі станом залежностей

> **Контекст:** знахідка аудиту 2026-09-04. Документ про стек описує проєкт, яким його
> планували, а не яким зібрали. Агент, що вірить йому, шукатиме плагіни, яких немає.
> Робити після [dead-dependencies](done/p2-dead-dependencies.md) і
> [window-state-outside-data-dir](p1-window-state-outside-data-dir.md), щоб не звіряти двічі.

## Опис

[tech-stack.md](../tech-stack.md) розійшовся з кодом у таких місцях:

- **Зведена таблиця**: `windows-rs 0.61` при `0.62` у Cargo.toml, `lofty 0.23` при
  `0.24`; рядок «Win API: Registry, toast, balloon tip», тоді як balloon tip давно
  замінено плагіном нотифікацій із реєстрацією AUMID.
- **Таблиця плагінів** називає `tauri-plugin-cli`, `tauri-plugin-fs`,
  `tauri-plugin-http`, `tauri-plugin-shell` як частину стеку. Жодного з них у
  Cargo.toml немає: CLI розбирає `clap`, HTTP ходить із Rust через `reqwest`, файли й
  shell не потрібні webview. Рядок «Notifications: Tray balloon tip (Win32)» хибний.
- **Секції package.json, Cargo.toml, tauri.conf.json, capabilities** цитують старі
  версії файлів: плагіни autostart, cli, fs, http, shell, notification у JS-залежностях;
  `tracing` і `tracing-log`; `identifier: com.tapir.app` при справжньому
  `ua.ruslanrv.tapir`; дозволи `cli:default`, `fs:default`, `http:default`,
  `shell:default`, `autostart:default`. Цитувати конфіги повністю не варто взагалі:
  вони дрейфують при кожній правці. Замінити посиланнями на файли.
- **Компоненти React Aria**: перелік «TableView, ComboBox, ProgressBar для
  конвертації» описує задум; у коді 31 імпорт з `react-aria-components`, і серед них
  немає ні Table, ні ComboBox. Списки це composite list, як уже виправлено в
  accessibility.md.
- **Джерела досліджень** посилаються на `research-tauri-webview2-accessibility.md`
  та ще три файли, яких у репозиторії немає. Або повернути їх у `docs/research/`,
  або прибрати секцію.

[architecture.md](../architecture.md): дерево компонентів на рядку 137 містить
`StreamTable.tsx` з поясненням «React Aria TableView»; секція безпеки на рядках
1024–1026 описує scope плагінів shell, http і fs, яких немає.

[AGENTS.md](../../AGENTS.md): «Active development — Phase 3F (Profile Manager)» у
п'ятому рядку, при тому що таблиця під ним показує 3F, 3G, 3J і 3K завершеними, а
беклог ділить роботу за версіями, не за фазами.

[DEVELOPERS.md](../../DEVELOPERS.md): «doesn't touch the system registry or AppData»
виправляє запис про window-state; тут лише переконатися, що ці правки узгоджені.

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] Кожен рядок зведеної таблиці tech-stack.md збігається з `Cargo.toml` і
      `package.json` за назвою і мажорною версією
- [ ] Кожен плагін у таблиці плагінів існує в `Cargo.toml`; ті, що відхилені, стоять
      у окремому списку «розглянуто й відхилено» з причиною в одному рядку
- [ ] Повні цитати конфігів прибрано; замість них посилання на файли
- [ ] Перелік компонентів React Aria відповідає імпортам у `src/`
- [ ] Секція «Джерела досліджень» або посилається на файли, що існують, або прибрана
- [ ] architecture.md не згадує `StreamTable`, TableView і плагіни shell, http, fs
- [ ] AGENTS.md описує поточний стан проєкту одним правдивим рядком
- [ ] `pnpm test` зелений: `docsLinks.test.ts` не бачить битих посилань

## Документи

- [tech-stack.md](../tech-stack.md), [architecture.md](../architecture.md), [AGENTS.md](../../AGENTS.md)
- [accessibility-doc-audit](done/p2-accessibility-doc-audit.md) — прецедент звірки документа з кодом і формат звіту
