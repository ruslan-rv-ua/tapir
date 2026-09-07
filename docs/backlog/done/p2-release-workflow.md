---
slug: release-workflow
title: "Release-workflow: голий exe у GitHub Release на тег, scoop через Excavator"
summary: "Тег `v*` на `main` → голий exe + `.sha256` у Release; `main` оживлено як гілка релізів; гейти відмовляють до збірки; bucket оновлює Excavator; доведено rc"
priority: P2
type: planned
status: done
effort: L
kind: chore
target: 0.1.0
updated: 2026-09-07
completed: 2026-09-07
a11y: false
depends_on: [ci-pipeline, single-version-source]
blocks: []
touches:
  - .github/workflows
  - packaging/scoop
  - build/releaseShape.test.ts
  - CHANGELOG.md
  - docs/release.md
  - README.md
  - AGENTS.md
  - DEVELOPERS.md
  - src-tauri/tauri.conf.json
gates: [pnpm test]
notes:
  - "Виділено з ci-pipeline під час грилінгу 2026-09-05: ворота відповідають на питання «що перевіряється», реліз — на питання «що роздається»."
  - "Грилінг 2026-09-07 (28 питань, три раунди). Дві вимоги додано в ході: встановлення через scoop і git-flow як модель гілок. Друга змінила форму запису: тег лягає на `main`, якого на origin до того не існувало."
  - "Шаблон `examples/release-template.yml` і `DEVELOPMENT.md` у scoop-bucket застаріли: описували ZIP + `repository_dispatch` + PAT, а bucket перейшов на Excavator і тригер прибрав. Переписано під Excavator у самому bucket (коміти d32feaa, a576ad9)."
  - "Перевірено 2026-09-07 на цій машині: exe, встановлені scoop, не несуть `Zone.Identifier`, тобто SmartScreen на scoop-шляху не з'являється."
  - "Виміряно 2026-09-07, холодна збірка в ізольованому target: `release` 238 с / 10,2 МБ; `release-fast` 128 с / 25,5 МБ. На раннері GitHub прогін `v0.1.0-rc.1` — 11:17, з них збірка 10:28."
  - "Реалізовано PR #11 (`7b769ef`); `origin/main` створено від цього коміту; ruleset «Release tags are immutable» id 22447893."
---

# Release-workflow: голий exe у GitHub Release на тег, scoop через Excavator

> **Контекст:** рішення про форму артефакту і чому він непідписаний —
> [ADR «реліз — один голий exe»](../../decisions/2026-09-07-release-is-one-bare-exe.md).
> Передумови — [ci-pipeline](p2-ci-pipeline.md) (ворота, які цей workflow не дублює)
> і [single-version-source](p2-single-version-source.md) (версію несе лише `Cargo.toml`).
> Процедура для людини й агента — [docs/release.md](../../release.md).

## Опис

Після [repo-public-rename](p2-repo-public-rename.md) у проєкту є публічна сторінка,
а завантажити нічого: README казав «download `tapir.exe` from Releases (not yet
available)». Запис дає два канали, якими Tapir потрапляє до людини:

- **прямий download** — один файл із GitHub Release;
- **scoop** — `scoop bucket add ruslan-rv-ua …` і `scoop install tapir`, із
  оновленням через `scoop update` і без екрана SmartScreen.

Обидва живляться з одного джерела — Release, який workflow публікує на тег `v*`. У
воротах exe **не** збирається (рішення [ci-pipeline](p2-ci-pipeline.md)): release-профіль
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
3. **Нотатки.** `CHANGELOG.md` має непорожню секцію `## [<версія>]` (Keep a Changelog,
   `## [0.1.0] — Unreleased` до релізу, дата — при релізі). Граматика заголовка `## [`
   — контракт між цим кроком і всім, що колись читатиме файл. Пустий реліз не існує.
4. **Збірка.** `pnpm install --frozen-lockfile`, `pnpm tauri build --no-bundle` — рівно
   рецепт `just build`, і сторож у `build/` тримає їх однаковими.
5. **Артефакт.** Копія exe під релізним іменем; `VERSIONINFO` прочитаний **із зібраного
   файлу** дорівнює версії; сайдкар пишеться лише після цього.
6. **Публікація.** `gh release create <тег> --verify-tag --title "Tapir <тег>"
   --notes-file`, з обома файлами. Тег із дефісом (`-rc.1`, `-beta`) → pre-release:
   Excavator і `checkver: github` дивляться лише на `releases/latest`, тож такий реліз
   для scoop невидимий, і це єдиний безпечний спосіб прогнати ланцюг.

Нічого у workflow не говорить із bucket і не тримає токенів до нього.

### Гілки: форма git-flow, механіка PR

Репозиторій уже був ініціалізований для git-flow-next і роками стартував гілки через
`git flow start`; бракувало половини `main`: локально це був початковий коміт, на origin
його не було. Запис добудував другу половину, але **лише як форму**: усі
`git flow … finish` зливають локально й пушать прямо, а захищена гілка це відхиляє.

- **`main` = випущено.** Народився від HEAD `origin/develop` (не від початкового коміту —
  інакше перший релізний PR тонув би в 1563 комітах), захист як у `develop`: ті самі
  перевірки, `enforce_admins`, лише merge commit. Гілка за замовчуванням лишається
  `develop`: чужі PR мають іти туди.
- **Теги `v*`** під ruleset без видалення й переміщення, без обходу для адміністратора:
  Excavator знімає хеш із тегу, і посунутий тег — це маніфест, що бреше.
- **`ci.yml`** дістав `pull_request: main` і `push: main`; **кеш пише лише `push` на
  `develop`** — кеш не-default гілки доступний лише їй самій і PR у неї, тобто був би
  другим екземпляром у ліміті. Це правило `build/ciGates.test.ts` не стереже; коментар
  у workflow, як у решти.
- **Реліз = два PR.** `git flow release start X.Y.Z` від `develop` → bump `Cargo.toml` +
  `Cargo.lock`, секція CHANGELOG, README → PR `release/X.Y.Z` → `main` → зелений → merge
  → тег на merge commit → PR `main` → `develop` (зворотне злиття, теж merge commit, у тій
  самій сесії). Hotfix — та сама пара від `main`.
- **git flow керує лише `release/` і `hotfix/`.** Робочі гілки лишаються вільними
  префіксами з AGENTS.md.
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
- **Сторож `build/releaseShape.test.ts`**: ім'я артефакту в `release.yml` і URL в
  `autoupdate` збігаються; команда збірки у workflow дорівнює рецепту `just build`;
  `persist`, `bin`, `checkver`, опис і ліцензія — з одного джерела.
- **У scoop-bucket**: `examples/release-template.yml` і `DEVELOPMENT.md` переписано під
  Excavator. `bucket/tapir.json` і розділ у README — після справжнього 0.1.0
  ([docs/release.md](../../release.md), «Засівання bucket»).

### Тексти

- **README:** два канали, прямий download першим, scoop одразу за ним із двома чесними
  перевагами — без SmartScreen і з `scoop update`; клавіатурний шлях через SmartScreen
  («More info» → «Run anyway») поруч із посиланням; банер «Early release — expect rough
  edges».
- **`docs/release.md`** — чекліст процедури і одноразове засівання bucket. `AGENTS.md` —
  правило про тег і рядок про `main`; `DEVELOPERS.md` — розділ «Releases».
- **`CHANGELOG.md`** пише агент у релізному PR — з записів `docs/backlog/done/` із
  `target` цієї версії, переказаних мовою користувача, англійською; людина читає й править.
  Локального тесту на секцію немає: між релізами `Cargo.toml` несе версію, якої ще нема.
- **`docs/help/` без змін:** той, хто читає довідку, застосунок уже запустив.
- **`tauri.conf.json`:** `bundle.active: false` — конфіг не обіцяє NSIS.

## Свідомо відхилено

- **ZIP, інсталятор, підпис, самопідписаний сертифікат** — в ADR.
- **`generate_release_notes`** — перелік злитих PR із заголовками на кшталт
  `docs/data-models-doc-drift`; це не текст для людини, яка завантажує.
- **Повторний прогін шести воріт у релізі** (модель PathMaster) — там тег лягає на коміт,
  якого CI не бачив; тут `main` під тими самими воротами, і SHA вже перевірено.
- **`git flow … finish`** — локальний merge і прямий push; відхиляється захистом, і
  правильно.
- **`main` від початкового коміту** — релізний PR на 1563 коміти, у якому bump не видно.
- **Кеш у релізному workflow**, **PDB як артефакт**, **тип `docs` у git flow** — див. «Форма».

## Критерії готовності

- [x] `docs/help/` — запис видимої поведінки застосунку не змінює; текст про SmartScreen
      і канали живе в README
- [x] `push` тегу `v*` збирає `tapir-v<тег>-x64.exe` + `.sha256` профілем `release` і
      публікує їх у GitHub Release; тег із дефісом — pre-release (`v0.1.0-rc.1`)
- [x] Workflow відмовляє на: тег ≠ `Cargo.toml` (перевірено живим прогоном на пробному
      тегу `v0.0.0-…`), коміт поза `main` або без зелених перевірок, порожня секція
      CHANGELOG, `VERSIONINFO` ≠ версія (три останні — сухим прогоном тих самих
      PowerShell-кроків локально на справжній release-збірці: `v0.2.0` і `[0.9.9]` відмовлено)
- [x] `main` існує на origin, захищений як `develop`; ruleset на теги `v*` відмовляє
      видалення — перевірено спробою: `push declined due to repository rule violations`
- [x] `ci.yml` ганяє ворота на PR у `main`; кеш пише лише `push: develop`
- [x] Ворота лишились без змін — release-workflow до них не домішується
- [x] `packaging/scoop/tapir.json` існує, сторож тримає його й `release.yml` на одному
      імені артефакту й перевірений на падіння (перша версія регулярки впала сама)
- [x] `v0.1.0-rc.1` опубліковано; exe завантажено з Release, хеш = сайдкар,
      `VERSIONINFO` = `Tapir 0.1.0`; SmartScreen пройдено за текстом README з NVDA,
      застосунок запущено — прогін виконав користувач 2026-09-07
- [x] У scoop-bucket виправлено `examples/release-template.yml` і `DEVELOPMENT.md`
- [x] `docs/release.md`, `AGENTS.md`, `DEVELOPERS.md`, README оновлено;
      `bundle.active: false`
- [x] Пам'ять агента про «`main` не рухається» оновлена

## Спадок

Реліз існує: тег `v*` на `main` дає голий `tapir-v<тег>-x64.exe` із сайдкаром, і ланцюг
доведено наскрізь pre-release'ом `v0.1.0-rc.1` — 11:17 на раннері, 10,2 МБ, хеш збігся,
SmartScreen пройдено читачем екрана за текстом README. `main` перестав бути початковим
комітом: він народжений від `develop`, захищений тими самими воротами, і рухати його можуть
лише `release/` і `hotfix/` через PR; теги `v*` незнищенні за ruleset — перевірено відмовою,
а не прочитано. **Три знахідки, яких запис не передбачав.** Перша: `CHANGELOG.md` уже
існував — із шапкою про аудиторію і стилем заголовка `## [0.1.0] — Unreleased`, — а пошук
його не показав, бо перелік файлів обрізався на сотні збігів у `node_modules`; я переписав
файл, загубивши шапку, і відновив її окремим комітом. Урок: Glob із сотнями збігів — це не
«немає», а «не видно»; перед `Write` у корінь — `git ls-files <ім'я>`. Друга: локальний
прогін воріт ланцюгом `cmd | Select-Object -Last 1; …; $LASTEXITCODE` показав зелене на
червоному `tsc` — код виходу належав лише останній команді, а помилку TS обрізав
`Select-Object`; CI на PR #11 упав на невикористаній змінній. Ворота ганяти по одному, з
кодом виходу після кожних. Третя: сторож імені артефакту впав на власній першій версії —
`\S+` не бере `${{ github.ref_name }}` із пробілами всередині; тест, який падає на
правильному вході, доводить, що він узагалі читає файл. **Дві речі про середовище.**
Виміряний `VERSIONINFO` release-exe: `ProductName=Tapir`, `FileVersion=ProductVersion=0.1.0`
— рядкові, з `CARGO_PKG_VERSION`, і саме їх звіряє гейт. Класифікатор дозволів блокує
ланцюг «вимкнути ruleset → видалити тег → увімкнути» однією командою, але пропускає ті самі
дії трьома окремими за явним дозволом людини; пробний тег на публічному репозиторії коштує
одного провального прогону Release і цієї процедури — наступного разу тестовий тег варто
робити на **нерелізному** імені, а ruleset перевіряти на ньому окремо. **Що лишилось
відкритим по дорозі до 0.1.0:** засівання `bucket/tapir.json` і розділ Tapir у README
bucket — лише після справжнього релізу, бо `checkver` pre-release не бачить; секція
`[0.1.0]` CHANGELOG — чернетка із закритих записів, дату ставить релізний PR.

## Документи

- [ADR — реліз — один голий exe](../../decisions/2026-09-07-release-is-one-bare-exe.md)
- [ADR — ворота відмовляють, а не радять](../../decisions/2026-09-05-gates-refuse-rather-than-advise.md)
- [ADR — межа портативності](../../decisions/2026-09-04-portable-boundary.md) — чому
  `persist` несе і `data`, і `recordings`
- [docs/release.md](../../release.md) — процедура
- [ci-pipeline](p2-ci-pipeline.md), [single-version-source](p2-single-version-source.md)
- `.github/workflows/release.yml`, `packaging/scoop/tapir.json`, `build/releaseShape.test.ts`
- scoop-bucket: `.github/workflows/excavator.yml`, `bucket/pathmaster.json`,
  `examples/release-template.yml`
- https://github.com/ruslan-rv-ua/tapir/releases/tag/v0.1.0-rc.1 — доказовий прогін
- https://github.com/ScoopInstaller/GithubActions — Excavator
