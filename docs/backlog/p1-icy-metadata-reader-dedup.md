---
slug: icy-metadata-reader-dedup
title: "ICY-читач один раз: IcyMetadataReader замість двох ручних циклів"
priority: P1
type: planned
status: ready
effort: M
kind: bug
target: 0.1.0
updated: 2026-09-04
a11y: false
depends_on: []
blocks: [dead-dependencies]
touches:
  - src-tauri/src/player/engine.rs
  - src-tauri/src/stream/manager.rs
  - src-tauri/src/stream/connection.rs
  - src-tauri/Cargo.toml
gates: [cargo test, cargo clippy]
notes:
  - "Аудит 2026-09-04: цикл metaint і структура ReqwestSyncReader продубльовані в плеєрі й рекордері, розбір StreamTitle існує в трьох копіях. Крейт icy-metadata 0.6 уже в залежностях і має IcyMetadataReader."
  - "Обидва живі парсери ріжуть назву на першому апострофі: «Don't Stop» стає «Don». Це баг у назвах файлів, у wishlist-збігах і в тому, що чує людина."
---

# ICY-читач один раз: IcyMetadataReader замість двох ручних циклів

> **Контекст:** знахідка аудиту «велосипеди й костилі» 2026-09-04. Рішення ухвалено:
> замінити два ручні цикли на `IcyMetadataReader` з крейта, який уже підключено.
> Читати першими [connection.rs](../../src-tauri/src/stream/connection.rs) і секцію
> «Технічні деталі» нижче.

## Опис

Розбір ефіру Icecast/SHOUTcast написано двічі, рядок у рядок:

- [engine.rs#L611](../../src-tauri/src/player/engine.rs#L611) — `play_live`: структура
  `ReqwestSyncReader`, лічильник `bytes_until_meta`, читання блоку `len * 16`, вкладена
  функція `parse_stream_title`;
- [manager.rs#L794](../../src-tauri/src/stream/manager.rs#L794) — `recording_task`: та
  сама структура, той самий цикл, своя `parse_stream_title` у
  [manager.rs#L544](../../src-tauri/src/stream/manager.rs#L544).

Третя копія розбору лежить у [connection.rs#L110](../../src-tauri/src/stream/connection.rs#L110)
як scaffold під `allow(dead_code)` разом із `decode_icy_metadata`, яку ніхто не викликає.

Крейт `icy-metadata` 0.6 підключено, але з нього беруться лише `IcyHeaders` і
`RequestIcyMetadata`. Той самий крейт має `IcyMetadataReader<R: Read>`: обгортка над
синхронним читачем, яка сама рахує metaint, знімає блок метаданих і віддає
`IcyMetadata::stream_title()` у callback. Обидва місця в Tapir уже читають ефір
синхронно всередині `spawn_blocking`, тож крейт лягає на наявну форму без переробки
потоків.

**Баг, який заразом зникає.** Обидва живі парсери шукають перший апостроф після
`StreamTitle='`. Формат ICY апострофи в назві не екранує, тому трек «Don't Stop» стає
«Don», а «Rock'n'Roll Radio» стає «Rock». Крейт спершу ріже за `;`, потім зрізає лапки
з країв, і ці назви читає правильно. Зворотний бік: назва, що містить `;`, у крейті
обірветься на ньому. Крапка з комою в назвах трапляється значно рідше за апостроф.

## Критерії готовності

- [ ] `docs/help/` — підтвердити, що [recording.md](../help/en/recording.md) змін не
      потребує: видима поведінка та сама, назви лише перестають обрізатися
- [ ] Лічильник metaint і читання блоку метаданих існують у коді **один** раз, і це
      `IcyMetadataReader`; `grep bytes_until_meta` порожній
- [ ] `ReqwestSyncReader` оголошено один раз у спільному модулі, обидва споживачі
      беруть його звідти
- [ ] Розбір `StreamTitle` існує один раз, з тестами; серед тестів є `Don't Stop`,
      `Artist - Title`, порожня назва, назва без ` - `, хвіст із `\0`
- [ ] Перші байти з `connect` (поле `prefix`) і далі йдуть у читач першими: ADR
      «невідомий формат» не зламано, `format::detect` бачить ті самі байти
- [ ] Плеєр і рекордер дістають ту саму пару artist/title з того самого блоку; події
      `track-changed`, SMTC і сплітер працюють як раніше
- [ ] Scaffold-функції в `connection.rs` (`decode_icy_metadata`, `parse_stream_title`)
      або задіяні, або видалені разом із `allow(dead_code)`
- [ ] `cargo test`, `cargo clippy` без помилок

## Прийняті рішення

- **Невалідний UTF-8.** Живий код зараз декодує через `from_utf8_lossy`; latin-1
  фолбек зі scaffold-у в продакшн ніколи не заходив. Крейт віддає такий блок як
  `Err(InvalidUtf8)` з доступом до байтів через `into_bytes()`. Лишити паритет із
  сьогоднішньою поведінкою: у гілці `Err` брати байти й декодувати lossy. NFC-нормалізацію
  не додавати, поки на неї немає реального потоку.
- **Де живе спільний код.** У `stream::connection` поруч із `IcyConnection`: там уже є
  `prefix` і `response`, з яких читач збирається. Окремий модуль заводити не треба.

## Технічні деталі

`IcyMetadataReader::new(inner, metaint: Option<NonZeroUsize>, callback)` де
`callback: Fn(Result<IcyMetadata, MetadataParseError>) + Send + Sync + 'static`.
Callback викликається з потоку читача, тож у нього передається `Sender` каналу подій,
який уже є в обох місцях (`IcyEvent` у плеєрі, `ReadEvent` у рекордері). Блок нульової
довжини callback не викликає.

Документація крейта: https://docs.rs/icy-metadata/latest/icy_metadata/struct.IcyMetadataReader.html

## Документи

- [connection.rs](../../src-tauri/src/stream/connection.rs) — `IcyConnection`, scaffold-и
- [engine.rs](../../src-tauri/src/player/engine.rs), [manager.rs](../../src-tauri/src/stream/manager.rs) — два ручні цикли
- [ADR: невідомий формат — відмовити, а не вгадати](../decisions/2026-08-31-refuse-unknown-format-rather-than-guess.md) — чому `prefix` мусить іти першим
- [dead-dependencies](p2-dead-dependencies.md) — доля `unicode-normalization` залежить від рішення про NFC тут
