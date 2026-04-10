# Тестові інтернет-радіопотоки для Tapir

> **Призначення:** набір реальних, публічно доступних потоків для тестування ICY/SHOUTcast клієнта — розробки і відлагодження Tapir.
> **Актуальність даних:** перевірено через Radio Browser API (lastcheckok: 1, станом на 2026-01-15) та офіційні джерела.

---

## Зведена таблиця потоків

| # | Назва | Пряме URL потоку | Формат | Бітрейт | Сервер | ICY-мета | HTTPS | Edge Case |
|---|-------|-----------------|--------|---------|--------|---------|-------|-----------|
| 1 | SomaFM Groove Salad | `https://ice5.somafm.com/groovesalad-128-mp3` | MP3 | 128 kbps | Icecast | ✅ | ✅ | Icecast + HTTPS |
| 2 | SomaFM Drone Zone | `https://ice4.somafm.com/dronezone-128-mp3` | MP3 | 128 kbps | Icecast | ✅ | ✅ | Icecast MP3 128 |
| 3 | SomaFM Left Coast 70s | `https://ice5.somafm.com/seventies-320-mp3` | MP3 | 320 kbps | Icecast | ✅ | ✅ | **320 kbps** |
| 4 | SomaFM Underground 80s | `https://ice6.somafm.com/u80s-128-mp3` | MP3 | 128 kbps | Icecast | ✅ | ✅ | резерв MP3 |
| 5 | SomaFM Indie Pop Rocks! | `https://ice6.somafm.com/indiepop-128-aac` | AAC | 128 kbps | Icecast | ✅ | ✅ | **AAC 128 kbps** |
| 6 | SomaFM Space Station Soma | `https://ice5.somafm.com/spacestation-128-aac` | AAC | 128 kbps | Icecast | ✅ | ✅ | AAC резерв |
| 7 | SomaFM Groove Salad 32k | (через PLS/M3U нижче) | AAC+ | 32 kbps | Icecast | ✅ | ✅ | **Малий бітрейт** |
| 8 | Radio Paradise Main Mix | `http://stream.radioparadise.com/mp-192` | MP3 | 192 kbps | Custom | ✅ | ✅ | MP3 192 |
| 9 | Radio Paradise Main (AAC) | `http://stream.radioparadise.com/aac-320` | AAC | 320 kbps | Custom | ✅ | ✅ | **AAC 320 kbps** |
| 10 | Radio Paradise Mellow Mix | `http://stream.radioparadise.com/mellow-128` | AAC | 128 kbps | Custom | ✅ | ✅ | резерв AAC |
| 11 | BassDrive | `http://ice.bassdrive.net/stream` | MP3 | 128 kbps | Icecast | ✅ | ✅ | drum & bass |
| 12 | BassDrive AAC 32k | `http://ice.bassdrive.net/stream32` | AAC+ | 32 kbps | Icecast | ✅ | ❌ | **малий бітрейт AAC** |
| 13 | BassDrive HTTPS | `https://ice.bassdrive.net/stream` | MP3 | 128 kbps | Icecast | ✅ | ✅ | **HTTPS Icecast** |
| 14 | FIP Radio (France) | `http://icecast.radiofrance.fr/fip-hifi.aac` | AAC | 192 kbps | Icecast | ✅ | ❌ | AAC Icecast FR |
| 15 | Classic Vinyl HD | `https://icecast.walmradio.com:8443/classic` | MP3 | 320 kbps | Icecast | ✅ | ✅ | HTTPS нестандартний порт |
| 16 | Deutschlandfunk 128k | `https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3` | MP3 | 128 kbps | Icecast | ✅ | ✅ | HTTPS державне мовлення |
| 17 | 101 Smooth Jazz | `http://jking.cdnstream1.com/b22139_128mp3` | MP3 | 128 kbps | SHOUTcast CDN | ⚠️ | ❌ | **SHOUTcast ICY** |
| 18 | JamendoLounge | `http://streamingp.shoutcast.com/JamendoLounge` | MP3 | 128 kbps | SHOUTcast v2 | ✅ | ❌ | **SHOUTcast v2** |
| 19 | BBC World Service | `http://stream.live.vc.bbcmedia.co.uk/bbc_world_service` | MP3 | 128 kbps | BBC CDN | ⚠️ ні | ❌ | **Без ICY-метаданих** |

**Рівні впевненості ICY-метаданих:**
- ✅ підтверджено — Icecast-сервер з відомим `icy-metaint` заголовком
- ⚠️ ймовірно / непряме свідчення
- ⚠️ ні — відомо, що метадані не надсилаються або відсутні

---

## PLS-плейлисти

SomaFM надає PLS у стандартному форматі WinAmp. URL pattern:
`https://somafm.com/<станція>.pls` (128k MP3) або `<станція><битрейт>.pls`

```
# MP3 128k
https://somafm.com/groovesalad.pls
https://somafm.com/dronezone.pls
https://somafm.com/secretagent.pls
https://somafm.com/indiepop.pls

# MP3 320k
https://somafm.com/spacestation320.pls
https://somafm.com/seventies320.pls
https://somafm.com/bootliquor320.pls

# MP3 256k
https://somafm.com/groovesalad256.pls

# AAC 128k
https://somafm.com/groovesalad130.pls
https://somafm.com/indiepop130.pls
https://somafm.com/spacestation130.pls

# AAC 32k — малий бітрейт
https://somafm.com/groovesalad32.pls
https://somafm.com/dronezone32.pls
```

---

## M3U-плейлисти

SomaFM — Winamp M3U формат (`https://somafm.com/m3u/<станція>.m3u`):

```
# MP3 128k
https://somafm.com/m3u/groovesalad.m3u
https://somafm.com/m3u/dronezone.m3u

# MP3 320k
https://somafm.com/m3u/spacestation320.m3u
https://somafm.com/m3u/seventies320.m3u

# AAC 128k  
https://somafm.com/m3u/groovesalad130.m3u
https://somafm.com/m3u/spacestation130.m3u

# AAC 32k — малий бітрейт
https://somafm.com/m3u/groovesalad32.m3u
```

BassDrive M3U:
```
http://bassdrive.com/bassdrive.m3u        → http://ice.bassdrive.net/stream (MP3 128k)
http://bassdrive.com/bassdrive3.m3u       → http://ice.bassdrive.net/stream32 (AAC+ 32k)
http://bassdrive.com/streams/bassdrive6.m3u → http://ice.bassdrive.net/stream56 (AAC+ 56k)
```

Інші M3U:
```
http://www.101smoothjazz.com/101-smoothjazz.m3u → http://jking.cdnstream1.com/b22139_128mp3
```

---

## Детальний опис за категоріями

### Категорія A: Icecast — стандартний HTTP

Icecast відповідає `HTTP/1.1 200 OK` і надсилає заголовок `icy-metaint` (зазвичай 16000 bytes). Найстабільніші та найкраще документовані потоки.

#### SomaFM (✅ підтверджено)

SomaFM — некомерційне інтернет-радіо з Сан-Франциско. Усі потоки через власні Icecast-сервери `ice1–ice8.somafm.com`, з підтримкою HTTPS.

| Назва | Пряме URL | Формат | Bps |
|-------|-----------|--------|-----|
| Groove Salad | `https://ice5.somafm.com/groovesalad-128-mp3` | MP3 | 128 |
| Drone Zone | `https://ice4.somafm.com/dronezone-128-mp3` | MP3 | 128 |
| Underground 80s | `https://ice6.somafm.com/u80s-128-mp3` | MP3 | 128 |
| Secret Agent | `https://ice6.somafm.com/secretagent-128-mp3` | MP3 | 128 |
| Left Coast 70s 320k | `https://ice5.somafm.com/seventies-320-mp3` | MP3 | 320 |
| Heavyweight Reggae 256k | `https://ice6.somafm.com/reggae-256-mp3` | MP3 | 256 |
| Indie Pop Rocks! | `https://ice6.somafm.com/indiepop-128-aac` | AAC | 128 |
| Space Station Soma | `https://ice5.somafm.com/spacestation-128-aac` | AAC | 128 |

> **Примітка:** Конкретний номер ice-сервера може змінюватись (балансування навантаження). Для виробничих тестів використовуй PLS/M3U-посилання, які завжди вказують на актуальний сервер.

**Типові заголовки відповіді SomaFM:**
```
HTTP/1.1 200 OK
Content-Type: audio/mpeg
icy-br: 128
icy-metaint: 16000
icy-name: SomaFM: Groove Salad
icy-pub: 1
Server: Icecast 2.4.0
```

#### BassDrive (✅ підтверджено)

Drum & bass інтернет-радіо, Icecast-сервер `ice.bassdrive.net`.

```
http://ice.bassdrive.net/stream      → MP3 128k, HTTP
https://ice.bassdrive.net/stream     → MP3 128k, HTTPS
http://ice.bassdrive.net/stream32    → AAC+ 32k, HTTP
http://ice.bassdrive.net/stream56    → AAC+ 56k, HTTP
```

#### FIP Radio (✅ підтверджено)

Французьке публічне радіо, сервер `icecast.radiofrance.fr`.

```
http://icecast.radiofrance.fr/fip-hifi.aac    → AAC 192k
```

**Типові заголовки:**
```
HTTP/1.1 200 OK
Content-Type: audio/aac
icy-metaint: 16000
icy-name: FIP
Server: Icecast
```

#### Classic Vinyl HD (✅ підтверджено)

HTTPS Icecast на нестандартному порту 8443.

```
https://icecast.walmradio.com:8443/classic    → MP3 320k
```

#### Deutschlandfunk (✅ підтверджено)

Публічне радіо Німеччини, HTTPS SSL streaming.

```
https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3?aggregator=web    → MP3 128k
```

---

### Категорія B: Radio Paradise (Custom streaming)

Radio Paradise використовує власну інфраструктуру стримінгу (не стандартний Icecast). Потоки підтримують ICY-метадані (`StreamTitle` = назва треку).

**Базовий URL:** `http://stream.radioparadise.com/` і `https://stream.radioparadise.com/`

| Канал | URL | Формат | Bps |
|-------|-----|--------|-----|
| Main Mix AAC 320k | `http://stream.radioparadise.com/aac-320` | AAC | 320 |
| Main Mix AAC 128k | `http://stream.radioparadise.com/aac-128` | AAC | 128 |
| Main Mix MP3 192k | `http://stream.radioparadise.com/mp-192` | MP3 | 192 |
| Mellow Mix AAC 128k | `http://stream.radioparadise.com/mellow-128` | AAC | 128 |
| Rock Mix AAC 128k | `http://stream.radioparadise.com/rock-128` | AAC | 128 |
| Global Mix AAC 128k | `http://stream.radioparadise.com/global-128` | AAC | 128 |

HTTPS варіанти: заміни `http://` на `https://` — усі URL підтримуються.

> **Альтернативний EU-сервер:** `http://stream-uk1.radioparadise.com/aac-320`

---

### Категорія C: SHOUTcast

#### Різниця між SHOUTcast v1 і v2

| Характеристика | SHOUTcast v1 | SHOUTcast v2 | Icecast |
|---------------|-------------|-------------|---------|
| Перший рядок відповіді | `ICY 200 OK` | `HTTP/1.1 200 OK` | `HTTP/1.1 200 OK` |
| ICY headers | ✅ | ✅ | ✅ (сумісність) |
| `icy-metaint` | ✅ | ✅ | ✅ |
| Стандарт HTTP | ❌ не валідний | ✅ | ✅ |
| Статус у 2026 | Застарілий, рідкісний | Активний | Активний |

**⚠️ Важливо:** SHOUTcast v1 (`ICY 200 OK`) стрімко зникає — більшість CDN і хостингів мігрували на v2 або Icecast. Найкращий спосіб перевірити — підключитись вручну (дивись розділ "Ручна перевірка").

#### JamendoLounge via SHOUTcast v2 (✅ підтверджено)

Офіційний SHOUTcast-сервер Nullsoft/Radionomy:

```
http://streamingp.shoutcast.com/JamendoLounge    → MP3, SHOUTcast v2 (HTTP/1.1)
```

**Типові заголовки:**
```
HTTP/1.1 200 OK
Content-Type: audio/mpeg
icy-metaint: 8192
icy-name: JamendoLounge
Server: ShoutCast v2
```

#### 101 Smooth Jazz via CDNStream (⚠️ ймовірно SHOUTcast)

CDNStream1 (`cdnstream1.com`) — відомий SHOUTcast-хостинг-провайдер, що може відповідати `ICY 200 OK`:

```
http://jking.cdnstream1.com/b22139_128mp3        → MP3 128k (потенційно ICY v1)
# M3U вхідна точка:
http://www.101smoothjazz.com/101-smoothjazz.m3u
```

> **Рівень впевненості ⚠️:** CDNStream1 відомий як SHOUTcast hosting. Відповідь `ICY 200 OK` vs `HTTP/1.1` без прямого підключення не підтверджена. Потребує перевірки curl (дивись нижче).

---

### Категорія D: Потоки без ICY-метаданих

#### BBC World Service (⚠️ ймовірно без метаданих)

BBC використовує власну CDN-інфраструктуру (`bbcmedia.co.uk`). На відміну від Icecast/SHOUTcast, BBC зазвичай **не надсилає** `icy-metaint` у відповіді.

```
http://stream.live.vc.bbcmedia.co.uk/bbc_world_service    → MP3 ~128k
```

**Очікувана відповідь (без ICY-метаданих):**
```
HTTP/1.1 200 OK
Content-Type: audio/mpeg
Transfer-Encoding: chunked
# Відсутній заголовок icy-metaint!
```

> **Рівень впевненості ⚠️:** BBC неодноразово змінювала інфраструктуру. Якщо `icy-metaint` раптом з'явиться — використовуй потік як стандартний Icecast.

---

## Пошук потоків через Radio Browser API

Radio Browser — відкрита база даних інтернет-радіостанцій. API безкоштовний, без ключа.

**Базовий URL:** `https://de2.api.radio-browser.info/json/`

### Приклади curl-запитів

```bash
# 1. Пошук MP3-потоків з бітрейтом 320 kbps (топ за популярністю)
curl -s "https://de2.api.radio-browser.info/json/stations/search?\
codec=MP3&\
bitrate=320&\
limit=10&\
hidebroken=true&\
order=clickcount&\
reverse=true" | python3 -m json.tool

# 2. Пошук AAC-потоків
curl -s "https://de2.api.radio-browser.info/json/stations/search?\
codec=AAC&\
limit=10&\
hidebroken=true&\
order=votes&\
reverse=true" | python3 -m json.tool

# 3. Пошук SomaFM-станцій
curl -s "https://de2.api.radio-browser.info/json/stations/search?\
name=soma&\
limit=20&\
hidebroken=true&\
order=clickcount&\
reverse=true" | python3 -m json.tool

# 4. Пошук за тегом + тільки HTTPS
curl -s "https://de2.api.radio-browser.info/json/stations/search?\
tag=jazz&\
has_ssl=true&\
hidebroken=true&\
limit=10&\
order=votes&\
reverse=true" | python3 -m json.tool

# 5. Отримати url_resolved (пряме URL потоку) зі станції за UUID
curl -s "https://de2.api.radio-browser.info/json/stations/byid/960cf833-0601-11e8-ae97-52543be04c81"

# 6. Топ-5 станцій з найбільшою кількістю слухачів (clickcount за останні 24 год)
curl -s "https://de2.api.radio-browser.info/json/stations/topclick/5"
```

**Ключові поля відповіді:**

| Поле | Опис |
|------|------|
| `url` | URL потоку або плейлиста (PLS/M3U) |
| `url_resolved` | Реальне пряме URL потоку після резолвінгу (збережено з останньої перевірки) |
| `codec` | `MP3`, `AAC`, `AAC+`, `OGG` |
| `bitrate` | Бітрейт в kbps |
| `lastcheckok` | `1` = потік живий, `0` = недоступний |
| `lastchecktime` | Дата останньої перевірки |
| `hls` | `1` = HLS-потік, `0` = прямий ICY/HTTP |

---

## Ручна перевірка потоку

### 1. Базова перевірка заголовків (HEAD або GET)

```bash
# Перевірка заголовків без завантаження тіла
curl -v --head "https://ice5.somafm.com/groovesalad-128-mp3" 2>&1 | head -40

# Або: GET з обмеженням на 1 секунду
curl -v -m 2 "https://ice5.somafm.com/groovesalad-128-mp3" > /dev/null 2>&1
```

**Що перевірити у відповіді:**
- Перший рядок: `HTTP/1.1 200 OK` (Icecast/SHOUTcast v2) або `ICY 200 OK` (SHOUTcast v1)
- `Content-Type`: `audio/mpeg` (MP3) або `audio/aac` (AAC)
- `icy-metaint`: розмір блоку ICY-метаданих у байтах (зазвичай 8192 або 16000)
- `icy-name`: назва станції
- `Server`: `Icecast 2.x.x` або `ShoutCast v2` або відсутній

### 2. Запит з увімкненими ICY-метаданими

Надсилаємо заголовок `Icy-MetaData: 1` — сервер увімкне вбудовані ICY-метадані у потік:

```bash
# Запит з ICY-MetaData: 1 header
curl -v \
  -H "Icy-MetaData: 1" \
  -H "User-Agent: WinampMPEG/5.09" \
  -m 5 \
  "https://ice5.somafm.com/groovesalad-128-mp3" \
  -o /dev/null 2>&1 | grep -E "^[<>]|icy|content-type|server|HTTP"
```

**Очікуваний вивід для Icecast:**
```
> GET /groovesalad-128-mp3 HTTP/1.1
> Icy-MetaData: 1
< HTTP/1.1 200 OK
< Content-Type: audio/mpeg
< icy-metaint: 16000
< icy-br: 128
< icy-name: SomaFM: Groove Salad
< Server: Icecast 2.4.0
```

**Очікуваний вивід для SHOUTcast v1 (ICY):**
```
< ICY 200 OK
< icy-notice1: ...
< icy-notice2: SHOUTcast DNAS...
< icy-name: Station Name
< icy-metaint: 8192
< Content-Type: audio/mpeg
```
> **Зверни увагу:** `curl` не завжди коректно парсить `ICY 200 OK` (не валідний HTTP). Для надійної перевірки SHOUTcast v1 потрібно відкрити сирий TCP-сокет або використовувати HTTP/1.0 режим:

```bash
# Спроба через HTTP/1.0 (не блокується ICY 200 OK)
curl -v --http1.0 \
  -H "Icy-MetaData: 1" \
  -m 5 \
  "http://jking.cdnstream1.com/b22139_128mp3" \
  -o /dev/null 2>&1
```

### 3. Перевірка PLS-файлу

```bash
# Завантажити і переглянути PLS
curl -s "https://somafm.com/groovesalad.pls"
```

Очікуваний формат PLS:
```ini
[playlist]
numberofentries=5
File1=http://ice6.somafm.com/groovesalad-128-mp3
Title1=SomaFM: Groove Salad (#2 128k mp3)
Length1=-1
...
Version=2
```

### 4. Перевірка M3U-файлу

```bash
# Завантажити і переглянути M3U
curl -s "https://somafm.com/m3u/groovesalad.m3u"
```

Очікуваний формат M3U:
```
#EXTM3U
#EXTINF:-1,SomaFM: Groove Salad
http://ice6.somafm.com/groovesalad-128-mp3
...
```

### 5. Читання ICY-метаданих з потоку (Python)

```python
import socket, struct

def read_icy_metadata(host, port, path, n_blocks=3):
    """Підключається до ICY-потоку і зчитує перший блок метаданих."""
    s = socket.socket()
    s.connect((host, port))
    s.sendall(
        f"GET {path} HTTP/1.0\r\n"
        f"Host: {host}\r\n"
        f"Icy-MetaData: 1\r\n"
        f"User-Agent: TestClient/1.0\r\n"
        f"\r\n".encode()
    )

    # Читаємо заголовки
    headers = b""
    while b"\r\n\r\n" not in headers:
        headers += s.recv(1)

    # Парсимо icy-metaint
    metaint = 0
    for line in headers.decode(errors="replace").split("\r\n"):
        if line.lower().startswith("icy-metaint:"):
            metaint = int(line.split(":")[1].strip())
            break

    print(f"Headers:\n{headers.decode(errors='replace')}")
    print(f"icy-metaint = {metaint}")

    if metaint == 0:
        print("Потік без ICY-метаданих!")
        return

    def recv_exact(sock, n):
        """Читає рівно n байт із сокету, або кидає EOFError."""
        buf = bytearray()
        while len(buf) < n:
            chunk = sock.recv(n - len(buf))
            if not chunk:
                raise EOFError("Connection closed")
            buf.extend(chunk)
        return bytes(buf)

    # Читаємо блоки: metaint байт аудіо + 1 байт довжина + до 255*16 байт метадані
    for _ in range(n_blocks):
        audio = recv_exact(s, metaint)
        meta_len_byte = s.recv(1)
        if not meta_len_byte:
            break
        meta_len = struct.unpack("B", meta_len_byte)[0] * 16
        if meta_len > 0:
            meta = recv_exact(s, meta_len)
            print(f"Metadata: {meta.rstrip(b'\x00').decode(errors='replace')}")

    s.close()

# Приклад — SomaFM Groove Salad (через HTTP, без TLS)
# read_icy_metadata("ice5.somafm.com", 80, "/groovesalad-128-mp3")

# Для HTTPS використовуй ssl.wrap_socket або urllib3
```

---

## Матриця тест-кейсів (edge cases)

| Тест-кейс | Потік | Що перевіряємо |
|-----------|-------|----------------|
| **ICY v1 (ICY 200 OK)** | `http://jking.cdnstream1.com/b22139_128mp3` | Парсинг не-HTTP рядка `ICY 200 OK` |
| **SHOUTcast v2 (HTTP/1.1)** | `http://streamingp.shoutcast.com/JamendoLounge` | Стандартний HTTP + ICY заголовки |
| **Icecast MP3 128k** | `https://ice5.somafm.com/groovesalad-128-mp3` | Базовий Icecast потік |
| **Icecast AAC 128k** | `https://ice6.somafm.com/indiepop-128-aac` | Розпізнавання AAC |
| **MP3 320 kbps** | `https://ice5.somafm.com/seventies-320-mp3` | Пропускна здатність |
| **AAC 32 kbps** | `http://ice.bassdrive.net/stream32` | Малий icy-metaint |
| **Без ICY-метаданих** | `http://stream.live.vc.bbcmedia.co.uk/bbc_world_service` | Обробка відсутнього `icy-metaint` |
| **PLS-плейлист** | `https://somafm.com/groovesalad.pls` | Парсинг `.pls` → отримання URL |
| **M3U-плейлист** | `https://somafm.com/m3u/groovesalad.m3u` | Парсинг `.m3u` → отримання URL |
| **M3U via HTTP redirect** | `http://bassdrive.com/bassdrive.m3u` | HTTP редирект + M3U парсинг |
| **HTTPS Icecast** | `https://ice5.somafm.com/groovesalad-128-mp3` | TLS з'єднання + ICY |
| **HTTPS нестандартний порт** | `https://icecast.walmradio.com:8443/classic` | TLS :8443 |
| **Великий icy-metaint** | `https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3` | icy-metaint > 16000 |

---

## Невизначеності та обмеження

1. **SHOUTcast v1 (ICY 200 OK):** Підтвердити без прямого підключення неможливо. `jking.cdnstream1.com` — найкращий кандидат, але не гарантований. SHOUTcast v1 у 2026 зустрічається рідко — рекомендуємо тестувати на реальному обладнанні.

2. **BBC World Service ICY-метадані:** BBC неодноразово змінювала інфраструктуру. Поточний статус може відрізнятись від описаного. Перевіряй актуальні заголовки.

3. **SomaFM ice-сервер:** Radio Browser API зафіксував конкретні номери серверів (`ice4`, `ice5`, `ice6`) на момент перевірки (2026-01). При балансуванні навантаження номер може змінитись — використовуй PLS/M3U як стабільний шлях.

4. **Radio Paradise сервер:** Нестандартна реалізація (не Icecast). Заголовки можуть відрізнятись від типових Icecast-відповідей.

5. **BassDrive HTTPS:** Підтверджений Radio Browser API (ssl_error: 0, lastcheckok: 1). TLS-сертифікат `ice.bassdrive.net` вважається дійсним.

---

## Джерела

- [somafm.com/listen](https://somafm.com/listen/) — офіційна сторінка потоків SomaFM
- [radioparadise.com/listen/stream-links](https://radioparadise.com/listen/stream-links) — офіційні URL Radio Paradise
- [de2.api.radio-browser.info](https://de2.api.radio-browser.info/json/stations/search?name=soma&limit=10&hidebroken=true&order=clickcount&reverse=true) — Radio Browser API, верифікований Jan 2026
- [bassdrive.com](http://bassdrive.com/) — офіційний сайт BassDrive (HTTP 429 під час дослідження, дані від Radio Browser)
- [wiki.xiph.org/Icecast_Server](https://wiki.xiph.org/Icecast_Server) — документація Icecast (Xiph.org)
