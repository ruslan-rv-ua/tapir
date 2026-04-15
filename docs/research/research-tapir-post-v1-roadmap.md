# Roadmap Tapir: план розвитку після 0.1.0

> Дата дослідження: квітень 2026  
> Автор: AI Research Analyst  
> Застосовується до: Tapir 0.1.0+ (після повного випуску всіх 4 фаз)

---

## Короткий підсумок

> Tapir 0.1.0 вже закриває більшість базових можливостей конкурентів (запис, wishlist, програвач, розклад, профілі). Найбільші прогалини порівняно з ринком — **якість метаданих** (album art, lyrics, Last.fm), **точність розрізання треків** (silence detection), **редактор тегів** у застосунку, і **підтримка HLS**. Жоден конкурент не має нативної, задокументованої підтримки NVDA/JAWS — це унікальна і захищена ніша Tapir. Пріоритет: спочатку покращити **якість вихідних файлів** (v1.1–v1.3), потім поглибити **accessibility-диференціацію** (v1.4), далі розширити протоколи й формати (v1.5–v2.0). Подкасти — природне доповнення на v2.1.

---

## Ключові знахідки

- ✅ streamWriter — найпопулярніший конкурент — має **silence detection**, **ручний редактор нарізки**, **редактор тегів**, **конвертацію форматів** через зовнішні кодеки, **category/папки** для потоків, **charts/title search** зі свого сервера
- ✅ Audials Radio має **автоматичне завантаження album art + lyrics**, **пакетний редактор тегів**, **podcast manager**, **перегляд останніх пісень на станції**
- ✅ Screamer Radio підтримує **HLS потоки**, **FLAC**, **Ogg Vorbis**, **Opus**, **WMA**, **sleep timer**
- ✅ Symphonia (вже в стеку Tapir) має Excellent-рівень підтримки FLAC та Vorbis — тобто ці формати можна додати без зміни бібліотек
- ✅ MusicBrainz API (Rust crate `musicbrainz_rs`) і Last.fm Scrobbling API — безкоштовні, без ключів для некомерційного використання
- ✅ lrclib.net — безкоштовний API для синхронізованих текстів пісень (LRC-формат), без ключів, без обмежень для open-source
- ⚠️ HLS-підтримка — критична для великих радіостанцій (BBC, RTÉ, Суспільне), але технічно складна: потребує власного сегментного завантажувача
- ⚠️ RadioMaximus та StationRipper — сайти або недоступні, або перенаправлені; прямий аналіз обмежений; відомо, що RadioMaximus має album art і EQ-еквалайзер для відтворення
- ⚠️ RadioSure — домен захоплено, продукт офіційно не існує
- ❓ StationRipper — сайт перенаправляє на Facebook Like-кнопку; застосунок, мабуть, неактивний
- ✅ Відомо з форуму streamWriter: users запитують **calendar view** для розкладу, **tracklist export** для шоу-записів, split-at-clock-boundary, custom folder hierarchy
- ✅ Жоден з конкурентів не має офіційної NVDA/JAWS accessibility документації, тестування або add-on розповсюдження — це унікальна конкурентна перевага Tapir

---

## Детальний аналіз конкурентів

### streamWriter (Windows, безкоштовний, open-source, Free Pascal)

**Офіційний сайт:** streamwriter.org | Активний розвиток, версія 6.0.1 (09.2024)

| Фіча | Наявна в streamWriter | Наявна в Tapir 0.1.0 | Примітка |
|---|---|---|---|
| MP3/AAC запис з ICY | ✅ | ✅ | Базова |
| Wishlist + автозапис | ✅ | ✅ | streamWriter додає wildcard-і автоматично |
| Розклад (oneshot/recurring) | ✅ | ✅ | |
| Radio Browser / stream browser | ✅ | ✅ | |
| Post-processing (зовнішні скрипти) | ✅ | ✅ | |
| Silence detection для split | ✅ | ❌ | Ключова різниця |
| Ручний редактор нарізки (waveform) | ✅ | ❌ | Fadin/fadeout, set cut positions |
| SoX ефекти (normalize, EQ...) | ✅ | ❌ | Через зовн. SoX binary |
| Конвертація / зовн. кодеки | ✅ | ❌ | FFmpeg, LAME, Ogg... |
| Title/Charts search (власний сервер) | ✅ | ❌ | Community-based |
| Авто-тюнінг від спільноти | ✅ | ❌ | Detect via other users' streams |
| Category/folders для потоків | ✅ | ❌ | Drag-and-drop в категорії |
| Редактор тегів для файлів | ✅ | ❌ | Edit artist/title/album/cover art |
| Rename saved files | ✅ | ❌ | |
| Import external files до Songs | ✅ | ❌ | |
| Stream blacklist (для автозапису) | ✅ | ❌ | |
| Мінімальний бітрейт для автозапису | ✅ | ❌ | |
| Portable режим | ✅ | ✅ | |
| Accessibility / screen reader | ❌ | ✅ | **Tapir унікальний** |
| Album art автозавантаження | ❌ | ❌ | Немає в жодного конкурента (крім Audials) |
| Lyrics | ❌ | ❌ | |
| Last.fm scrobbling | ❌ | ❌ | |
| Podcast support | ❌ | ❌ | |
| HLS потоки | ❌ | ❌ | |

**Висновок щодо streamWriter:** Найближчий конкурент. Основні прогалини Tapir відносно нього — silence detection, редактор тегів, конвертація форматів. streamWriter, у свою чергу, не має accessibility.

---

### Audials Radio (Windows/Android/iOS, freemium/платний, Audials AG)

| Фіча | Наявна в Audials | Наявна в Tapir 0.1.0 |
|---|---|---|
| 100 000+ станцій через власну базу | ✅ | ⚠️ (через Radio Browser API) |
| Автоматичний album art | ✅ | ❌ |
| Автоматичне завантаження lyrics | ✅ | ❌ |
| Podcast manager (RSS, auto-download) | ✅ | ❌ |
| «Recently played per station» | ✅ | ❌ |
| Batch tag editor | ✅ | ❌ |
| Mass recording (100 станцій одночасно) | ✅ | ❌ |
| AI music enhancer | ✅ (платний) | ❌ |
| Companion mobile app | ✅ | ❌ |
| Accessibility / screen reader | ❌ | ✅ |
| Portable mode | ❌ | ✅ |
| Безкоштовний | ❌ (freemium) | ✅ |

**Висновок:** Audials є найбільш feature-saturated конкурентом, але комерційний і не portable. Album art + lyrics — найзручніші для копіювання ідеї.

---

### Screamer Radio (Windows, free + paid для темної теми)

| Фіча | Наявна в Screamer | Наявна в Tapir 0.1.0 |
|---|---|---|
| HLS потоки | ✅ | ❌ |
| FLAC від станції | ✅ | ❌ |
| Ogg Vorbis від станції | ✅ | ❌ |
| Opus від станції | ✅ | ❌ |
| WMA від станції | ✅ | ❌ |
| Sleep timer | ✅ | ❌ |
| Dark/Light theme | ✅ | ✅ |
| Windows Media Keys | ✅ | ✅ |
| Запис до файлів | ❌ (лише відтворення) | ✅ |
| Wishlist / автозапис | ❌ | ✅ |
| Розклад | ❌ | ✅ |
| Accessibility | ❌ | ✅ |

**Висновок:** Screamer — переважно плеєр, майже не записує. Основний внесок у порівняння: HLS, FLAC/OGG, sleep timer. Різниця з Tapir: немає запису, nimає accessibility.

---

### RadioMaximus / RarmaRadio / інші (обмежений аналіз)

RadioMaximus та RarmaRadio — комерційні Windows-програми з типовими функціями: album art, EQ, favorites, запис. Недоступні для прямого аналізу станом на квітень 2026.

**Відомо з альтернативних джерел (AlternativeTo):**
- RadioMaximus: album art display, інтеграція з Windows Media Library ⚠️
- RarmaRadio: "більш інтуїтивний GUI" — нічого унікального у функціоналі ⚠️
- StationRipper: продукт очевидно defunct (сайт вмер, Facebook redirect) ✅

---

## Запити користувачів зі спільнот

З форуму streamWriter (278 threads у «Suggestions»), GitHub Screamer Radio Issues, та загального розуміння ринку:

| Запит | Джерело | Пріоритет |
|---|---|---|
| Calendar view для розкладу | streamWriter forum 12.09.24 | Medium |
| Tracklist/cue sheet для записів показів | streamWriter forum 12.09.24 | Medium |
| Split запис at top-of-hour | streamWriter forum 25.03.25 | Low |
| %weekday% в шаблоні папки | streamWriter forum 12.09.23 | Low (вже є %d) |
| Health check/status станцій | Screamer #14, #17 | Medium |
| Album art для записаних треків | Загальний, Audials | High |
| Lyrics до записів | Загальний | High |
| Last.fm scrobbling | Загальний (widely requested) | High |
| Sleep timer | Загальний, особливо незрячі | High |
| HLS Stream support | Загальний, Screamer #4 planned | High |
| Verbosity control for announcements | Accessibility нише | High (для ЦА) |
| NVDA add-on / JAWS scripts | Accessibility нише | High (для ЦА) |
| Кастомний формат оголошень | Accessibility нише | Medium |

---

## Roadmap: Пріоритезований план релізів

### v1.1 — «Збагачення метаданих»
**Тема:** Автоматично доповнювати записані треки album art, текстами та збагаченими ID3-тегами.

**Фічі:**

| Фіча | Опис | Складність |
|---|---|---|
| **Album art auto-fetch** | Для кожного збереженого треку — пошук обкладинки альбому через Last.fm API (`album.getInfo`) та Cover Art Archive (CAA). Зберігається як embedded ID3v2 APIC / M4A cover. | Low |
| **Lyrics auto-fetch** | Синхронізовані тексти (.lrc formат) через lrclib.net (безкоштовний, без ключів). Зберігаються як SYLT/USLT тег. | Low |
| **Last.fm scrobbling** | Відправка прослуханих/записаних треків до Last.fm профілю (track.scrobble API). Опціонально: вхід через OAuth, налаштування «scrobble при записі» / «scrobble при відтворенні». | Medium |
| **MusicBrainz tag enrichment** | Пошук за artist+title через MusicBrainz API (Rust crate `musicbrainz_rs`). Доповнення album, year, genre якщо відсутні в ICY. Rate-limit: 1 req/sec. | Medium |
| **Налаштування в Settings** | Toggle для кожного джерела збагачення. Offline-режим (пропустити збагачення без помилок). | Low |

**Обґрунтування:** Більшість конкурентів цього не мають (крім Audials, який комерційний). Висока цінність для ВСІХ користувачів: записані файли відразу готові для медіаплеєра. Low/Medium складність — лише нові HTTP-запити + запис тегів через вже наявну `lofty`. Жоден з free-конкурентів не має album art автоматично.

**Залежності:** Потребує стабільного Settings API (є у 0.1.0 Фаза 4). Нові Rust-залежності: `musicbrainz_rs`.

---

### v1.2 — «Чіткі межі треків»
**Тема:** Підвищити якість розрізання записів через автоматичний пошук тиші на межах треків.

**Фічі:**

| Фіча | Опис | Складність |
|---|---|---|
| **Silence detection** | Аналіз PCM-даних навколо ICY-metadata зміни (configurable radius: ±2–10 с). Пошук quiet-рамп < threshold dB за мінімальний час (ms). Symphonia декодує в PCM буфер; аналіз в Rust. | Medium |
| **Авто split по знайденій тиші** | Якщо тиша знайдена — трек обрізається по ній. Якщо ні — використовується buffer-append (вже планувалось в PRD, але без detection). | Medium |
| **Visual indicator у Saved Songs** | Іконка "✂️ silence-cut" поруч з треком (аналогічно до streamWriter scissors-icon). | Low |
| **Per-stream & global settings** | `silenceDetectionEnabled`, `silenceScanRadius` (ms), `silenceThresholdDb`, `silenceMinDuration` (ms) у profілі та per-stream overrides. | Low |

**Обґрунтування:** streamWriter рекламує silence detection як ключову фічу 15 років. Покращує якість записаних треків без участі користувача. Medium складність — потребує звукового аналізу PCM, але symphonia вже в стеку; нова логіка *тільки у Rust* без UI-змін.

**Залежності:** v1.1 не є передумовою; незалежно від збагачення тегів. Потребує доступу до decoded PCM буферу перед записом у файл.

---

### v1.3 — «Редактор тегів та файлів»
**Тема:** Повне управління збереженими файлами без виходу з Tapir.

**Фічі:**

| Фіча | Опис | Складність |
|---|---|---|
| **Tag editor dialog** | Модальне вікно для одного файлу: title, artist, album, year, genre, track number, manual album art upload (browse+drag). Повна ARIA-доступність. | Low-Medium |
| **Batch tag editing** | Вибрати кілька файлів у Songs Manager → EditTags → змінити спільні поля (album, artist, year, genre). Не змінює unset fields ("%keep%"). | Medium |
| **Rename file** | Inline-перейменування файлу з рядку Songs Manager (як у streamWriter). Санітизація + collision-handling (вже є в `sanitize.rs`). | Low |
| **Import external files** | FileOpenDialog → додати MP3/AAC/OGG/FLAC файли до Songs Manager (не копіює, лише реєструє). | Low |
| **Re-fetch metadata** | Кнопка «Оновити теги» для вже збережених файлів (повторний запит до Last.fm/MB з v1.1). | Low |

**Обґрунтування:** Для незрячих користувачів редагування тегів через Explorer + MediaInfo + Mp3tag є дуже болісним (три застосунки зі слабкою accessibility). Tapir може замінити весь post-processing workflow в одному доступному вікні. Lofty вже підтримує read/write тегів → низька складність. streamWriter має всі ці фічі.

**Залежності:** Природно будується на Songs Manager з Фази 4 (0.1.0).

---

### v1.4 — «Розширена accessibility: verbosity та інструменти»
**Тема:** Стати еталоном accessibility для desktop radio software.

**Фічі:**

| Фіча | Опис | Складність |
|---|---|---|
| **Sleep timer** | Автоматична зупинка відтворення/запису через X хвилин. UI: quick-select (15/30/60/90/120 хв) + custom. Tray menu item. Оголошення через aria-live за 1 хв до зупинки. | Low |
| **Verbosity рівні** | Settings: Minimal (лише критичні помилки) / Normal (track changes, start/stop) / Verbose (+ metadata details, bitrate changes, reconnect). Окрема вкладка у Settings. | Low |
| **Custom announcement templates** | Шаблон рядка оголошення для зміни треку: наприклад `"Грає: {artist} — {title} на {station}"`. `{artist}`, `{title}`, `{station}`, `{bitrate}`, `{format}`. | Low |
| **NVDA add-on розповсюдження** | `.nvda-addon` файл (ZIP): глобальні жести, enhanced gestures для Tapir. Для встановлення: Tools > Install NVDA Add-on або ручне встановлення. | Low |
| **JAWS scripts розповсюдження** | `.jss` + `.jkm` + `.jsm` script package. Документація встановлення. | Low |
| **Keyboard shortcuts customization** | У Settings: перепризначення до ~10 глобальних і внутрішньовіконних гарячих клавіш. | Medium |
| **Stream notes/description field** | Текстове поле нотатки для кожного потоку (наприклад, URL playlist, формат, нотатки). Доступне через ARIA description. | Low |

**Обґрунтування:** Sleep timer є у Screamer Radio і просто запитується незрячими (засинають під музику). NVDA/JAWS scripts — унікальна конкурентна перевага, якої не має жоден конкурент. Verbosity settings дають незрячим контроль над "шумом" від screen reader. Загальна складність LOW для більшості фіч.

**Залежності:** Незалежний від v1.1–v1.3. Може розроблятись паралельно.

---

### v1.5 — «Додаткові аудіоформати»  
**Тема:** Підтримати радіостанції, що стрімлять у FLAC, Ogg Vorbis, Opus.

**Фічі:**

| Фіча | Опис | Складність |
|---|---|---|
| **FLAC stream recording** | Запис FLAC-потоків (ICY over HTTP з Content-Type `audio/flac`). Збереження як `.flac` з Vorbis Comment тегами через lofty. | Medium |
| **Ogg Vorbis stream recording** | Запис OGG-потоків. Збереження як `.ogg`. Vorbis Comment теги. | Medium |
| **Opus stream recording** | Запис OPUS/OGG потоків. Format detection + збереження. | Medium |
| **Playback підтримка нових форматів** | Розширити Player для відтворення `.flac`, `.ogg` файлів (symphonia вже підтримує з Excellent рейтингом). | Low |
| **Format indicator у Stream статусі** | Відображення реального формату: MP3/AAC/FLAC/OGG/OPUS (після auto-detection). | Low |

**Обґрунтування:** Symphonia має Excellent рейтинг для FLAC і Vorbis — нні нових бібліотек. Screamer підтримує ці формати. Багато публічних радіостанцій Великої Британії, Нідерландів, Швеції стрімлять у FLAC/OGG. Збільшує аудиторію без архітектурних змін.

**Залежності:** Потребує розширення `stream::format.rs` detector та `stream::recorder.rs` для нових контейнерів. Залежить від стабільного 0.1.0 recording pipeline.

---

### v2.0 — «HLS потоки»
**Тема:** Підтримка сучасного streaming протоколу HLS для великих радіостанцій.

**Фічі:**

| Фіча | Опис | Складність |
|---|---|---|
| **HLS playlist парсер** | HTTP-завантаження та парсинг `.m3u8` (master + media playlists). Вибір audio-only rendition (без відео). Обробка `EXT-X-VERSION`, `EXT-X-TARGETDURATION`, `EXT-X-MEDIA-SEQUENCE`. | High |
| **Segment downloader** | Послідовне завантаження TS/AAC сегментів. Ring buffer для плавного відтворення. Retry логіка для помилок сегментів. | High |
| **Continuous recording з HLS** | Stitch сегментів у безперервний файл / трек-файли. Обробка ICY-like metadata в HLS (ID3 in TS, `#EXT-X-PROGRAM-DATE-TIME`). | High |
| **Reconnect для HLS** | Auto-refresh playlist якщо поточний URL застарів. Exponential backoff. | Medium |
| **HLS format detection** | Автовизначення `.m3u8` URL (за Content-Type або розширенням) → автоматичний вибір HLS engine. | Low |

**Обґрунтування:** HLS є de-facto стандартом для BBC, RTÉ, Суспільного мовлення, багатьох комерційних станцій. streamWriter НЕ підтримує HLS, Screamer підтримує. Це значна MVP-розширення аудиторії. Складність High — потребує нового engine у `stream::` модулі. Відкладено до v2.0 через архітектурну складність.

**Залежності:** Потребує нового модуля `stream::hls` паралельно до існуючого `stream::connection` (ICY). Не впливає на поточний ICY pipeline.

---

### v2.1 — «Подкасти»
**Тема:** Розширити Tapir на управління подкастами поруч з радіо.

**Фічі:**

| Фіча | Опис | Складність |
|---|---|---|
| **RSS/Atom podcast subscription** | Додавання подкасту за URL RSS-каналу. Auto-refresh. Збереження списку каналів в профілі. | Medium |
| **Auto-download нових епізодів** | Налаштовуваний: завантажувати останній N епізодів, або всі, або нові. Фонове завантаження. | Medium |
| **Episode player** | Відтворення з Position Memory (запам'ятовує позицію між сесіями). Перемотка по 30 сек (стандарт для podcasts). | Medium |
| **OPML import/export** | Стандартний формат для перенесення підписок між додатками. | Low |
| **Podcast browser** | Базовий пошук за URL або через gpodder.net / podcastindex.org API. | Medium |
| **Повна accessibility** | Відтворення + управління підписками повністю з клавіатури та screen reader. | Low (вже є патерни) |

**Обґрунтування:** Audials має подкасти. Незрячі активно слухають подкасти. Tapir вже має Player-інфраструктуру. Природне розширення без зміни core recording логіки. Medium-High складність через новий UI-розділ та управління пам'яттю позиції.

**Залежності:** Потребує Player infrastructure (0.1.0 Фаза 2). Незалежний від HLS (v2.0).

---

## Порівняння ключових конкурентів

| Фіча | streamWriter | Audials | Screamer | **Tapir 0.1.0** | **v1.1** | **v1.2** | **v1.3** | **v1.4** | **v1.5** | **v2.0** | **v2.1** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Запис ICY (MP3/AAC) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Wishlist автозапис | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| NVDA/JAWS accessibility | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Album art auto | ❌ | ✅ | ❌ | ❌ | **✅** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lyrics auto | ❌ | ✅ | ❌ | ❌ | **✅** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Last.fm scrobbling | ❌ | ❌ | ❌ | ❌ | **✅** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Silence detection | ✅ | ✅ | ❌ | ❌ | ❌ | **✅** | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tag editor in-app | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | **✅** | ✅ | ✅ | ✅ | ✅ |
| Sleep timer | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | **✅** | ✅ | ✅ | ✅ |
| NVDA add-on / JAWS scripts | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** | ✅ | ✅ | ✅ |
| Verbosity settings | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** | ✅ | ✅ | ✅ |
| FLAC/OGG/Opus stream | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** | ✅ | ✅ |
| HLS потоки | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** | ✅ |
| Podcast manager | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅** |

---

## Рекомендації та висновки

### Загальна стратегія

1. **Захистити нішу доступності** — вона унікальна і незайнята. v1.4 має бути High-priority, навіть якщо здається простим. Перший публічний NVDA add-on для radio recorder — це маркетинг плюс реальна цінність.

2. **Якість метаданих — першочергово** — album art і lyrics є в Audials (комерційний) і більше ніде у free-конкурентів. v1.1 дасть потужну конкурентну перевагу без використання складних технологій.

3. **Не копіювати все підряд від streamWriter** — waveform editor (ручна нарізка) та SoX-integration є складними і використовуються меншістю. Silence detection (v1.2) та tag editor (v1.3) — достатньо.

4. **HLS — стратегічна необхідність, але не спішити** — відкласти до v2.0, коли v1.x стабільний. Неправильна реалізація HLS може зламати існуючий ICY pipeline.

5. **Podcast — послідовний крок** — якщо v2.0 HLS стабільний, v2.1 podcasts закриває ще один великий ринок для незрячих без конкурента.

### Рекомендований порядок релізів

```
0.1.0 (4 фази, у розробці)
  └── v1.1  Метадані (album art, lyrics, Last.fm, MusicBrainz)   [~3 місяці]
       └── v1.2  Silence detection                                [~2 місяці]
            └── v1.3  Tag editor + file management                [~2 місяці]
                 └── v1.4  Accessibility (sleep timer, verbosity, NVDA/JAWS scripts) [~2 місяці]
                      └── v1.5  Нові формати (FLAC, OGG, Opus streams) [~3 місяці]
                           └── v2.0  HLS streams                  [~5 місяців]
                                └── v2.1  Podcasts                [~4 місяці]
```

**v1.2 та v1.4 можна розробляти паралельно** — вони незалежні.  
**v1.3 природно виростає з v1.1** (re-fetch metadata кнопка).

---

## Відхилені ідеї

| Ідея | Причина відхилення |
|---|---|
| **Cloud sync / backup записів** | Scope creep. Portable single-user tool. Вимагає серверну інфраструктуру та обробку приватних медіа-файлів. Порушує принцип portable EXE. |
| **Мобільний companion app** | Окрема платформа, окрема кодова база, інший UX. Audials пропонує це за підписку. Виходить за scope Windows-only portable tool. |
| **AI music enhancer (якість звуку)** | Комерційна/пропрієтарна технологія (ML pipeline). Повністю за scope open-source portable tool. Audials реалізував як платну фічу. |
| **Запис з Spotify/Deezer** | Захищений контент (DRM). Юридично сумнівна зона. Audials це робить на власний ризик. Не відповідає цільовій аудиторії та позиціонуванню. |
| **Вбудований waveform editor (manual cut)** | Дуже складна реалізація (~розмір окремого застосунку). У незрячих обмежена користь від waveform. Silence detection (v1.2) вирішує 80% проблеми автоматично. |
| **SoX вбудована інтеграція** | SoX доступний як зовнішній executable (post-processing вже є в 0.1.0). Пряма інтеграція — великий scope. Нише-аудиторія навіть серед power users. |
| **Community server (global wishlist via shared streams)** | Потребує власну серверну інфраструктуру (як у streamWriter). Таємниця: streamWriter power-feature перетворилась на тягар підтримки і пов'язана з privacy питаннями. |
| **Запис відео / відео стрімів** | Повністю інший product scope (Audials, OBS). Жодного зв'язку з цільовим use-case незрячих. |
| **Windows Store публікація** | Порушує portable philosophy (Store sandboxing несумісний з даними-поруч-з-EXE). Явно excluded в PRD. |
| **Автоматичне оновлення** | Явно excluded в PRD. Portable mode = user replaces EXE manually. |
| **Вбудований браузер для відкриття станцій** | Radio Browser API (0.1.0) достатній. Embedded browser = додатковий WebView2 instance, security surface. |
| **MPEG-DASH support** | Технічно складніший за HLS, мало таких радіостанцій в Україні/Європі. Відкласти до v3.x якщо попит буде підтверджено. |
| **Format conversion (MP3→FLAC конвертор)** | Lossy→lossless conversion не покращує якість. Корисна лише для стандартизації. FFmpeg post-processing (0.1.0) вже дозволяє це через зовнішній preprocessor. |
| **Shared public playlists server** | Вимагає сервер + модерацію + privacy policy. streamWriter це має, але це source of maintenance burden. |
| **Phonetic keyboard navigation (JAWS-like commands)** | Це відповідальність NVDA/JAWS скриптів (розповсюдження в v1.4), не core app logic. |

---

## Невизначеності та обмеження

| Питання | Рівень | Пояснення |
|---|---|---|
| **Symphonia HE-AAC (AAC+) підтримка** | ❓ невизначено | Позначена як "-" (not started) в symphonia roadmap. Часто використовується станціями з 96 kbps. Може знадобитись зовнішній decoder або очікування symphonia. |
| **Opus-in-HTTP без OGG container** | ❓ невизначено | Деякі станції стрімлять Opus без Ogg container. Symphonia підтримує лише Opus через OGG. Нестандартні потоки можуть не працювати. |
| **Last.fm API стабільність** | ⚠️ ймовірно | Last.fm belongs to CBS Interactive; API існує ≥15 років без breaking changes, але підтримка варіює. Fallback: scrobble-тільки mode. |
| **lrclib.net availability** | ⚠️ ймовірно | Відносно новий безкоштовний сервіс. Може змінити умови. Треба fallback-логіка (timeout→skip). |
| **MusicBrainz rate limit (1 req/sec)** | ✅ підтверджено | Строго 1 req/sec. Необхідна queue-логіка для batch enrichment в v1.1. |
| **HLS stream metadata** | ❓ невизначено | Стандарт HLS не гарантує ICY-like track metadata. Деякі станції використовують ID3 tags у TS segments, інші — нічого. Якість track splitting може погіршитись для HLS. |
| **RadioMaximus поточний стан** | ❓ невизначено | Сайт недоступний у квітні 2026. Продукт може бути defunct. Аналіз обмежений загальними описами та AlternativeTo. |
| **NVDA add-on API стабільність** | ⚠️ ймовірно | NVDA оновлюється регулярно. Потрібне тестування на кількох версіях. Рекомендується тримати add-on мінімальним. |
| **Copyright/regional restrictions** | ❓ невизначено | Записування радіо може мати юридичні обмеження у деяких країнах (аналогічно до streamWriter). Tapir не повинен блокувати запис але може додати disclaimer. |

---

## Джерела

- [streamWriter.org — офіційний сайт](https://streamwriter.org/en/) — features, wiki, forum (270+ suggestions threads); аналіз станом на 2026-04
- [streamWriter wiki: Main Window](https://streamwriter.org/en/wiki/artikel/mainwindow) — детальний аналіз UI модулів; Cut editor, Saved Songs функціонал
- [streamWriter wiki: Settings for auto recordings](https://streamwriter.org/en/wiki/artikel/settings_for_automatic_recordings) — silence detection, postprocessing, format conversion
- [streamWriter wiki: Technical Details](https://streamwriter.org/en/wiki/artikel/details) — алгоритм silence detection (confirmed ✅)
- [streamWriter forum — Suggestions (278 threads)](https://streamwriter.org/en/forum/thema/2) — user feature requests 2020–2026
- [Audials One — Radio page](https://audials.com/en/one/radio) — features: album art, lyrics, mass recording, recently played, tag editor (2026)
- [AlternativeTo — Audials Radio](https://alternativeto.net/software/audials-radio/about/) — feature listing: Podcast Manager, Automatic lyrics, Album art
- [Screamer Radio — офіційний сайт](https://www.screamer-radio.com/) — formats: HLS, FLAC, Ogg Vorbis, Opus, WMA; sleep timer (2024)
- [GitHub ScreamerRadio/Home Issues](https://github.com/ScreamerRadio/Home/issues) — user requests: station health, new features, auto-resume
- [Symphonia — GitHub](https://github.com/pdeljanov/Symphonia) — format support: FLAC Excellent, Vorbis Excellent, Opus "-"; HE-AAC "-" (confirmed ✅)
- [MusicBrainz API Documentation](https://musicbrainz.org/doc/MusicBrainz_API) — безкоштовний, 1 req/sec, JSON, Rust crate `musicbrainz_rs` (confirmed ✅)
- [Last.fm API Introduction](https://www.last.fm/api/intro) — scrobbling API; безкоштовний для некомерційного use (confirmed ✅)
- [AlternativeTo — streamWriter alternatives](https://alternativeto.net/software/streamwriter/) — конкурентний ландшафт, альтернативи, ринок
- [Tapir PRD](docs/PRD.md) — базові вимоги, accessibility, out-of-scope items
- [Tapir tech-stack.md](docs/tech-stack.md) — стек, бібліотеки, symphonia версія
- [Tapir implementation-phases.md](docs/implementation-phases.md) — що включено у 0.1.0
