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
    pub response: reqwest::Response,
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

/// Ефір без ICY-розмітки: `read` віддає саме аудіо, назви треків приходять у
/// callback, який отримав [`IcyConnection::into_reader`].
pub type IcyAudioReader = IcyMetadataReader<AirReader>;

/// Шматки тіла відповіді. Помилка вже переведена в `io`, щоб читач не залежав
/// від того, хто саме качає ефір.
type AirChunks = futures_util::stream::BoxStream<'static, std::io::Result<bytes::Bytes>>;

/// Синхронний фасад над тілом відповіді: плеєр і рекордер читають ефір
/// усередині `spawn_blocking`, а `IcyMetadataReader` хоче `std::io::Read`.
pub struct AirReader {
    stream: AirChunks,
    buf: bytes::Bytes,
    rt: tokio::runtime::Handle,
    /// Обрив уже стався: більше потік не опитуємо.
    ended: bool,
    /// Помилка, що застала буфер напівнабраним. Байти віддаються першими,
    /// помилка — наступним читанням, інакше обрив прикинувся б чистим кінцем
    /// ефіру й UI не показав би причини.
    pending_error: Option<std::io::Error>,
}

impl AirReader {
    fn new(prefix: bytes::Bytes, stream: AirChunks, rt: tokio::runtime::Handle) -> Self {
        Self {
            stream,
            buf: prefix,
            rt,
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
                    // Порожній шматок станція шле на прощання — далі ефіру
                    // немає.
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
        Ok(filled)
    }
}

impl IcyConnection {
    /// Збирає читач ефіру: `prefix` іде першим, metaint береться з заголовків,
    /// назви треків приходять у `on_track` з потоку читача.
    ///
    /// `rt` — хендл рантайму, з якого читач качає тіло; викликати треба з
    /// блокуючого потоку (`spawn_blocking`), інакше `block_on` усередині
    /// впаде.
    pub fn into_reader<F>(self, rt: tokio::runtime::Handle, on_track: F) -> IcyAudioReader
    where
        F: Fn(TrackMetadata) + Send + Sync + 'static,
    {
        use futures_util::TryStreamExt;

        let metaint = self.headers.metadata_interval();
        let chunks = self.response.bytes_stream().map_err(std::io::Error::other);
        let inner = AirReader::new(self.prefix, Box::pin(chunks), rt);
        IcyMetadataReader::new(inner, metaint, move |parsed| {
            if let Some(track) = track_from_metadata(parsed) {
                on_track(track);
            }
        })
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
    use std::sync::mpsc;

    fn block(meta: &str) -> Vec<u8> {
        meta.as_bytes().to_vec()
    }

    #[test]
    fn apostrophe_in_title_survives() {
        let m = parse_metadata_block(&block(
            "StreamTitle='Fleetwood Mac - Don't Stop';StreamUrl='';",
        ))
        .expect("track");
        assert_eq!(m.artist, "Fleetwood Mac");
        assert_eq!(m.title, "Don't Stop");
    }

    #[test]
    fn artist_and_title_split_on_first_dash() {
        let m = parse_metadata_block(&block("StreamTitle='Artist - Title - Live';")).expect("track");
        assert_eq!(m.artist, "Artist");
        assert_eq!(m.title, "Title - Live");
    }

    #[test]
    fn empty_stream_title_is_no_track() {
        assert!(parse_metadata_block(&block("StreamTitle='';StreamUrl='';")).is_none());
        assert!(parse_metadata_block(&block("StreamTitle='   ';")).is_none());
    }

    #[test]
    fn title_without_separator_has_no_artist() {
        let m = parse_metadata_block(&block("StreamTitle='Ранкове шоу';")).expect("track");
        assert_eq!(m.artist, "");
        assert_eq!(m.title, "Ранкове шоу");
    }

    #[test]
    fn null_padding_is_trimmed() {
        let mut bytes = block("StreamTitle='Пікардійська Терція - Старий Рояль';");
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
        assert!(parse_metadata_block(&block("no valid values here")).is_none());
    }

    // -----------------------------------------------------------------------
    // Читач: аудіо доходить ціле, розмітка знімається
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

    fn read_all(air: Vec<u8>, chunk_size: usize, metaint: usize) -> (Vec<u8>, Vec<TrackMetadata>) {
        let chunks: Vec<std::io::Result<bytes::Bytes>> = air
            .chunks(chunk_size)
            .map(|c| Ok(bytes::Bytes::copy_from_slice(c)))
            .collect();
        let (tx, rx) = mpsc::channel();
        let stream = Box::pin(futures_util::stream::iter(chunks));
        let rt = tokio::runtime::Handle::current();
        let inner = AirReader::new(bytes::Bytes::new(), stream, rt);
        let mut reader =
            IcyMetadataReader::new(inner, std::num::NonZeroUsize::new(metaint), move |parsed| {
                if let Some(track) = track_from_metadata(parsed) {
                    tx.send(track).ok();
                }
            });

        let mut audio = Vec::new();
        let mut buf = vec![0u8; 8192];
        loop {
            match reader.read(&mut buf).expect("read") {
                0 => break,
                n => audio.extend_from_slice(&buf[..n]),
            }
        }
        drop(reader);
        (audio, rx.into_iter().collect())
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
        let (got_audio, tracks) = tokio::task::spawn_blocking(move || read_all(air, 1000, metaint))
            .await
            .unwrap();

        assert_eq!(
            got_audio, audio,
            "аудіо мусить дійти без розмітки й без втрат"
        );
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

        let (got_audio, tracks) = tokio::task::spawn_blocking(move || read_all(air, 16384, metaint))
            .await
            .unwrap();

        assert_eq!(got_audio, audio);
        assert_eq!(tracks.len(), 1);
        assert_eq!(tracks[0].title, "Трек");
    }

    /// Без metaint розмітки в ефірі немає — читач мусить бути прозорим.
    #[tokio::test]
    async fn without_metaint_everything_is_audio() {
        let audio: Vec<u8> = (0..9000u32).map(|i| (i % 199) as u8).collect();
        let expected = audio.clone();
        let got_audio = tokio::task::spawn_blocking(move || {
            let chunks: Vec<std::io::Result<bytes::Bytes>> = audio
                .chunks(700)
                .map(|c| Ok(bytes::Bytes::copy_from_slice(c)))
                .collect();
            let stream = Box::pin(futures_util::stream::iter(chunks));
            let inner =
                AirReader::new(bytes::Bytes::new(), stream, tokio::runtime::Handle::current());
            let mut reader = IcyMetadataReader::new(inner, None, |_| unreachable!());
            let mut out = Vec::new();
            reader.read_to_end(&mut out).expect("read");
            out
        })
        .await
        .unwrap();

        assert_eq!(got_audio, expected);
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

    /// Помилка з порожнім буфером іде негайно.
    #[tokio::test]
    async fn error_on_empty_buffer_is_immediate() {
        let got = tokio::task::spawn_blocking(|| {
            let chunks: Vec<std::io::Result<bytes::Bytes>> =
                vec![Err(std::io::Error::other("обрив"))];
            let mut reader = AirReader::new(
                bytes::Bytes::new(),
                Box::pin(futures_util::stream::iter(chunks)),
                tokio::runtime::Handle::current(),
            );
            reader.read(&mut [0u8; 64]).is_err()
        })
        .await
        .unwrap();

        assert!(got);
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
