# Реліз: чекліст

Як версія Tapir потрапляє до людини. Механізм — [release.yml](../.github/workflows/release.yml);
форма артефакту й чому він непідписаний —
[ADR «реліз — один голий exe»](decisions/2026-09-07-release-is-one-bare-exe.md);
рішення грилінгу — [release-workflow](backlog/p2-release-workflow.md).

Модель гілок — **форма git-flow, механіка PR**: `develop` — інтеграція, `main` — випущене,
`release/` і `hotfix/` стартують через `git flow start`, а **зливаються лише pull request'ом**.
`git flow … finish` не використовується ніколи: він зливає локально й пушить прямо, а обидві
гілки захищені й це відхиляють.

Хто що робить: агент виконує кожен крок нижче, **крім тегу** — тег ставиться лише за явною
командою людини в тій самій сесії («випусти 0.1.0»). Тег одноразовий і не відкликається.

## Одноразово: підготовка репозиторію

Зроблено при впровадженні запису; тут — щоб було де звірити, якщо щось зникло.

- [ ] `main` існує на origin і захищений як `develop`: обов'язкові перевірки `frontend` і
      `backend`, «Require branches to be up to date», адміністратор включений, лише merge commit.
- [ ] Ruleset на теги `v*`: видалення й переміщення заборонені, без обходу. Перевірити спробою
      `git push --delete origin <тестовий тег>` — має відмовити.
- [ ] Гілка за замовчуванням лишається `develop`.

## Реліз X.Y.Z

1. **Гілка.** `git flow release start X.Y.Z` (від `develop`). Локальний `develop` перед тим —
   `git pull`.
2. **Версія.** `version` у `src-tauri/Cargo.toml` → `X.Y.Z`; `cargo update -p tapir` оновлює
   `Cargo.lock`. Це єдине джерело версії ([single-version-source](backlog/done/p2-single-version-source.md)).
3. **CHANGELOG.** Секція `## [X.Y.Z] - YYYY-MM-DD` у `CHANGELOG.md` — переказ записів
   `docs/backlog/done/` із `target: X.Y.Z` мовою користувача, англійською. Пишеться агентом,
   читається людиною в PR. Порожню секцію workflow відмовить.
4. **README.** Те, що змінилось для людини, яка завантажує.
5. **Ворота** локально: `just check`, `just check-rust`; `build/releaseShape.test.ts` серед них.
6. **PR у `main`.** `git push -u origin release/X.Y.Z`, `gh pr create --base main`. Дочекатись
   зеленого, `gh pr merge --merge`. `main` тепер несе релізний коміт, і CI на `push: main`
   перевіряє його ще раз — **дочекатись і цього прогону**: workflow релізу читає його вердикт.
7. **Тег** — лише за явною командою:
   ```
   git fetch origin main
   git tag -a vX.Y.Z -m "Tapir vX.Y.Z" origin/main
   git push origin vX.Y.Z
   ```
8. **Release.** `gh run watch` на workflow «Release»; після зеленого —
   `gh release view vX.Y.Z` показує `tapir-vX.Y.Z-x64.exe` і `.sha256`.
9. **Зворотне злиття.** PR `main` → `develop`: `gh pr create --base develop --head main`,
   дочекатись, `gh pr merge --merge`, `git pull`.
10. **Bucket.** Перший реліз — засівання (розділ нижче). Кожен наступний —
    `gh workflow run excavator.yml -R ruslan-rv-ua/scoop-bucket`, потім перевірити, що
    `bucket/tapir.json` у bucket оновився й CI bucket зелений. Добовий розклад Excavator —
    запобіжник, якщо крок забули.
11. **Перевірка руками.** На чистій машині або в чистій теці: `scoop update`,
    `scoop install tapir` (або `scoop update tapir`), запуск; окремо — прямий download із
    Release і прохід SmartScreen читачем екрана за текстом README.

## Pre-release (rc)

Тег із суфіксом після дефіса — `v0.1.0-rc.1` — проходить той самий workflow, але Release
позначається pre-release, а `releases/latest` не рухається, тож bucket його не бачить. Це спосіб
прогнати весь ланцюг без наслідків для scoop.

Правило звірки: workflow порівнює з `Cargo.toml` **тег без суфікса** (`0.1.0`), а в exe стоїть
`0.1.0`. Суфікс у `Cargo.toml` не кладеться: `VERSIONINFO` чотирикомпонентний.

## Hotfix X.Y.Z+1

`git flow hotfix start X.Y.Z+1` (від `main`), далі кроки 2–11 із «Реліз» без змін: PR у `main`,
тег, зворотне злиття в `develop`.

## Засівання bucket (перший реліз)

Excavator лише оновлює маніфести, які вже є в `bucket/`. Один раз, після справжнього (не rc)
релізу:

1. Скопіювати [packaging/scoop/tapir.json](../packaging/scoop/tapir.json) у
   `c:\dev\scoop-bucket\bucket\tapir.json`, **без поля `"##"`** або з ним — scoop його ігнорує.
2. Замінити `hash` значенням із сайдкара: перші 64 символи файлу
   `tapir-vX.Y.Z-x64.exe.sha256` з Release.
3. Локально: `scoop install c:\dev\scoop-bucket\bucket\tapir.json` — має завантажити, поставити
   ярлик і запуститись; `scoop uninstall tapir` після.
4. Додати розділ Tapir у README bucket (за зразком сусідів: опис, key features, команда).
5. Коміт і push у `main` bucket; CI bucket валідує маніфест і відкочує, якщо він битий.

## Коли щось пішло не так

- **Workflow червоний на кроці «checks are green».** Тег запушено раніше, ніж CI на
  `push: main` завершився. Дочекатись зеленого й перезапустити workflow з вкладки Actions
  («Re-run all jobs») — тег той самий, нічого не переставляти.
- **Workflow червоний на кроці CHANGELOG.** Секції під тегом немає або вона порожня. Тег уже
  стоїть і не рухається — виправлення йде hotfix'ом із новою версією, не правкою тегу.
- **Release існує, а bucket не оновився.** `gh run list -R ruslan-rv-ua/scoop-bucket` — лог
  Excavator каже, що він побачив. Найчастіше: реліз позначений pre-release або сайдкар відсутній.
- **Треба відкотити маніфест у bucket.** Workflow «Set a manifest by hand (override)» у bucket:
  app, version, hash, url попередньої версії.
