---
slug: architecture-doc-drift
title: "Звірити решту architecture.md зі станом коду"
priority: P2
type: planned
status: draft
effort: L
kind: chore
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: [tech-stack-doc-drift]
blocks: []
touches:
  - docs/architecture.md
gates: [pnpm test]
notes:
  - "Знайдено 2026-09-04 під час tech-stack-doc-drift: той запис виправив у architecture.md лише те, що назвав (дерево фронтенду, тости трею, CSP, scope плагінів). Решта документа не звірялась."
  - "Дерево Rust §2 — найгустіша знахідка: немає cli.rs, smtc.rs, autostart.rs, crash_recovery.rs, i18n.rs, naming.rs, tray/, songs/, window_state.rs, store.rs і ще з десяток модулів, зате є неіснуючий postprocess/."
---

# Звірити решту architecture.md зі станом коду

> **Контекст:** знахідка 2026-09-04, зроблена «в проході» під час
> [tech-stack-doc-drift](done/p2-tech-stack-doc-drift.md). Той запис свідомо взяв у
> `architecture.md` тільки названі ним місця; решта 1000+ рядків — досі опис проєкту,
> яким його планували. Прецедент і формат звірки —
> [accessibility-doc-audit](done/p2-accessibility-doc-audit.md).

## Опис

Що вже виправлено записом [tech-stack-doc-drift](done/p2-tech-stack-doc-drift.md)
(звіряти вдруге не треба):

- §3 «Модульна структура (Frontend)» — дерево переписано за `src/`;
- §11 «Тости трею» — balloon tip замінено на `tauri-plugin-notification` + AUMID;
- §12 «Security» — CSP без `radio-browser.info`, scope плагінів `shell`/`http`/`fs` знято.

Що лишилось звірити:

- **§2 «Модульна структура (Rust Backend)».** Дерево не має `cli.rs`, `smtc.rs`,
  `autostart.rs`, `crash_recovery.rs`, `hotkey_busy.rs`, `i18n.rs`, `naming.rs`,
  `playback_control.rs`, `profile_store.rs`, `recording_control.rs`, `settings_store.rs`,
  `shortcuts.rs`, `single_instance.rs`, `store.rs`, `wake_lock.rs`, `window_state.rs`,
  каталогів `tray/` і `songs/`, а також половини `scheduler/` (`core.rs`, `validation.rs`,
  `windows.rs`). Натомість містить `postprocess/`, якого в коді немає (фаза 3H не
  починалась). Таблиця «Відповідальність модулів» під деревом успадковує ті самі дірки.
- **§4 AppState, §6 IPC Contract, §7 Модель конкурентності** — цитують сигнатури й
  структури; кожна цитата дрейфує окремо. Ті самі граблі, що з цитатами конфігів:
  або звіряти поіменно, або замінити посиланням на код.
- **§5 «Потоки даних»** — вісім діаграм; чи описують вони поточні шляхи, ніхто не
  перевіряв від Фази 1.

Зміна поведінки не входить — тільки приведення опису до коду або явна позначка
«заплановано, не реалізовано» (конвенція з `accessibility.md`).

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки не змінює
- [ ] Дерево §2 збігається з `src-tauri/src/` за іменами файлів і каталогів
- [ ] Таблиця «Відповідальність модулів» покриває те саме дерево, без зайвих рядків
- [ ] Кожна цитата коду в §4, §6, §7 або звірена з файлом, або замінена посиланням
- [ ] Діаграми §5 описують поточні шляхи даних
- [ ] `pnpm test` зелений: `docsLinks.test.ts` не бачить битих посилань

## Документи

- [architecture.md](../architecture.md) — документ, що звіряється
- [tech-stack-doc-drift](done/p2-tech-stack-doc-drift.md) — запис, під час якого знайдено
- [accessibility-doc-audit](done/p2-accessibility-doc-audit.md) — формат звірки й звіту
