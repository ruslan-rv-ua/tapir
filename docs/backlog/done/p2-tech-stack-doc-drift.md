---
slug: tech-stack-doc-drift
title: "Звірити tech-stack.md, architecture.md і AGENTS.md зі станом залежностей"
priority: P2
type: planned
status: done
effort: M
kind: chore
target: 0.1.0
updated: 2026-09-04
completed: 2026-09-04
a11y: false
depends_on: [window-state-outside-data-dir, dead-dependencies]
blocks: [architecture-doc-drift]
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
  - "2026-09-04: реалізовано. tech-stack.md переписано цілком; architecture.md правлено лише в названих місцях, решта пішла окремим записом architecture-doc-drift. Другий хвіст — dead-js-tauri-plugins."
---

# Звірити tech-stack.md, architecture.md і AGENTS.md зі станом залежностей

> **Контекст:** знахідка аудиту 2026-09-04. Документ про стек описує проєкт, яким його
> планували, а не яким зібрали. Агент, що вірить йому, шукатиме плагіни, яких немає.
> Робити після [dead-dependencies](p2-dead-dependencies.md) і
> [window-state-outside-data-dir](p1-window-state-outside-data-dir.md), щоб не звіряти двічі.

## Опис

[tech-stack.md](../../tech-stack.md) розійшовся з кодом у таких місцях:

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

[architecture.md](../../architecture.md): дерево компонентів на рядку 137 містить
`StreamTable.tsx` з поясненням «React Aria TableView»; секція безпеки на рядках
1024–1026 описує scope плагінів shell, http і fs, яких немає.

[AGENTS.md](../../../AGENTS.md): «Active development — Phase 3F (Profile Manager)» у
п'ятому рядку, при тому що таблиця під ним показує 3F, 3G, 3J і 3K завершеними, а
беклог ділить роботу за версіями, не за фазами.

[DEVELOPERS.md](../../../DEVELOPERS.md): «doesn't touch the system registry or AppData»
виправляє запис про window-state; тут лише переконатися, що ці правки узгоджені.

## Результат аудиту (2026-09-04)

**tech-stack.md переписано, а не поправлено.** Зведена таблиця розділилась на дві —
frontend за `package.json`, backend за `Cargo.toml` — бо однією колонкою «версія»
неможливо тримати два маніфести. У backend-таблиці з'явилось те, чого документ не
називав узагалі: `rtrb` (кільцевий буфер, що став на місце знятого `stream-download`),
`clap`, `tokio-util`, `encoding_rs`, `nanoid`, `walkdir`, а `winreg` виїхав окремим
рядком з-під `windows`. У frontend-таблиці — Vitest із Testing Library і `unified`
(довідка `F1` компілюється з `docs/help/` на збірці; жодного сліду про це в стеку не
було). Виправлені версії: `windows` 0.61 → **0.62**, `lofty` 0.23 → **0.24**,
`symphonia` 0.5.5 → **0.5**. Рядок «Win API: Registry, toast, balloon tip» замінено на
справжні три поверхні: MessageBox підтвердження виходу, Shell (кошик через
`SHFileOperationW`, «відкрити у програмі» через `ShellExecuteW`) і **WinRT Media для
SMTC** — цілої підсистеми (`smtc.rs`) документ не згадував.

**Плагінів п'ять, а не дванадцять.** У таблиці лишились `global-shortcut`,
`single-instance`, `dialog`, `log`, `notification` плюс трей із core-фічі `tray-icon`.
Шість відхилених пішли **окремою таблицею з причиною в один рядок** — щоб наступного
разу питання «а чому в нас немає `tauri-plugin-fs`?» мало письмову відповідь, а не
з'ясовувалось наново: `cli` (argv розбирає `clap` — один парсер і для свого argv, і для
argv другого екземпляра), `http` і `fs` (мережа й файли живуть у Rust; у CSP немає
жодного зовнішнього `connect-src`), `shell` (`ShellExecuteW`/`SHFileOperationW`),
`window-state` (писав у `%APPDATA%`) і `autostart` (команда залежить від
`autostart_minimized`, а переїзд EXE треба звіряти).

Пастка, яку тут легко відтворити (обидва рев'ю зловили її одночасно): **плагінів п'ять,
а дозволів у `capabilities/default.json` — на чотири**. `single-instance` працює цілком
у Rust, webview його не кличе, тож рядка в дозволах він не має і не потребує. Число «п'ять»
у сусідньому реченні про capabilities було просто скопійоване з таблиці плагінів.

**П'ять повних цитат конфігів прибрано, і всі п'ять брехали.** `package.json`,
`Cargo.toml`, `tauri.conf.json`, `capabilities/default.json` і `justfile` лежали в
документі дослівно — станом на невідомо коли. Найгірші місця: `identifier:
com.tapir.app` (справжній `ua.ruslanrv.tapir`), секція `plugins.cli` з прапорцями
`--datadir`/`--tempdir`/`--stop-playing`, яких `clap` не знає, і `justfile` без
`check` — тих самих воріт, які агент має ганяти. Замість цитат — таблиця з посиланнями
на файли й два речення про єдине, що справді варто знати наперед: capabilities мовчки
вимикають команду плагіна, а `--no-bundle` дає той самий `.exe`, що роздається людям.

**React Aria: 31 імпорт, звірено поіменно.** Ні `TableView`, ні `GridList`, ні
`ComboBox`, ні навіть `DialogTrigger` (діалоги відкриваються зі стану, не з тригера).
Натомість у коді є `SearchField`, `TextField`, `NumberField`, `Checkbox`, `RadioGroup`,
`Select` — жодного з них документ не називав. Дописано рядок, якого бракувало найбільше:
головна навігація — **не** `Tabs`, а кнопки Activity Bar з `aria-pressed` і
`Alt+0`…`Alt+5`; `Tabs` живуть лише **всередині** екранів і діалогів.

**Таблицю «Маппінг іконок» знято цілком.** 26 рядків, з яких десять іконок у коді не
використовуються (`Search`, `MoreVertical`, `ChevronUp`/`ChevronDown`, `Download`,
`FolderOpen`, `List`, `X`, `Star`, `Ban`), а більшої частини вживаних там немає
(`SkipBack`, `SkipForward`, `Headphones`, `Layers`, `Loader2`, `RefreshCw`, `Signal`,
`Tag`, `Upload`…). Це не рішення про технологію, а копія коду, що дрейфує з кожним
екраном, — тому вона й пішла тим самим правилом, що цитати конфігів.

**«Джерела досліджень» — секція про файли, яких ніколи не було.** Усі чотири
(`research-tauri-webview2-accessibility.md` і решта) відсутні не лише в робочому дереві,
а й у **всій git-історії**: `docs/research/` існував, але з трьома іншими файлами, які
видалив ще коміт Фази 3B. Повертати нічого — секцію знято.

**architecture.md — лише названі місця, і це свідомо.** Дерево фронтенду (§3)
переписано за `src/` цілком: `StreamTable.tsx` з «React Aria TableView» не існує, як не
існують `ResultsTable`, `SongsTable`, `WishlistTable`, `GeneralSettings`,
`ProfileSwitcher`, `UndoToast`, `KeyboardShortcutsModal` і ще з десяток імен; правити
там один рядок означало б лишити навколо нього такий самий вигаданий каталог. `§11`
(тости трею) і `§12` (CSP і scope плагінів) поправлені за критеріями. **Решта документа
не звірялась** — і дерево Rust у §2 з тієї ж хвороби: немає `cli.rs`, `smtc.rs`,
`tray/`, `songs/`, `window_state.rs` і ще півтора десятка модулів, зате є неіснуючий
`postprocess/`. Це окремий запис — [architecture-doc-drift](p2-architecture-doc-drift.md),
effort L.

**Одна поправка до попереднього аудиту.** [accessibility-doc-audit](p2-accessibility-doc-audit.md)
записав, що throttle тостів «3 с не існує ні там, ні у фронтенді». У `tray/notify.rs`
він **є** — `THROTTLE_MS = 3000` на `notify_track_change`; неправдою було місце, а не
число (гасив мерехтіння не сплітер, а сам відправник тосту). Рядок у `architecture.md`
§11 лишився, виправлено навколо нього механізм і назву гейта
(`ui.trayNotificationsTrackChange`, не `showTrayNotifications`).

**AGENTS.md, і фаза 3I заразом.** «Active development — Phase 3F» замінено на одну
правдиву фразу: передреліз 0.1.0, **3H — остання незакрита фаза**, черга ведеться за
цільовою версією в беклозі, не за фазами. Таблиця фаз лишилась, але підписана як
історія. Перше формулювання казало «крім 3H і 3I» — і його зловило рев'ю: 3I стояла
`⬜ Not started` у двох документах, тоді як **усі її підфази закриті** — 3I-1 High
Contrast має відмічений чекбокс і 210 вживань `forced-colors:` у `src/`, 3I-2 і 3I-3
позначені ✅ у власних секціях, 3I-4 відхилено 2026-06-15. Статус виправлено в AGENTS.md
і, **поза `touches:`**, у зведеній таблиці `implementation-phases.md` — інакше два
документи суперечили б один одному в рядку, який цей запис щойно назвав правдивим.

**DEVELOPERS.md.** Записи про реєстр і AppData узгоджені (правити не довелось), але
поруч знайшлась своя брехня: серед прикладів прапорців стояв `--start-recording`, якого
`clap` не знає. Замінено повним переліком реальних прапорців — і тут рев'ю зловило вже
**нову** неточність у тому самому реченні: `--profile` і `--minimize` при передачі
запущеній копії не переадресовуються, а **відкидаються** (`cli.rs`, гілка
`CliContext::Forwarded` кладе їх у `ignored`). Речення розділено на дві половини.

**Хвіст у чергу, крім architecture-doc-drift.** У `package.json` лежать
`@tauri-apps/plugin-dialog` і `@tauri-apps/plugin-log`, яких не імпортує ніхто: з боку
JS живий лише `@tauri-apps/api`. Родич знятих `dead-dependencies`, які JS-обгортки
плагінів не перевіряли → [dead-js-tauri-plugins](p3-dead-js-tauri-plugins.md).

## Критерії готовності

- [x] `docs/help/` — запис видимої поведінки не змінює
- [x] Кожен рядок зведеної таблиці tech-stack.md збігається з `Cargo.toml` і
      `package.json` за назвою і мажорною версією
- [x] Кожен плагін у таблиці плагінів існує в `Cargo.toml`; ті, що відхилені, стоять
      у окремому списку «розглянуто й відхилено» з причиною в одному рядку
- [x] Повні цитати конфігів прибрано; замість них посилання на файли
- [x] Перелік компонентів React Aria відповідає імпортам у `src/`
- [x] Секція «Джерела досліджень» або посилається на файли, що існують, або прибрана
- [x] architecture.md не згадує `StreamTable`, TableView і плагіни shell, http, fs
- [x] AGENTS.md описує поточний стан проєкту одним правдивим рядком
- [x] `pnpm test` зелений: `docsLinks.test.ts` не бачить битих посилань

## Документи

- [tech-stack.md](../../tech-stack.md), [architecture.md](../../architecture.md), [AGENTS.md](../../../AGENTS.md)
- [accessibility-doc-audit](p2-accessibility-doc-audit.md) — прецедент звірки документа з кодом і формат звіту
- [architecture-doc-drift](p2-architecture-doc-drift.md) — решта architecture.md
- [dead-js-tauri-plugins](p3-dead-js-tauri-plugins.md) — мертві JS-обгортки плагінів
