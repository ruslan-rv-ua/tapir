---
slug: release-workflow
title: "Release-workflow: голий exe у GitHub Release на тег, scoop через Excavator"
summary: "Тег `v*` на `main` → `tapir-v<тег>-x64.exe` + `.sha256` у Release; bucket оновлює Excavator; git-flow як форма, PR як механіка; без ZIP, без підпису"
priority: P2
type: planned
status: ready
effort: L
kind: chore
target: 0.1.0
updated: 2026-09-07
a11y: false
depends_on: [ci-pipeline, single-version-source]
blocks: []
touches:
  - .github/workflows
  - packaging/scoop
  - build/
  - CHANGELOG.md
  - docs/release.md
  - README.md
  - AGENTS.md
  - DEVELOPERS.md
  - src-tauri/tauri.conf.json
gates: [pnpm test]
notes:
  - "Виділено з ci-pipeline під час грилінгу 2026-09-05: ворота відповідають на питання «що перевіряється», реліз — на питання «що роздається»."
  - "Грилінг 2026-09-07 (28 питань, три раунди). Дві вимоги додано в ході: встановлення через scoop і git-flow як модель гілок. Друга змінила форму запису: тег лягає на `main`, якого на origin досі не існує."
  - "Шаблон `examples/release-template.yml` і `DEVELOPMENT.md` у scoop-bucket застаріли: описують ZIP + `repository_dispatch` + PAT, а bucket перейшов на Excavator і тригер прибрав. Живий зразок — `release.yml` у PathMaster2."
  - "Перевірено 2026-09-07 на цій машині: exe, встановлені scoop, не несуть `Zone.Identifier`, тобто SmartScreen на scoop-шляху не з'являється."
  - "Виміряно 2026-09-07, холодна збірка в ізольованому target: `release` 238 с / 10,2 МБ; `release-fast` 128 с / 25,5 МБ."
---

# Release-workflow: голий exe у GitHub Release на тег, scoop через Excavator

> **Контекст:** рішення про форму артефакту і чому він непідписаний —
> [ADR «реліз — один голий exe»](../decisions/2026-09-07-release-is-one-bare-exe.md).
> Передумови — [ci-pipeline](done/p2-ci-pipeline.md) (ворота, які цей workflow не дублює)
> і [single-version-source](done/p2-single-version-source.md) (версію несе лише `Cargo.toml`).
> Живий зразок ланцюга — `release.yml` у PathMaster2 і його `packaging/scoop/`.

## Опис

Після [repo-public-rename](done/p2-repo-public-rename.md) у проєкту є публічна сторінка,
а завантажити нічого: README каже «download `tapir.exe` from Releases (not yet
available)». Запис дає два канали, якими Tapir потрапляє до людини:

- **прямий download** — один файл із GitHub Release;
- **scoop** — `scoop bucket add ruslan-rv-ua …` і `scoop install tapir`, із
  оновленням через `scoop update` і без екрана SmartScreen.

Обидва живляться з одного джерела — Release, який workflow публікує на тег `v*`. У
воротах exe **не** збирається (рішення [ci-pipeline](done/p2-ci-pipeline.md)): release-профіль
не переюзовує нічого з dev-збірки, це другий повний прохід по графу залежностей.

Запис доставляє **механізм**, не сам 0.1.0: закривається на зеленому `v0.1.0-rc.1`, а
справжній реліз — пізніший релізний PR за `docs/release.md`, коли дорожня карта до нього
дійде.

## Форма

### Артефакт

`tapir-v<тег>-x64.exe` + сайдкар `tapir-v<тег>-x64.exe.sha256` у форматі
`<hex64> *<ім'я файлу>` (те, що читає `sha256sum -c` і `autoupdate` scoop). Профіль
`release` (`just build`: LTO, `opt-level = "s"`): удвічі довше за `release-fast`, exe в
2,5 раза менший, і завантажує його кожен, а збирає раннер кілька разів на рік. Без ZIP,
без інсталятора, без підпису, без PDB — обґрунтування в ADR.

### Workflow `release.yml`

Тригер `push` тегу `v*`; `windows-latest`, як у `ci.yml`; **без кешу** — релізи рідкі,
збірка з чистого клону і є перевіркою, а кеш release-профілю посунув би корисний
dev-кеш воріт у 10-гігабайтному ліміті. Кроки, у порядку від дешевого до дорогого, і
кожен **відмовляє**, а не попереджає:

1. **Версія.** Тег без суфікса після дефіса дорівнює `version` у `Cargo.toml`
   (`v0.1.0-rc.1` → `0.1.0`). Суфікс у `Cargo.toml` не кладеться: `VERSIONINFO`
   чотирикомпонентний, і звірка «exe = тег» стала б брехнею саме там, де має бути точною.
2. **Походження коміту.** Тегований коміт лежить на `main`, і в нього зелені `frontend` і
   `backend` — запитом до API перевірок, а не повторним прогоном шести воріт: те саме
   SHA уже перевірено на PR у `main`, і 8 хвилин компіляції нічого не додали б.
3. **Нотатки.** `CHANGELOG.md` має непорожню секцію `## [<версія>]` (Keep a Changelog:
   `## [0.1.0] - YYYY-MM-DD`, підрозділи Added/Changed/Fixed). Граматика заголовка `## [`
   — контракт між цим кроком і всім, що колись читатиме файл. Пустий реліз не існує.
4. **Збірка.** `pnpm install --frozen-lockfile`, `pnpm tauri build --no-bundle` — рівно
   рецепт `just build`, і сторож у `build/` тримає їх однаковими.
5. **Артефакт.** Копія exe під релізним іменем; `VERSIONINFO` прочитаний **із зібраного
   файлу** дорівнює версії; сайдкар пишеться лише після цього.
6. **Публікація.** `gh release create <тег> --verify-tag --title "Tapir v<версія>"
   --notes-file`, з обома файлами. Тег із дефісом (`-rc.1`, `-beta`) → pre-release:
   Excavator і `checkver: github` дивляться лише на `releases/latest`, тож такий реліз
   для scoop невидимий, і це єдиний безпечний спосіб прогнати ланцюг.

Нічого у workflow не говорить із bucket і не тримає токенів до нього.

### Гілки: форма git-flow, механіка PR

Репозиторій уже ініціалізований для git-flow-next і роками стартує гілки через
`git flow start`; бракує половини `main`: локально це початковий коміт, на origin його
немає. Запис добудовує другу половину, але **лише як форму**: усі `git flow … finish`
зливають локально й пушать прямо, а захищена гілка це відхиляє.

- **`main` = випущено.** Народжується від поточного HEAD `origin/develop` (не від
  початкового коміту — інакше перший релізний PR тоне в 1563 комітах), захист як у
  `develop`: ті самі перевірки, `enforce_admins`, лише merge commit. Гілка за
  замовчуванням лишається `develop`: чужі PR мають іти туди.
- **Теги `v*`** під ruleset без видалення й переміщення, без обходу для адміністратора:
  Excavator знімає хеш із тегу, і посунутий тег — це маніфест, що бреше.
- **`ci.yml`** дістає `pull_request: main` і `push: main`; **кеш пише лише `push` на
  `develop`** — кеш не-default гілки доступний лише їй самій і PR у неї, тобто був би
  другим екземпляром у ліміті. Це правило `build/ciGates.test.ts` не стереже; коментар
  у workflow, як у решти.
- **Реліз = два PR.** `git flow release start X.Y.Z` від `develop` → bump `Cargo.toml` +
  `Cargo.lock`, секція CHANGELOG, README → PR `release/X.Y.Z` → `main` → зелений → merge
  → тег на merge commit → PR `main` → `develop` (зворотне злиття, теж merge commit, у тій
  самій сесії). Hotfix — та сама пара від `main`.
- **git flow керує лише `release/` і `hotfix/`.** Робочі гілки лишаються вільними
  префіксами з AGENTS.md; рядок «`main` не рухається» стає «`main` рухають лише
  `release/` і `hotfix/` через PR».
- **Тег ставить агент лише за явною командою в тій самій сесії** («випусти 0.1.0»), або
  людина. Тег одноразовий і не відкликається — це вужча межа, ніж довіра до PR.
- **Excavator запускає агент** (`gh workflow run excavator.yml -R ruslan-rv-ua/scoop-bucket`)
  останнім кроком: дія відклична (CI bucket сам відкочує зламаний маніфест) і йде вже
  після необоротного тегу. Добовий розклад лишається запобіжником.

### Scoop

- **`packaging/scoop/tapir.json` у Tapir** — джерело того, що **раз** засівається в
  bucket руками (Excavator оновлює, але не створює): `bin: "tapir.exe"`, `shortcuts`
  «Tapir» у Start Menu, **`persist: ["data", "recordings"]`** — під scoop обидві теки
  живуть у версійному каталозі `apps\tapir\current\`, а `scoop cleanup` і `uninstall`
  його видаляють; втратити записи на оновленні неприпустимо. `checkver: github`,
  `autoupdate` з URL `…/v$version/tapir-v$version-x64.exe#/tapir.exe` і хешем із
  `$url.sha256`. Фрагмент `#/tapir.exe` перейменовує файл, тож `bin` і ярлик стабільні.
- **Сторож у `build/`**: ім'я артефакту в `release.yml` і URL в `autoupdate` збігаються;
  команда збірки у workflow дорівнює рецепту `just build`.
- **У scoop-bucket** (сусідній репозиторій, окремим комітом): `bucket/tapir.json`,
  розділ Tapir у README, і **виправлення застарілого** `examples/release-template.yml` та
  `DEVELOPMENT.md` під модель Excavator — інакше наступний застосунок скопіює крок, на
  який ніхто не підписаний.

### Тексти

- **README:** два канали, прямий download першим (не вимагає PowerShell і scoop), scoop
  одразу за ним із двома чесними перевагами — без SmartScreen і з `scoop update`;
  клавіатурний шлях через SmartScreen («More info» → «Run anyway») поруч із посиланням;
  банер «Early development — not yet ready» → «Early release — expect rough edges»,
  «(not yet available)» зникає.
- **`docs/release.md`** — чекліст процедури (релізний PR → тег → дочекатись Release →
  Excavator → перевірити маніфест) і одноразове засівання bucket. `AGENTS.md` — одне
  правило про тег і рядок про `main`; `DEVELOPERS.md` — абзац «як роздається».
- **`CHANGELOG.md`** пише агент у релізному PR — з записів `docs/backlog/done/` із
  `target` цієї версії, переказаних мовою користувача, англійською (як README); людина
  читає й править. Не по рядку на кожне закриття: записи беклогу вже є журналом, а
  переказ раз на реліз дає цілісний текст. Локального тесту на секцію немає: між
  релізами `Cargo.toml` несе версію, якої ще нема, і тест був би червоний тижнями.
- **`docs/help/` без змін:** той, хто читає довідку, застосунок уже запустив.
- **`tauri.conf.json`:** `bundle.active: false`, `targets` прибрати — конфіг не обіцяє
  NSIS; `icon` лишається, його читає `tauri-build` для ресурсів exe.

## Порядок увімкнення

Порядок несучий, як і в [ci-pipeline](done/p2-ci-pipeline.md).

1. PR у `develop`: `release.yml`, зміни `ci.yml`, `packaging/scoop/tapir.json`, сторож у
   `build/`, `CHANGELOG.md` із чернеткою секції `[0.1.0]` (із закритих записів
   `target: 0.1.0`), `bundle.active: false`, `docs/release.md`, README, AGENTS.md,
   DEVELOPERS.md, закриття цього запису.
2. `main` від HEAD `origin/develop` (уже з workflow); захист `main`; ruleset на теги.
3. Тег `v0.1.0-rc.1` на HEAD `main` за явною командою → pre-release з exe і сайдкаром;
   перевірити руками: завантажити, пройти SmartScreen читачем за текстом README, запустити.
4. scoop-bucket: `bucket/tapir.json` із хешем rc не засівати — `checkver` його не побачить;
   засіяти після справжнього 0.1.0. Виправлення шаблону й `DEVELOPMENT.md` — уже зараз.
5. Справжній 0.1.0 — коли дорожня карта дійде: релізний PR за `docs/release.md`, тег,
   засівання bucket, Excavator, `scoop install tapir` на чистій машині.

## Свідомо відхилено

- **ZIP, інсталятор, підпис, самопідписаний сертифікат** — в ADR.
- **`generate_release_notes`** — перелік злитих PR із заголовками на кшталт
  `docs/data-models-doc-drift`; це не текст для людини, яка завантажує.
- **Нотатки з `docs/backlog/done/` напряму** — українською, для агента; вони джерело, а
  не результат.
- **Повторний прогін шести воріт у релізі** (модель PathMaster) — там тег лягає на коміт,
  якого CI не бачив; тут `main` під тими самими воротами, і SHA вже перевірено.
- **`git flow … finish`** — локальний merge і прямий push; відхиляється захистом, і
  правильно.
- **`main` від початкового коміту** — релізний PR на 1563 коміти, у якому bump не видно.
- **Кеш у релізному workflow** і **PDB як артефакт** — див. «Форма».
- **Тип `docs` у git flow** для робочих гілок — `git flow start` дав би лише ім'я, а ім'я
  й так задане правилом.

## Критерії готовності

- [ ] `docs/help/` — запис видимої поведінки застосунку не змінює; текст про SmartScreen
      і канали живе в README
- [ ] `push` тегу `v*` збирає `tapir-v<тег>-x64.exe` + `.sha256` профілем `release` і
      публікує їх у GitHub Release; тег із дефісом — pre-release
- [ ] Workflow відмовляє на: тег ≠ `Cargo.toml`, коміт поза `main` або без зелених
      перевірок, порожня секція CHANGELOG, `VERSIONINFO` ≠ версія — кожне перевірено
      навмисно зламаним прогоном, а не прочитанням
- [ ] `main` існує на origin, захищений як `develop`; ruleset на теги `v*` відмовляє
      видалення — перевірено спробою
- [ ] `ci.yml` ганяє ворота на PR у `main`; кеш пише лише `push: develop`
- [ ] Ворота лишились без змін — release-workflow до них не домішується
- [ ] `packaging/scoop/tapir.json` існує, сторож у `build/` тримає його й `release.yml`
      на одному імені артефакту й перевірений на падіння
- [ ] `v0.1.0-rc.1` опубліковано; exe завантажено з Release, SmartScreen пройдено за
      текстом README з NVDA, застосунок запущено
- [ ] У scoop-bucket виправлено `examples/release-template.yml` і `DEVELOPMENT.md`
- [ ] `docs/release.md`, `AGENTS.md`, `DEVELOPERS.md`, README оновлено;
      `bundle.active: false`
- [ ] Пам'ять агента про «`main` не рухається» оновлена (файл пам'яті, не репозиторій)

## Документи

- [ADR — реліз — один голий exe](../decisions/2026-09-07-release-is-one-bare-exe.md)
- [ADR — ворота відмовляють, а не радять](../decisions/2026-09-05-gates-refuse-rather-than-advise.md)
- [ADR — межа портативності](../decisions/2026-09-04-portable-boundary.md) — чому
  `persist` несе і `data`, і `recordings`
- [ci-pipeline](done/p2-ci-pipeline.md), [single-version-source](done/p2-single-version-source.md)
- `justfile` — рецепт `build`; `build/ciGates.test.ts` — зразок сторожа
- scoop-bucket: `.github/workflows/excavator.yml`, `bucket/pathmaster.json` — живий
  маніфест із `autoupdate` через сайдкар
- PathMaster2: `.github/workflows/release.yml`, `packaging/README.md`
- https://github.com/ScoopInstaller/GithubActions — Excavator
