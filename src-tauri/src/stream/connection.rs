use crate::errors::RadioError;
use icy_metadata::error::MetadataParseError;
use icy_metadata::{IcyHeaders, IcyMetadata, IcyMetadataReader, RequestIcyMetadata};
use reqwest::Client;
use log::info;

#[derive(Debug, Clone)]
pub struct TrackMetadata {
    pub artist: String,
    pub title: String,
}

pub struct IcyConnection {
    pub headers: IcyHeaders,
    pub content_type: Option<String>,
    /// Перші байти ефіру, вже зняті з `response`. Другий доказ для
    /// `format::detect` (ADR 2026-08-31 §1) — заголовок у радіо ненадійний за
    /// побудовою, а частина станцій не шле його зовсім.
    ///
    /// Читач мусить віддати ці байти першими, інакше початок ефіру пропаде;
    /// `probe` їх просто розглядає й викидає разом із тілом.
    pub prefix: bytes::Bytes,
    /// Тіло, з якого качається ефір. Читає його лише [`pump_air`]: так
    /// `prefix` гарантовано йде першим, а `metaint` береться з тих самих
    /// заголовків.
    response: reqwest::Response,
}

/// Скільки чекати на перший шматок тіла. Окремо від `connect_timeout`: там
/// вимірюється встановлення з'єднання, тут — чи пішов ефір.
const FIRST_CHUNK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

pub async fn connect(url: &str) -> Result<IcyConnection, RadioError> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()?;

    let response = client
        .get(url)
        .request_icy_metadata()
        .header("User-Agent", "Tapir/0.1.0")
        .send()
        .await?
        .error_for_status()?;

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let headers = IcyHeaders::parse_from_headers(response.headers());

    info!(
        "Connected to {} — name: {:?}, bitrate: {:?}, content-type: {:?}, metaint: {:?}",
        url,
        headers.name(),
        headers.bitrate(),
        content_type,
        headers.metadata_interval(),
    );

    // Знімаємо перший шматок тут, а не в читачі: обидва викликачі `detect`
    // мусять бачити ті самі байти, і probe серед них — він тіла не читає
    // взагалі.
    let mut response = response;
    let prefix = match tokio::time::timeout(FIRST_CHUNK_TIMEOUT, response.chunk()).await {
        Ok(Ok(Some(b))) if !b.is_empty() => b,
        Ok(Err(e)) => return Err(e.into()),
        // Тіло скінчилось одразу або станція мовчить: ефір не пішов. Це **не**
        // вердикт про формат — доказів немає взагалі, а порожній префікс
        // видав би «невпізнаний» і застряг би міткою в профілі. Це той самий
        // випадок, що й обрив: спроба витрачена, перепідключення планується
        // (ADR 2026-08-13, CONTEXT.md §«Перепідключення і спроба»).
        _ => {
            return Err(RadioError::Other(format!(
                "Stream sent no audio within {}s",
                FIRST_CHUNK_TIMEOUT.as_secs(),
            )))
        }
    };

    Ok(IcyConnection {
        headers,
        content_type,
        prefix,
        response,
    })
}

// ---------------------------------------------------------------------------
// Читач ефіру: одна ICY-розмітка на весь застосунок
// ---------------------------------------------------------------------------

/// Те, що читач знімає з ефіру, у тому порядку, у якому воно там лежало.
pub enum AirEvent {
    /// Байти самого звуку, без розмітки.
    Audio(Vec<u8>),
    /// Назва треку — рівно між байтами попереднього й наступного.
    Track(TrackMetadata),
    /// Ефір скінчився.
    Eof,
    /// Обрив.
    Error(String),
}

/// Скільки звуку читач набирає за один захід — нижня межа: буфер ніколи не
/// менший за `metaint`.
const AIR_BUFFER: usize = 8192;

/// Стеля `metaint`, вище якої ефір не читаємо. Живі станції оголошують
/// 8-32 КБ; більше - або зламаний заголовок, або спроба змусити нас виділити
/// пам'ять під його розмір.
const MAX_METAINT: usize = 1 << 20;

/// Ефір без ICY-розмітки: `read` віддає саме аудіо.
type IcyAudioReader = IcyMetadataReader<AirReader>;

/// Шматки тіла відповіді. Помилка вже переведена в `io`, щоб читач не залежав
/// від того, хто саме качає ефір.
type AirChunks = futures_util::stream::BoxStream<'static, std::io::Result<bytes::Bytes>>;

/// Лічильник знятих із тіла байтів і позначки, де серед них лягли назви
/// треків.
///
/// Крейт кличе callback **із середини** `read`, тобто буфер на той момент
/// уже містить і хвіст попереднього треку, і початок наступного. Без цих
/// позначок назва їхала б до слухача на цілий буфер раніше за свій звук, а
/// рекордер відрізав би файл не там, де станція оголосила трек.
#[derive(Clone, Default)]
struct AirTap {
    delivered: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    marks: std::sync::Arc<std::sync::Mutex<Vec<(usize, TrackMetadata)>>>,
}

impl AirTap {
    fn delivered(&self) -> usize {
        self.delivered.load(std::sync::atomic::Ordering::Relaxed)
    }

    fn mark(&self, track: TrackMetadata) {
        let at = self.delivered();
        if let Ok(mut marks) = self.marks.lock() {
            marks.push((at, track));
        }
    }

    fn take_marks(&self) -> Vec<(usize, TrackMetadata)> {
        match self.marks.lock() {
            Ok(mut marks) => std::mem::take(&mut *marks),
            Err(_) => Vec::new(),
        }
    }
}

/// Синхронний фасад над тілом відповіді: плеєр і рекордер читають ефір
/// усередині `spawn_blocking`, а `IcyMetadataReader` хоче `std::io::Read`.
struct AirReader {
    stream: AirChunks,
    buf: bytes::Bytes,
    rt: tokio::runtime::Handle,
    /// Скільки байтів тіла вже віддано — разом із розміткою.
    delivered: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    /// Обрив уже стався: більше потік не опитуємо.
    ended: bool,
    /// Помилка, що застала буфер напівнабраним. Байти віддаються першими,
    /// помилка — наступним читанням, інакше обрив прикинувся б чистим кінцем
    /// ефіру й UI не показав би причини.
    pending_error: Option<std::io::Error>,
}

impl AirReader {
    fn new(prefix: bytes::Bytes, stream: AirChunks, rt: tokio::runtime::Handle, tap: &AirTap) -> Self {
        Self {
            stream,
            buf: prefix,
            rt,
            delivered: tap.delivered.clone(),
            ended: false,
            pending_error: None,
        }
    }

    fn next_chunk(&mut self) -> Option<std::io::Result<bytes::Bytes>> {
        self.rt.block_on(async {
            use futures_util::StreamExt;
            self.stream.next().await
        })
    }
}

impl std::io::Read for AirReader {
    /// Добиває `out` до кінця, а не віддає один шматок мережі.
    ///
    /// Це не оптимізація, а умова коректності: `IcyMetadataReader` вважає, що
    /// прочитане дорівнює замовленому, і після короткого читання шукав би
    /// байт довжини метаданих посеред аудіо — далі поїхав би весь потік.
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        if let Some(e) = self.pending_error.take() {
            return Err(e);
        }
        let mut filled = 0;
        while filled < out.len() {
            if self.buf.is_empty() {
                if self.ended {
                    break;
                }
                match self.next_chunk() {
                    // Кінець ефіру. Те, що вже набрали, віддаємо; нуль
                    // наступним читанням прочитається як EOF.
                    None => {
                        self.ended = true;
                        break;
                    }
                    Some(Err(e)) => {
                        self.ended = true;
                        if filled == 0 {
                            return Err(e);
                        }
                        self.pending_error = Some(e);
                        break;
                    }
                    // Порожній шматок читався як кінець ефіру й до крейта —
                    // поведінка збережена.
                    Some(Ok(chunk)) if chunk.is_empty() => {
                        self.ended = true;
                        break;
                    }
                    Some(Ok(chunk)) => self.buf = chunk,
                }
            }
            let n = (out.len() - filled).min(self.buf.len());
            out[filled..filled + n].copy_from_slice(&self.buf[..n]);
            self.buf = self.buf.slice(n..);
            filled += n;
        }
        self.delivered
            .fetch_add(filled, std::sync::atomic::Ordering::Relaxed);
        Ok(filled)
    }
}

impl IcyConnection {
    /// Збирає читач ефіру: `prefix` іде першим, metaint береться з заголовків.
    fn into_reader(self, rt: tokio::runtime::Handle, tap: AirTap) -> IcyAudioReader {
        use futures_util::TryStreamExt;

        let metaint = self.headers.metadata_interval();
        let chunks = self.response.bytes_stream().map_err(std::io::Error::other);
        let inner = AirReader::new(self.prefix, Box::pin(chunks), rt, &tap);
        IcyMetadataReader::new(inner, metaint, move |parsed| {
            if let Some(track) = track_from_metadata(parsed) {
                tap.mark(track);
            }
        })
    }
}

/// Качає ефір у `sink`, поки той приймає: `false` зупиняє читання.
///
/// Викликати треба з блокуючого потоку (`spawn_blocking`) — усередині
/// `block_on`. `rt` — хендл рантайму, з якого качається тіло.
pub fn pump_air<F>(conn: IcyConnection, rt: tokio::runtime::Handle, mut sink: F)
where
    F: FnMut(AirEvent) -> bool,
{
    let metaint = conn.headers.metadata_interval().map(|m| m.get());
    if let Some(metaint) = metaint.filter(|m| *m > MAX_METAINT) {
        sink(AirEvent::Error(format!(
            "Stream declared an unusable ICY metadata interval ({metaint} bytes)"
        )));
        return;
    }
    let tap = AirTap::default();
    let reader = conn.into_reader(rt, tap.clone());
    pump(reader, tap, buffer_len(metaint), sink)
}

/// Буфер мусить бути не меншим за `metaint`.
///
/// `IcyMetadataReader`, добираючи буфер після блоку розмітки, ріже його як
/// `buf[..next_metadata]`, а `next_metadata` доростає назад до `metaint`. Якщо
/// буфер менший, зріз виходить за межі й читач падає - на короткому читанні,
/// тобто рівно на кінці ефіру. Станція з `metaint: 16000` роняла б так кожен
/// обрив.
fn buffer_len(metaint: Option<usize>) -> usize {
    metaint.unwrap_or(AIR_BUFFER).max(AIR_BUFFER)
}

fn pump<F>(mut reader: IcyAudioReader, tap: AirTap, buf_len: usize, mut sink: F)
where
    F: FnMut(AirEvent) -> bool,
{
    use std::io::Read;

    let mut buf = vec![0u8; buf_len];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => {
                flush_marks(&tap, &mut sink);
                sink(AirEvent::Eof);
                return;
            }
            Ok(n) => {
                // Позначка каже, скільки байтів тіла було знято на момент
                // назви; усе, що знято після неї, крім самої розмітки, —
                // це звук уже нового треку. Різниця й дає межу в цьому
                // буфері.
                let end = tap.delivered();
                let mut cut = 0;
                for (at, track) in tap.take_marks() {
                    let boundary = n.saturating_sub(end.saturating_sub(at)).clamp(cut, n);
                    if boundary > cut && !sink(AirEvent::Audio(buf[cut..boundary].to_vec())) {
                        return;
                    }
                    if !sink(AirEvent::Track(track)) {
                        return;
                    }
                    cut = boundary;
                }
                if cut < n && !sink(AirEvent::Audio(buf[cut..n].to_vec())) {
                    return;
                }
            }
            Err(e) => {
                flush_marks(&tap, &mut sink);
                sink(AirEvent::Error(e.to_string()));
                return;
            }
        }
    }
}

/// Назва, що встигла прийти перед обривом, усе одно належить слухачеві.
fn flush_marks<F>(tap: &AirTap, sink: &mut F)
where
    F: FnMut(AirEvent) -> bool,
{
    for (_, track) in tap.take_marks() {
        if !sink(AirEvent::Track(track)) {
            return;
        }
    }
}

// ---------------------------------------------------------------------------
// Розбір StreamTitle
// ---------------------------------------------------------------------------

/// Вердикт крейта про блок метаданих → трек.
fn track_from_metadata(parsed: Result<IcyMetadata, MetadataParseError>) -> Option<TrackMetadata> {
    match parsed {
        Ok(metadata) => {
            log::debug!("[ICY] metadata: {:?}", metadata.stream_title());
            split_stream_title(metadata.stream_title()?)
        }
        // Паритет із поведінкою до крейта: невалідний UTF-8 не викидаємо, а
        // декодуємо lossy — станція з побитим кодуванням далі називає треки,
        // хай і з «?» замість окремих літер. NFC тут свідомо немає: реального
        // потоку, який би її вимагав, ми не бачили.
        Err(MetadataParseError::InvalidUtf8(e)) => parse_metadata_block(&e.into_bytes()),
        Err(MetadataParseError::Empty(_)) => None,
    }
}

/// Розбирає сирий блок ICY-метаданих. Єдиний шлях від байтів ефіру до треку —
/// той самий, яким іде крейт, тільки з lossy-декодуванням замість відмови.
fn parse_metadata_block(bytes: &[u8]) -> Option<TrackMetadata> {
    let text = String::from_utf8_lossy(bytes);
    let text = text.trim_end_matches('\0');
    let metadata: IcyMetadata = text.parse().ok()?;
    split_stream_title(metadata.stream_title()?)
}

/// Ріже `StreamTitle` на виконавця й назву по першому ` - `.
///
/// Роздільника немає — усе йде в назву, виконавець порожній: у `StreamTitle`
/// станції кладуть і чисті назви передач, і рядки без формату «виконавець —
/// трек».
fn split_stream_title(stream_title: &str) -> Option<TrackMetadata> {
    let stream_title = stream_title.trim();
    if stream_title.is_empty() {
        return None;
    }
    match stream_title.find(" - ") {
        Some(pos) => Some(TrackMetadata {
            artist: stream_title[..pos].trim().to_string(),
            title: stream_title[pos + 3..].trim().to_string(),
        }),
        None => Some(TrackMetadata {
            artist: String::new(),
            title: stream_title.to_string(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::num::NonZeroUsize;

    #[test]
    fn apostrophe_in_title_survives() {
        let m = parse_metadata_block("StreamTitle='Fleetwood Mac - Don't Stop';StreamUrl='';".as_bytes())
            .expect("track");
        assert_eq!(m.artist, "Fleetwood Mac");
        assert_eq!(m.title, "Don't Stop");
    }

    #[test]
    fn artist_and_title_split_on_first_dash() {
        let m = parse_metadata_block("StreamTitle='Artist - Title - Live';".as_bytes()).expect("track");
        assert_eq!(m.artist, "Artist");
        assert_eq!(m.title, "Title - Live");
    }

    #[test]
    fn empty_stream_title_is_no_track() {
        assert!(parse_metadata_block("StreamTitle='';StreamUrl='';".as_bytes()).is_none());
        assert!(parse_metadata_block("StreamTitle='   ';".as_bytes()).is_none());
    }

    #[test]
    fn title_without_separator_has_no_artist() {
        let m = parse_metadata_block("StreamTitle='Ранкове шоу';".as_bytes()).expect("track");
        assert_eq!(m.artist, "");
        assert_eq!(m.title, "Ранкове шоу");
    }

    #[test]
    fn null_padding_is_trimmed() {
        let mut bytes = "StreamTitle='Пікардійська Терція - Старий Рояль';".as_bytes().to_vec();
        bytes.resize(bytes.len() + 11, 0);
        let m = parse_metadata_block(&bytes).expect("track");
        assert_eq!(m.artist, "Пікардійська Терція");
        assert_eq!(m.title, "Старий Рояль");
    }

    #[test]
    fn invalid_utf8_decodes_lossy() {
        let mut bytes = b"StreamTitle='Caf".to_vec();
        bytes.push(0xE9); // latin-1 'é', не валідний UTF-8
        bytes.extend_from_slice(b" - Tea';");
        let m = parse_metadata_block(&bytes).expect("track");
        assert_eq!(m.artist, "Caf\u{fffd}");
        assert_eq!(m.title, "Tea");
    }

    #[test]
    fn junk_block_is_no_track() {
        assert!(parse_metadata_block("no valid values here".as_bytes()).is_none());
    }

    // -----------------------------------------------------------------------
    // Читач: аудіо доходить ціле, розмітка знімається, назва стоїть на межі
    // -----------------------------------------------------------------------

    /// Ефір із розміткою: `metaint` байтів аудіо, байт довжини, блок, і знову.
    fn icy_air(audio: &[u8], metaint: usize, metas: &[&str]) -> Vec<u8> {
        let mut air = Vec::new();
        let mut meta_iter = metas.iter();
        for part in audio.chunks(metaint) {
            air.extend_from_slice(part);
            // Розмітка йде після кожного повного відрізка metaint.
            if part.len() < metaint {
                break;
            }
            match meta_iter.next() {
                Some(meta) => {
                    let mut padded = meta.as_bytes().to_vec();
                    let blocks = padded.len().div_ceil(16);
                    padded.resize(blocks * 16, 0);
                    air.push(blocks as u8);
                    air.extend_from_slice(&padded);
                }
                // Порожній блок: станція мовчить про трек.
                None => air.push(0),
            }
        }
        air
    }

    fn chunked(air: Vec<u8>, chunk_size: usize) -> AirChunks {
        let chunks: Vec<std::io::Result<bytes::Bytes>> = air
            .chunks(chunk_size)
            .map(|c| Ok(bytes::Bytes::copy_from_slice(c)))
            .collect();
        Box::pin(futures_util::stream::iter(chunks))
    }

    /// Проганяє ефір через той самий насос, яким користуються плеєр і
    /// рекордер, і збирає події.
    fn pump_chunks(air: Vec<u8>, chunk_size: usize, metaint: Option<usize>) -> Vec<AirEvent> {
        let tap = AirTap::default();
        let inner = AirReader::new(
            bytes::Bytes::new(),
            chunked(air, chunk_size),
            tokio::runtime::Handle::current(),
            &tap,
        );
        let reader = IcyMetadataReader::new(inner, metaint.and_then(NonZeroUsize::new), {
            let tap = tap.clone();
            move |parsed| {
                if let Some(track) = track_from_metadata(parsed) {
                    tap.mark(track);
                }
            }
        });

        let mut events = Vec::new();
        pump(reader, tap, buffer_len(metaint), |event| {
            let more = !matches!(event, AirEvent::Eof | AirEvent::Error(_));
            events.push(event);
            more
        });
        events
    }

    fn audio_of(events: &[AirEvent]) -> Vec<u8> {
        events
            .iter()
            .filter_map(|e| match e {
                AirEvent::Audio(data) => Some(data.clone()),
                _ => None,
            })
            .flatten()
            .collect()
    }

    fn tracks_of(events: &[AirEvent]) -> Vec<&TrackMetadata> {
        events
            .iter()
            .filter_map(|e| match e {
                AirEvent::Track(t) => Some(t),
                _ => None,
            })
            .collect()
    }

    /// Скільки байтів звуку пройшло до кожної назви.
    fn boundaries_of(events: &[AirEvent]) -> Vec<usize> {
        let mut seen = 0;
        let mut at = Vec::new();
        for event in events {
            match event {
                AirEvent::Audio(data) => seen += data.len(),
                AirEvent::Track(_) => at.push(seen),
                _ => {}
            }
        }
        at
    }

    /// Мережа приходить шматками, які не збігаються з `metaint`. Читач мусить
    /// віддати аудіо байт у байт і не сплутати розмітку з ним.
    #[tokio::test]
    async fn short_chunks_do_not_desync_the_reader() {
        let audio: Vec<u8> = (0..30_000u32).map(|i| (i % 251) as u8).collect();
        let metaint = 4096;
        let air = icy_air(
            &audio,
            metaint,
            &[
                "StreamTitle='Fleetwood Mac - Don't Stop';",
                "StreamTitle='Океан Ельзи - Обійми';",
            ],
        );

        // 1000 байтів — шматок, який не ділиться на metaint і рветься посеред
        // блоку розмітки.
        let events = tokio::task::spawn_blocking(move || pump_chunks(air, 1000, Some(metaint)))
            .await
            .unwrap();

        assert_eq!(
            audio_of(&events),
            audio,
            "аудіо мусить дійти без розмітки й без втрат"
        );
        let tracks = tracks_of(&events);
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0].artist, "Fleetwood Mac");
        assert_eq!(tracks[0].title, "Don't Stop");
        assert_eq!(tracks[1].artist, "Океан Ельзи");
        assert_eq!(tracks[1].title, "Обійми");
    }

    /// Той самий ефір, але шматки більші за буфер читача.
    #[tokio::test]
    async fn large_chunks_do_not_desync_the_reader() {
        let audio: Vec<u8> = (0..40_000u32).map(|i| (i % 253) as u8).collect();
        let metaint = 8192;
        let air = icy_air(&audio, metaint, &["StreamTitle='Один - Трек';"]);

        let events = tokio::task::spawn_blocking(move || pump_chunks(air, 16384, Some(metaint)))
            .await
            .unwrap();

        assert_eq!(audio_of(&events), audio);
        assert_eq!(tracks_of(&events).len(), 1);
        assert_eq!(tracks_of(&events)[0].title, "Трек");
    }

    /// Назва стоїть рівно на межі свого треку, а не на межі буфера читача.
    /// Крейт віддає хвіст старого треку й початок нового одним читанням, і без
    /// поправки на позначку рекордер різав би файл на пів секунди раніше.
    #[tokio::test]
    async fn a_track_name_lands_exactly_on_its_boundary() {
        let audio: Vec<u8> = (0..60_000u32).map(|i| (i % 241) as u8).collect();
        // 20000 не кратне буферу читача (8192) — межа треку припадає на
        // середину читання.
        let metaint = 20_000;
        let air = icy_air(
            &audio,
            metaint,
            &[
                "StreamTitle='Перший - Трек';",
                "StreamTitle='Другий - Трек';",
            ],
        );

        let events = tokio::task::spawn_blocking(move || pump_chunks(air, 1500, Some(metaint)))
            .await
            .unwrap();

        assert_eq!(audio_of(&events), audio);
        assert_eq!(boundaries_of(&events), vec![20_000, 40_000]);
    }

    /// Обрив посеред відрізка на станції з `metaint` більшим за базовий буфер
    /// — форма, у якій закінчується майже кожен реальний запис. Читач мусить
    /// віддати хвіст і спокійно дійти до `Eof`.
    #[tokio::test]
    async fn a_stream_cut_mid_segment_ends_cleanly() {
        let audio: Vec<u8> = (0..40_000u32).map(|i| (i % 247) as u8).collect();
        // 16000 — типове значення живих станцій, більше за AIR_BUFFER.
        let metaint = 16_000;
        let air = icy_air(
            &audio,
            metaint,
            &["StreamTitle='Станція - Пісня';", "StreamTitle='Станція - Інша';"],
        );

        let events = tokio::task::spawn_blocking(move || pump_chunks(air, 3000, Some(metaint)))
            .await
            .unwrap();

        assert_eq!(audio_of(&events), audio);
        assert_eq!(boundaries_of(&events), vec![16_000, 32_000]);
        assert!(matches!(events.last(), Some(AirEvent::Eof)));
    }
    /// Порожній блок розмітки (станція мовчить про трек) назви не породжує й
    /// межі не зсуває.
    #[tokio::test]
    async fn empty_metadata_blocks_change_nothing() {
        let audio: Vec<u8> = (0..30_000u32).map(|i| (i % 239) as u8).collect();
        let metaint = 6000;
        // Друга позиція лишається порожнім блоком.
        let air = icy_air(&audio, metaint, &["StreamTitle='Соло - Трек';"]);

        let events = tokio::task::spawn_blocking(move || pump_chunks(air, 4096, Some(metaint)))
            .await
            .unwrap();

        assert_eq!(audio_of(&events), audio);
        assert_eq!(boundaries_of(&events), vec![6000]);
    }

    /// Без metaint розмітки в ефірі немає — читач мусить бути прозорим.
    #[tokio::test]
    async fn without_metaint_everything_is_audio() {
        let audio: Vec<u8> = (0..9000u32).map(|i| (i % 199) as u8).collect();
        let expected = audio.clone();

        let events = tokio::task::spawn_blocking(move || pump_chunks(audio, 700, None))
            .await
            .unwrap();

        assert_eq!(audio_of(&events), expected);
        assert!(tracks_of(&events).is_empty());
        assert!(matches!(events.last(), Some(AirEvent::Eof)));
    }

    /// Обрив посеред набирання буфера: байти доходять, а потім приходить саме
    /// помилка, не чистий кінець ефіру — інакше рекордер списав би обрив на
    /// нормальне завершення і не показав би причини.
    #[tokio::test]
    async fn error_after_partial_fill_survives_as_an_error() {
        let (first, second) = tokio::task::spawn_blocking(|| {
            let chunks: Vec<std::io::Result<bytes::Bytes>> = vec![
                Ok(bytes::Bytes::from_static(b"partial")),
                Err(std::io::Error::other("обрив")),
            ];
            let mut reader = AirReader::new(
                bytes::Bytes::new(),
                Box::pin(futures_util::stream::iter(chunks)),
                tokio::runtime::Handle::current(),
                &AirTap::default(),
            );
            let mut buf = [0u8; 64];
            let first = reader.read(&mut buf).map(|n| buf[..n].to_vec());
            let second = reader.read(&mut buf);
            (first, second)
        })
        .await
        .unwrap();

        assert_eq!(first.expect("байти"), b"partial");
        assert!(second.is_err(), "обрив мусить дійти помилкою, а не EOF");
    }

    /// Обрив доходить до споживача подією `Error`, не `Eof`.
    #[tokio::test]
    async fn a_broken_stream_ends_with_an_error_event() {
        let events = tokio::task::spawn_blocking(|| {
            let chunks: Vec<std::io::Result<bytes::Bytes>> =
                vec![Err(std::io::Error::other("обрив"))];
            let tap = AirTap::default();
            let inner = AirReader::new(
                bytes::Bytes::new(),
                Box::pin(futures_util::stream::iter(chunks)),
                tokio::runtime::Handle::current(),
                &tap,
            );
            let reader = IcyMetadataReader::new(inner, None, |_| {});
            let mut events = Vec::new();
            pump(reader, tap, buffer_len(None), |event| {
                let more = !matches!(event, AirEvent::Eof | AirEvent::Error(_));
                events.push(event);
                more
            });
            events
        })
        .await
        .unwrap();

        assert!(matches!(events.as_slice(), [AirEvent::Error(_)]));
    }

    /// `prefix` зняв `connect` — читач мусить віддати його першим, інакше
    /// початок ефіру пропадає (ADR 2026-08-31).
    #[tokio::test]
    async fn prefix_comes_first() {
        let got = tokio::task::spawn_blocking(|| {
            let chunks: Vec<std::io::Result<bytes::Bytes>> =
                vec![Ok(bytes::Bytes::from_static(b"tail"))];
            let mut reader = AirReader::new(
                bytes::Bytes::from_static(b"head"),
                Box::pin(futures_util::stream::iter(chunks)),
                tokio::runtime::Handle::current(),
                &AirTap::default(),
            );
            let mut out = Vec::new();
            reader.read_to_end(&mut out).expect("read");
            out
        })
        .await
        .unwrap();

        assert_eq!(got, b"headtail");
    }
}
