use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::errors::RadioError;
use crate::portable;
use crate::profile::{RecordingSettings, ReconnectConfig, StreamInfo};
use crate::stream::{connection, format, recorder, splitter};
use log::{info, warn, error, debug};
use crate::wishlist::match_log::{MatchInput, WishlistMatch};
use crate::wishlist::matcher;
use crate::wake_lock::WakeLock;

// ---------------------------------------------------------------------------
// Public data types
// ---------------------------------------------------------------------------

/// Спроба зі стелею — **одне** значення, а не два поля. Два незалежні
/// `Option` дозволяли б дроту сказати «спроба 5, стеля невідома», чого в
/// домені немає: обидва числа приходять із того самого знімка налаштувань, за
/// яким живе цикл `'reconnect`, — не з поточних налаштувань профілю
/// (reconnect-max-in-status). Варіант покласти пару в сам [`StreamState`]
/// відхилено, бо `state` перестав би бути рядком на дроті — ADR 2026-09-15
/// «Підключення — перше з'єднання запису».
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconnectProgress {
    pub attempt: u32,
    pub max: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamStatus {
    pub stream_id: String,
    pub state: StreamState,
    pub current_track: Option<TrackInfo>,
    pub recording_started_at: Option<String>,
    pub bytes_recorded: u64,
    pub tracks_recorded: u32,
    /// Непорожня лише в стані `Error` — причина, з якої задача здалась.
    pub error: Option<FailureReason>,
    /// Спроба зі стелею, поки потік перепідключається; `None` у решті станів.
    /// Інваріант «пара є тоді й лише тоді, коли стан `Reconnecting`» тримає
    /// [`apply_transition`] — єдине місце, яке цю пару пише.
    pub reconnect: Option<ReconnectProgress>,
    /// Стабільний id сесії запису (§3.3): присвоюється на старті, reconnect
    /// його НЕ змінює. Scheduler трекає власність записів саме по ньому —
    /// recording_started_at для цього непридатний (None у Connecting,
    /// перезаписується кожним реконектом).
    pub session_id: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StreamState {
    Idle,
    Connecting,
    Recording,
    Reconnecting,
    Error,
}

/// Кому належить живий рядок треку, коли менеджер знає про потік стан `state`
/// (`None` — не знає жодного: потік ніколи не писався).
///
/// Правило одного власника (беклог `tauri-ts-type-drift`, рішення 2): поки потік
/// **пишеться**, рядок треку і кваліфікатор «ігнорується» належать менеджеру, і
/// плеєр на ту саму межу треку мовчить. Обидва емітери читають ICY-метадані
/// кожен на своєму з'єднанні, тож без правила порядок двох подій задавала мережа
/// і кваліфікатор то з'являвся, то зникав.
///
/// Предикат дивиться рівно на [`StreamState::Recording`], а **не** на
/// «запис активний» (`recording_control::is_active`, куди входять ще
/// `Connecting` і `Reconnecting`): у цих двох станах менеджер ефіру не
/// спостерігає — свого з'єднання в нього ще (або вже) немає, — тож власник
/// рядка на цей час плеєр. З `is_active` рядок застигав би на весь час
/// перепідключення. Щойно менеджер (пере)з'єднався, він забирає рядок назад
/// на першому ж блоці метаданих (рішення 4).
pub fn player_owns_track_line(state: Option<StreamState>) -> bool {
    !matches!(state, Some(StreamState::Recording))
}

/// Чому запис здався. Закритий набір, а не сирий рядок через межу процесів
/// (ADR 2026-09-06 §5, за зразком `TransportFailureReason`): технічна деталь
/// лишається в лозі, а інтерфейс каже одне з двох мовою користувача. Третя
/// причина розширює перелік, а не відкриває його назад до вільного тексту.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FailureReason {
    /// Спроби вичерпано, або перепідключення вимкнене нулем.
    StationUnreachable,
    /// Диск відмовився приймати запис.
    DiskWriteFailed,
}

/// Результат запису, який їде в події `recording-status`, — **не** стан потоку.
/// Два словники навмисно різні (беклог `tauri-ts-type-drift`, рішення 8):
/// `stopped` — це результат («запис скінчився»), а стан, у якому потік після
/// цього лишається, — `Idle` («очікування»). Заводити `Stopped` у
/// [`StreamState`] означало б узаконити стан, якого менеджер не зберігає;
/// слати на дроті `idle` замість `stopped` — зробити «зупинено» з будь-якого
/// майбутнього шляху в `Idle`. Межу тримає один рядок відображення в `App.tsx`.
///
/// Лише `Serialize`: назад ця величина не приходить ніколи.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RecordingStatus {
    Connecting,
    Recording,
    Reconnecting,
    Stopped,
    Error,
}

/// Чим скінчилась задача запису. До 2026-09-06 цієї різниці не існувало: **всі**
/// виходи з `recording_task` слали `"stopped"`, тож потік, що вичерпав спроби,
/// був для інтерфейсу невідрізненний від зупиненого руками, а стан `error` не
/// доходив нікуди й ніколи.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TaskOutcome {
    /// Скасування користувачем, зупинка застосунку — і відмова записувати чужий
    /// кодек: станція справна, спроби не витрачені, уваги не потребує (§7).
    Stopped,
    Failed(FailureReason),
}

impl TaskOutcome {
    /// Результат запису для події `recording-status`. Пара до [`Self::state`]:
    /// той самий вихід із задачі названий двома словниками — результатом і
    /// станом, у якому потік після нього лишається.
    fn status(&self) -> RecordingStatus {
        match self {
            TaskOutcome::Stopped => RecordingStatus::Stopped,
            TaskOutcome::Failed(_) => RecordingStatus::Error,
        }
    }

    fn reason(&self) -> Option<FailureReason> {
        match self {
            TaskOutcome::Stopped => None,
            TaskOutcome::Failed(reason) => Some(*reason),
        }
    }

    /// Стан, у якому запис лишається в менеджері до прибирання.
    fn state(&self) -> StreamState {
        match self {
            TaskOutcome::Stopped => StreamState::Idle,
            TaskOutcome::Failed(_) => StreamState::Error,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackInfo {
    pub artist: String,
    pub title: String,
    pub started_at: String,
    /// Трек підпав під ігнор-лист і окремим файлом не збережеться. Носій цього
    /// факту — сам рядок потоку: подія рутинна (десятки за ніч), тож дістає
    /// позначку на місці, а не хронологію, і оголошення не має
    /// (ADR 2026-08-31 «Носії для подій станції» §3, §4).
    pub ignored: bool,
}

// ---------------------------------------------------------------------------
// IPC event payloads
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingStatusPayload {
    stream_id: String,
    /// Тіло переходу цілком: поле, додане в [`Emission`], доїжджає на дріт
    /// саме тим, що воно там є, — другого переліку тих самих полів, який можна
    /// забути дописати, тут немає.
    #[serde(flatten)]
    emission: Emission,
}

/// Тіло події `track-changed` — **одне на обидва емітери**. Плеєр
/// ([`crate::player::engine`]) шле цю саму структуру, а не свою: два тіла з
/// різним набором полів були живою вадою (tauri-ts-type-drift, рядок 1).
/// Поля `album` немає навмисно: метадані ефіру альбому не несуть, на дроті
/// воно завжди було `""`, і жоден споживач його не читав.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackChangedPayload {
    pub stream_id: String,
    pub artist: String,
    pub title: String,
    /// Дублює [`TrackInfo::ignored`]: живий рядок фронтенд збирає з цієї події,
    /// а не перечитує статуси, тож кваліфікатор мусить їхати обома шляхами.
    pub ignored: bool,
}

/// Відмова записувати ефір, який Tapir не вміє (ADR 2026-08-31 §3). Власна
/// подія: це не збій станції, стан потоку не стає `Error`, у відро «Потребує
/// уваги» він не потрапляє (ADR 2026-09-06 §7), і повторювати спробу нема сенсу.
/// `family` названа, коли сім'ю впізнано.
/// Готового рядка backend не віддає — його складе Paraglide.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamUnsupportedPayload {
    stream_id: String,
    family: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingStartedPayload {
    stream_id: String,
    file_name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordingCompletedPayload {
    stream_id: String,
    file_name: String,
    duration_ms: u64,
}

// ---------------------------------------------------------------------------
// Internal entry held per active stream
// ---------------------------------------------------------------------------

struct StreamEntry {
    #[allow(dead_code)] // used by get_all_stream_info scaffold
    info: StreamInfo,
    status: StreamStatus,
    cancel_token: CancellationToken,
    join_handle: JoinHandle<()>,
}

// ---------------------------------------------------------------------------
// StreamManager
// ---------------------------------------------------------------------------

pub struct StreamManager {
    app_handle: AppHandle,
    entries: HashMap<String, StreamEntry>,
    wake_lock: Arc<WakeLock>,
    /// Монотонний лічильник session_id (§3.3). Інстансний — Manager один на додаток.
    next_session_id: u64,
}

impl StreamManager {
    pub fn new(app_handle: AppHandle, wake_lock: Arc<WakeLock>) -> Self {
        Self {
            app_handle,
            entries: HashMap::new(),
            wake_lock,
            next_session_id: 0,
        }
    }

    /// Start recording a stream. Returns an error if the stream is already recording.
    pub fn start_recording(
        &mut self,
        stream_info: StreamInfo,
        recording_settings: RecordingSettings,
        manager_ref: Arc<RwLock<Self>>,
    ) -> Result<u64, RadioError> {
        let stream_id = stream_info.id.clone();

        if self.entries.contains_key(&stream_id) {
            return Err(RadioError::AlreadyRecording(stream_id));
        }

        self.next_session_id += 1;
        let session_id = self.next_session_id;

        let cancel_token = CancellationToken::new();

        let status = StreamStatus {
            stream_id: stream_id.clone(),
            state: StreamState::Idle,
            current_track: None,
            recording_started_at: None,
            bytes_recorded: 0,
            tracks_recorded: 0,
            error: None,
            reconnect: None,
            session_id,
        };

        info!("[{}] Starting recording task: {}", stream_id, stream_info.url);

        let join_handle = tokio::spawn(recording_task(
            stream_info.clone(),
            recording_settings,
            cancel_token.clone(),
            self.app_handle.clone(),
            manager_ref,
        ));

        self.entries.insert(
            stream_id,
            StreamEntry {
                info: stream_info,
                status,
                cancel_token,
                join_handle,
            },
        );

        Ok(session_id)
    }

    /// Cancel the recording for the given stream_id (best-effort).
    pub fn stop_recording(&mut self, stream_id: &str) -> Result<(), RadioError> {
        match self.entries.get(stream_id) {
            Some(entry) => {
                entry.cancel_token.cancel();
                Ok(())
            }
            None => Err(RadioError::NotRecording(stream_id.to_string())),
        }
    }

    /// Cancel all active recordings.
    pub fn stop_all(&mut self) {
        for entry in self.entries.values() {
            entry.cancel_token.cancel();
        }
    }

    /// Cancel all active recording tasks and return their JoinHandles.
    /// The caller must await (with timeout) these handles to ensure all tasks
    /// have finished before mutating AppState.
    pub fn stop_all_async(&mut self) -> Vec<tokio::task::JoinHandle<()>> {
        for entry in self.entries.values() {
            entry.cancel_token.cancel();
        }
        let handles = self.entries
            .drain()
            .map(|(_, entry)| entry.join_handle)
            .collect();
        // All entries drained — no active recordings remain.
        self.wake_lock.set_recording(false);
        handles
    }

    /// Start recording every stream not already active. Returns the number of
    /// streams newly started. Streams already present in `entries`
    /// (recording / connecting / reconnecting) are skipped; a per-stream start
    /// error is logged and does NOT abort the batch.
    pub fn start_all(
        &mut self,
        streams: Vec<StreamInfo>,
        settings: RecordingSettings,
        manager_ref: Arc<RwLock<Self>>,
    ) -> usize {
        let mut started = 0;
        for stream in streams {
            if self.entries.contains_key(&stream.id) {
                continue;
            }
            match self.start_recording(stream, settings.clone(), manager_ref.clone()) {
                Ok(_) => started += 1,
                Err(e) => warn!("start_all: failed to start stream: {}", e),
            }
        }
        started
    }

    pub fn get_status(&self, stream_id: &str) -> Option<StreamStatus> {
        self.entries.get(stream_id).map(|e| e.status.clone())
    }

    /// Лише стан, без клонування всього [`StreamStatus`]. Плеєр питає його на
    /// **кожен** блок ICY-метаданих (див. [`player_owns_track_line`]), тож
    /// чотири зайві `String` на трек тут були б платою ні за що.
    pub fn get_state(&self, stream_id: &str) -> Option<StreamState> {
        self.entries.get(stream_id).map(|e| e.status.state)
    }

    pub fn get_all_statuses(&self) -> Vec<StreamStatus> {
        self.entries.values().map(|e| e.status.clone()).collect()
    }

    /// Scaffold: will be exposed via IPC command for monitoring active recordings.
    #[allow(dead_code)]
    pub fn get_all_stream_info(&self) -> Vec<StreamInfo> {
        self.entries.values().map(|e| e.info.clone()).collect()
    }
}

// ---------------------------------------------------------------------------
// Helper emit functions (fire-and-forget)
// ---------------------------------------------------------------------------

fn emit_recording_status(app: &AppHandle, stream_id: &str, emission: Emission) {
    // Phase 3K: будь-який перехід стану запису — тригер живого снапшота.
    if let Some(state) = app.try_state::<crate::app_state::AppState>() {
        state.snapshot.notify.notify_one();
    }
    debug!("[{}] Emitting recording-status: {:?}", stream_id, emission.status);
    match app.emit(
        "recording-status",
        RecordingStatusPayload { stream_id: stream_id.to_string(), emission },
    ) {
        Ok(_) => debug!("[{}] Event emitted OK", stream_id),
        Err(e) => error!("[{}] Failed to emit event: {}", stream_id, e),
    }
    crate::tray::notify_state_changed(app);
}

fn emit_track_changed(app: &AppHandle, stream_id: &str, artist: &str, title: &str, ignored: bool) {
    app.emit(
        "track-changed",
        TrackChangedPayload {
            stream_id: stream_id.to_string(),
            artist: artist.to_string(),
            title: title.to_string(),
            ignored,
        },
    )
    .ok();

    crate::tray::notify::notify_track_change(app, stream_id, artist, title);

    // Tray menu refresh so "Зараз грає" reflects new track.
    crate::tray::notify_state_changed(app);
}

fn emit_stream_unsupported(app: &AppHandle, stream_id: &str, family: Option<String>) {
    app.emit(
        "stream-unsupported",
        StreamUnsupportedPayload { stream_id: stream_id.to_string(), family },
    )
    .ok();
}

fn emit_recording_started(app: &AppHandle, stream_id: &str, file_name: &str) {
    app.emit(
        "recording-started",
        RecordingStartedPayload {
            stream_id: stream_id.to_string(),
            file_name: file_name.to_string(),
        },
    )
    .ok();
}

fn emit_recording_completed(app: &AppHandle, stream_id: &str, file_name: &str, duration_ms: u64) {
    app.emit(
        "recording-completed",
        RecordingCompletedPayload {
            stream_id: stream_id.to_string(),
            file_name: file_name.to_string(),
            duration_ms,
        },
    )
    .ok();
}

/// Подія несе вже записаний рядок журналу цілком — фронтенд кладе його в
/// дзеркало як є, і живий рядок виходить точно таким, як після перечитування
/// команди. Окремої події «журнал змінився» тому й немає.
fn emit_wishlist_match(app: &AppHandle, entry: &WishlistMatch) {
    app.emit("wishlist-match", entry.clone()).ok();
}

// ---------------------------------------------------------------------------
// Status update helpers (never hold the lock across await)
// ---------------------------------------------------------------------------

fn is_active_state(s: &StreamState) -> bool {
    matches!(
        s,
        StreamState::Recording | StreamState::Connecting | StreamState::Reconnecting
    )
}

/// Перехід стану запису — єдине, що задача про себе оголошує. Заводиться як
/// **значення**, бо з нього виходять обидва канали: запис у статус потоку і
/// тіло події. Розійтись вони не можуть — а до цього були двома сусідніми
/// викликами, які несли різне, і саме так пара «спроба N з M» опинилась у
/// статусі й не опинилась у події (ADR 2026-09-15 §4).
#[derive(Debug, Clone, PartialEq, Eq)]
enum Transition {
    /// **Перше** з'єднання запису — і лише воно. Спроби всередині
    /// перепідключення сюди не повертаються: інакше рядок половину циклу каже
    /// «З'єднання…», а потік блимає у відрі «Потребує уваги», яке рахує
    /// `Reconnecting` і не рахує `Connecting`
    /// (ADR 2026-09-15 «Підключення — перше з'єднання запису»).
    Connecting,
    Reconnecting(ReconnectProgress),
    Recording { started_at: String },
    Final(TaskOutcome),
}

/// Що сказати фронтенду про перехід: факти **цього переходу**, не весь
/// [`StreamStatus`]. Накопичене (`bytes_recorded`, `tracks_recorded`) не знає
/// жоден перехід — воно росте між ними й їде наступним `get_all_statuses`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct Emission {
    status: RecordingStatus,
    /// Заповнене лише при `status: "error"`. Канал існував наскрізь і в усіх
    /// викликах передавався порожнім — тепер він несе причину (ADR 2026-09-06 §5).
    error: Option<FailureReason>,
    /// Непорожня лише при `status: "reconnecting"`, і саме порожнеча в решті
    /// переходів **є** скиданням пари в дзеркалі фронтенду: окремого механізму
    /// для цього не існує (ADR 2026-09-15 «Подія несе те, що знає перехід» §1).
    reconnect: Option<ReconnectProgress>,
    /// Мить, коли з'єднання стало записом. Доти фронтенд штампував власний
    /// годинник на прибуття події — те саме поле з живим джерелом, яке ніхто
    /// не читав (§1).
    recording_started_at: Option<String>,
}

/// Перехід, яким починається чергова ітерація циклу `'reconnect`. Нуль спроб —
/// це перша ітерація задачі, отже підключення; далі потік **перепідключається**
/// і в підключення не повертається. Лічильник для цього придатний саме тому,
/// що скидається на першому аудіобайті, а не на вдалому `connect`
/// (ADR 2026-08-13 §2): після успішного запису наступний обрив чесно починає
/// рахунок заново, не вдаючи перше з'єднання.
fn opening_transition(attempt: u32, max_retries: u32) -> Transition {
    if attempt == 0 {
        Transition::Connecting
    } else {
        Transition::Reconnecting(ReconnectProgress { attempt, max: max_retries })
    }
}

/// Чиста половина переходу: кладе його в статус і каже, що з цього емітити.
///
/// `None` означає «видиме не змінилось, фронтенду казати нема чого»
/// (ADR 2026-09-15 §5). Верх циклу оголошує перехід беззастережно, тож той
/// самий `Reconnecting` приходить двічі — перед сном і після нього; умовний
/// емісії в самому циклі тримався б на маршруті, а не на правилі. Дублікат не
/// безкоштовний: кожна подія штовхає живий снапшот crash-recovery і повну
/// перебудову меню трея з трьома замками.
fn transition_outcome(transition: Transition) -> (StreamState, Emission) {
    match transition {
        Transition::Connecting => (
            StreamState::Connecting,
            Emission {
                status: RecordingStatus::Connecting,
                error: None,
                reconnect: None,
                recording_started_at: None,
            },
        ),
        Transition::Reconnecting(progress) => (
            StreamState::Reconnecting,
            Emission {
                status: RecordingStatus::Reconnecting,
                error: None,
                reconnect: Some(progress),
                recording_started_at: None,
            },
        ),
        Transition::Recording { started_at } => (
            StreamState::Recording,
            Emission {
                status: RecordingStatus::Recording,
                error: None,
                reconnect: None,
                recording_started_at: Some(started_at),
            },
        ),
        // Стан і причина йдуть з одного джерела — інакше причина пережила б
        // помилку, яку описувала, і рядок показав би вчорашній діагноз. Стан
        // тут потрібен на мить: одразу по цьому запис іде з менеджера, і далі
        // `Error` тримає дзеркало у фронтенді (ADR 2026-09-06 §3). Але цю мить
        // бачить живий снапшот crash-recovery — і саме тому потік, що впав, до
        // нього не потрапляє.
        Transition::Final(outcome) => (
            outcome.state(),
            Emission {
                status: outcome.status(),
                error: outcome.reason(),
                reconnect: None,
                recording_started_at: None,
            },
        ),
    }
}

/// Чиста половина переходу: кладе його в статус і каже, що з цього емітити.
///
/// `None` означає рівно одне — «видиме не змінилось, фронтенду казати нема
/// чого» (ADR 2026-09-15 §5). Верх циклу оголошує перехід беззастережно, тож
/// той самий `Reconnecting` приходить двічі — перед сном і після нього; умовний
/// емісії в самому циклі тримався б на маршруті, а не на правилі. Дублікат не
/// безкоштовний: кожна подія штовхає живий снапшот crash-recovery і повну
/// перебудову меню трея з трьома замками.
///
/// Обидва переліки полів нижче — про одні й ті самі чотири поля, і п'яте,
/// дописане лише в один із них, компілятор не спіймає. Сторож на це —
/// `every_emitted_field_alone_is_enough_to_emit`.
fn apply_transition(status: &mut StreamStatus, transition: Transition) -> Option<Emission> {
    let (state, next) = transition_outcome(transition);

    let changed = (status.state, status.error, status.reconnect, &status.recording_started_at)
        != (state, next.error, next.reconnect, &next.recording_started_at);

    status.state = state;
    status.error = next.error;
    status.reconnect = next.reconnect;
    status.recording_started_at = next.recording_started_at.clone();

    changed.then_some(next)
}

/// Що емітити для переходу: `None` — коли статус є і видиме в ньому не
/// змінилось. Коли статусу вже немає, порівнювати нема з чим, і перехід
/// говорить беззастережно.
fn emission_for(existing: Option<&mut StreamStatus>, transition: Transition) -> Option<Emission> {
    match existing {
        Some(status) => apply_transition(status, transition),
        // `stop_all_async` осушує `entries` на перемиканні профілю, поки задачі
        // ще доживають. `None` означає «видиме не змінилось», а не «запису вже
        // немає»: злиття цих двох значень з'їло б останню звістку задачі.
        None => Some(transition_outcome(transition).1),
    }
}

/// Оголосити перехід: покласти в статус потоку і, якщо видиме змінилось,
/// сказати фронтенду. Єдиний спосіб змінити стан запису.
///
/// Wake-lock перераховується тут, одним місцем: доти той самий дубль із двох
/// рядків стояв у кожному з чотирьох помічників, які ця функція замінила.
async fn announce_transition(
    app: &AppHandle,
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    transition: Transition,
) {
    let emission = {
        let mut guard = manager.write().await;
        let emission = emission_for(
            guard.entries.get_mut(stream_id).map(|entry| &mut entry.status),
            transition,
        );
        let any_active = guard.entries.values().any(|e| is_active_state(&e.status.state));
        guard.wake_lock.set_recording(any_active);
        emission
    };
    if let Some(emission) = emission {
        emit_recording_status(app, stream_id, emission);
    }
}

async fn update_bytes_recorded(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    additional: u64,
) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.bytes_recorded += additional;
    }
}

async fn update_track_info(
    manager: &Arc<RwLock<StreamManager>>,
    stream_id: &str,
    artist: &str,
    title: &str,
    ignored: bool,
) {
    let started_at = chrono::Local::now().to_rfc3339();
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.current_track = Some(TrackInfo {
            artist: artist.to_string(),
            title: title.to_string(),
            started_at,
            ignored,
        });
        // tracks_recorded is NOT incremented here — only when a track is finalized
        // (i.e., kept on disk). See update_tracks_recorded.
    }
}

async fn update_tracks_recorded(manager: &Arc<RwLock<StreamManager>>, stream_id: &str) {
    let mut guard = manager.write().await;
    if let Some(entry) = guard.entries.get_mut(stream_id) {
        entry.status.tracks_recorded += 1;
    }
}

// ---------------------------------------------------------------------------
// Backoff helper
// ---------------------------------------------------------------------------

fn compute_backoff_delay(reconnect: &ReconnectConfig, attempt: u32) -> u64 {
    let base = reconnect.retry_interval_secs as f64;
    let delay = base * (reconnect.backoff_multiplier as f64).powi(attempt as i32 - 1);
    delay.min(reconnect.max_interval_secs as f64) as u64
}

/// The next reconnect attempt to take, or `None` to give up.
struct RetryPlan {
    attempt: u32,
    delay_secs: u64,
}

/// Single source of truth for "try again?" — `max_retries == 0` means never
/// reconnect at all (ADR 2026-08-13: zero is not "unlimited"), otherwise the
/// next attempt is allowed as long as it doesn't exceed the configured ceiling.
/// Split out from `plan_retry` (ADR 2026-08-13 §3) for callers that only need
/// the yes/no answer, without paying for `compute_backoff_delay`'s `powi`. The
/// second such caller — the `will_retry` flag on the `stream-error` event — went
/// with that event on 2026-09-06, so `plan_retry` is the only one left; the
/// split stays because the ceiling rule reads as a sentence here and inlined
/// would not.
fn would_retry(reconnect: &ReconnectConfig, attempt: u32) -> bool {
    reconnect.max_retries != 0 && attempt < reconnect.max_retries
}

fn plan_retry(reconnect: &ReconnectConfig, attempt: u32) -> Option<RetryPlan> {
    if !would_retry(reconnect, attempt) {
        return None;
    }
    let next_attempt = attempt + 1;
    Some(RetryPlan {
        attempt: next_attempt,
        delay_secs: compute_backoff_delay(reconnect, next_attempt),
    })
}

// ---------------------------------------------------------------------------
// Events sent from the blocking read thread to the async task
// ---------------------------------------------------------------------------

enum ReadEvent {
    /// A chunk of raw audio bytes
    AudioBytes(Vec<u8>),
    /// Metadata changed: artist, title
    MetadataChanged(String, String),
    /// Stream ended or IO error
    Error(String),
    /// Clean EOF
    Eof,
}

// ---------------------------------------------------------------------------
// recording_task — top-level free async function
// ---------------------------------------------------------------------------

/// Ігнорований трек сюди не заходить: його гілка фіналізує попередній трек і
/// емітить сама (щоб не починати новий файл), тож `ignored: false` нижче — це
/// факт про єдиних викликачів, а не типове значення.
async fn handle_splitter_action(
    action: splitter::SplitAction,
    app_handle: &AppHandle,
    stream_id: &str,
    rec: &mut recorder::Recorder,
    manager: &Arc<RwLock<StreamManager>>,
    artist: &str,
    title: &str,
) {
    match action {
        splitter::SplitAction::Skip => {
            debug!("[{}] Splitter: skip (first-incomplete/too-short/unchanged): {} - {}", stream_id, artist, title);
            emit_track_changed(app_handle, stream_id, artist, title, false);
            update_track_info(manager, stream_id, artist, title, false).await;
        }
        splitter::SplitAction::StartTrack(m) => {
            debug!("[{}] Splitter: start track: {} - {}", stream_id, m.artist, m.title);
            if let Ok(file_name) = rec.start_track(&m.artist, &m.title).await {
                emit_recording_started(app_handle, stream_id, &file_name);
            }
            emit_track_changed(app_handle, stream_id, &m.artist, &m.title, false);
            update_track_info(manager, stream_id, &m.artist, &m.title, false).await;
        }
        splitter::SplitAction::FinalizeAndStart { completed, new, duration_ms } => {
            debug!("[{}] Splitter: finalize '{} - {}' ({}ms), start '{} - {}'", stream_id, completed.artist, completed.title, duration_ms, new.artist, new.title);
            if let Ok(Some(final_path)) = rec.finalize_track(&completed.artist, &completed.title, duration_ms).await {
                update_tracks_recorded(manager, stream_id).await;
                let file_name = final_path.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                emit_recording_completed(app_handle, stream_id, &file_name, duration_ms);
            }
            if let Ok(file_name) = rec.start_track(&new.artist, &new.title).await {
                emit_recording_started(app_handle, stream_id, &file_name);
            }
            emit_track_changed(app_handle, stream_id, &new.artist, &new.title, false);
            update_track_info(manager, stream_id, &new.artist, &new.title, false).await;
        }
    }
}

pub async fn recording_task(
    stream_info: StreamInfo,
    recording_settings: RecordingSettings,
    cancel_token: CancellationToken,
    app_handle: AppHandle,
    manager: Arc<RwLock<StreamManager>>,
) {
    let stream_id = stream_info.id.clone();
    let url = stream_info.url.clone();
    let station_name = stream_info.name.clone();

    info!("[{}] Recording task started: {}", stream_id, url);

    let reconnect = recording_settings.reconnect.clone();
    let mut attempt = 0u32;
    // Кожен `break 'reconnect` мусить сказати, ЧОМУ. Дефолт — «зупинено»:
    // скасування й відмова записувати чужий кодек збоями не є.
    let mut outcome = TaskOutcome::Stopped;

    'reconnect: loop {
        if cancel_token.is_cancelled() {
            break 'reconnect;
        }

        // --- connecting ---
        announce_transition(
            &app_handle,
            &manager,
            &stream_id,
            opening_transition(attempt, reconnect.max_retries),
        )
        .await;

        let conn = match connection::connect(&url).await {
            Ok(c) => {
                info!("[{}] Connected successfully", stream_id);
                c
            }
            Err(e) => {
                let msg = e.to_string();
                error!("[{}] Connection failed: {}", stream_id, msg);
                // Стану помилки тут не виставляємо: поки спроби лишаються, потік
                // ПЕРЕПІДКЛЮЧАЄТЬСЯ — це процес, а помилка діагноз
                // (ADR 2026-09-06 §1). Тост на кожну невдалу спробу теж знято:
                // носій є в самому рядку, а десять спливань за 40 хвилин жодного
                // разу не казали головного (§4).
                let Some(RetryPlan { attempt: next_attempt, delay_secs }) = plan_retry(&reconnect, attempt) else {
                    outcome = TaskOutcome::Failed(FailureReason::StationUnreachable);
                    break 'reconnect;
                };
                attempt = next_attempt;
                debug!("[{}] Reconnecting in {}s (attempt {}/{})", stream_id, delay_secs, attempt, reconnect.max_retries);
                announce_transition(
                    &app_handle,
                    &manager,
                    &stream_id,
                    Transition::Reconnecting(ReconnectProgress { attempt, max: reconnect.max_retries }),
                )
                .await;
                tokio::select! {
                    _ = cancel_token.cancelled() => break 'reconnect,
                    _ = tokio::time::sleep(Duration::from_secs(delay_secs)) => {}
                }
                continue 'reconnect;
            }
        };

        // --- Update profile with ICY headers ---
        let icy_bitrate = conn.headers.bitrate();
        let icy_name_val: Option<String> = conn.headers.name().map(str::to_string);
        let icy_genre_val: Option<String> = conn.headers.genre().first().map(|s| s.to_string());
        // IcyHeaders doesn't expose a url() method
        let icy_url_val: Option<String> = None;

        // Докази перед вердиктом, дефолту немає (ADR 2026-08-31 §1). Обидві
        // половини вердикту йдуть у профіль разом, нижче.
        let (detected_format, unsupported) =
            format::detect(conn.content_type.as_deref(), &conn.prefix).split();

        // `%s` is ALWAYS the profile's name. Two mountpoints of one station send
        // the SAME icy-name, so using it here would merge their folders and undo
        // the suffix their profile entries carry.
        let station_name = {
            let state = app_handle.state::<crate::app_state::AppState>();
            // Оновлений потік виноситься з мутації окремо, а не значенням коміту:
            // подія `stream-info-updated` має піти й тоді, коли запис на диск не
            // вдався — у пам'яті ім'я вже нове, і UI мусить його показати.
            let mut updated_stream: Option<StreamInfo> = None;
            let committed = state
                .commit_profile(|profile| {
                    let Some(i) = profile.streams.iter().position(|s| s.id == stream_id) else {
                        // Потік прибрали з профілю посеред запису — писати нічого.
                        return crate::store::Commit::Skip(());
                    };
                    {
                        // Naming an unnamed stream picks its recording folder, so
                        // it has to dodge the folders the other streams own.
                        let taken: std::collections::HashSet<String> = profile
                            .streams
                            .iter()
                            .enumerate()
                            .filter(|(j, _)| *j != i)
                            .map(|(_, s)| crate::naming::collision_key(&s.name))
                            .collect();
                        let s = &mut profile.streams[i];
                        if let Some(br) = icy_bitrate {
                            s.bitrate = Some(br);
                        }
                        if let Some(icy) = icy_name_val.as_ref() {
                            let meta = crate::naming::NameMeta {
                                format: detected_format.clone(),
                                bitrate: icy_bitrate,
                            };
                            if let Some(renamed) =
                                crate::naming::icy_rename(&s.name, &s.url, icy, &meta, &taken)
                            {
                                s.name = renamed;
                            }
                            s.icy_name = Some(icy.clone());
                        }
                        if icy_genre_val.is_some() {
                            s.icy_genre = icy_genre_val.clone();
                        }
                        if icy_url_val.is_some() {
                            s.icy_url = icy_url_val.clone();
                        }
                        // Дві половини одного вердикту — пишуться разом, інакше
                        // рядок показував би формат від однієї перевірки й мітку
                        // від іншої.
                        s.format = detected_format.clone();
                        s.unsupported_codec = unsupported.clone();
                        updated_stream = Some(s.clone());
                        crate::store::Commit::Save(())
                    }
                })
                .await;
            if let Err(e) = committed {
                log::warn!("recorder: failed to save profile after ICY headers: {e}");
            }
            match updated_stream {
                Some(updated) => {
                    let name = updated.name.clone();
                    app_handle.emit("stream-info-updated", updated).ok();
                    name
                }
                // Stream was removed from the profile mid-recording — keep the
                // name the task started with.
                None => station_name.clone(),
            }
        };

        // --- Відмова: ефір не з тих, які Tapir уміє писати ---
        // Коміт даних ефіру вище вже відбувся — мітка лягла в профіль, тож
        // наступна спроба (і планувальник) впадуть швидко, ще до з'єднання.
        // Спроби це не витрачає й перепідключення не планує: станція справна,
        // відмовляє Tapir, і повторний запит дасть той самий вердикт
        // (ADR 2026-08-31 §4 — поправка до ADR 2026-08-13).
        let Some(detected_format) = detected_format else {
            let family = unsupported.and_then(|u| u.family);
            warn!(
                "[{}] Unsupported air format ({}) — refusing to record",
                stream_id,
                family.as_deref().unwrap_or("unrecognised"),
            );
            emit_stream_unsupported(&app_handle, &stream_id, family);
            break 'reconnect;
        };

        // --- Set up recorder ---
        let output_dir = portable::resolve_output_dir(&recording_settings.output_dir);

        let mut rec = recorder::Recorder::new(
            output_dir,
            recording_settings.clone(),
            detected_format,
            station_name.clone(),
        );

        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        if let Err(e) = rec.open_stream_file(&station_name, &today).await {
            log::warn!("[{}] Failed to open stream file: {}", stream_id, e);
        }

        let splitter_config = splitter::SplitterConfig {
            skip_first_incomplete_track: recording_settings.skip_first_incomplete_track,
            skip_short_tracks_ms: recording_settings.skip_short_tracks_ms,
        };
        let mut spl = splitter::Splitter::new(splitter_config);

        // --- Start read loop via spawn_blocking ---
        // We use a channel to bridge the blocking ICY read thread and the async task.
        // The channel is bounded so back-pressure is automatic.
        let (tx, mut rx) = tokio::sync::mpsc::channel::<ReadEvent>(64);

        let blocking_handle = tokio::task::spawn_blocking(move || {
            // ICY-розмітку знімає читач із `connection` (там же розбирається
            // `StreamTitle`), сюди приходить саме звук і назви треків на
            // своїх межах.
            connection::pump_air(conn, tokio::runtime::Handle::current(), |event| {
                match event {
                    connection::AirEvent::Audio(data) => {
                        tx.blocking_send(ReadEvent::AudioBytes(data)).is_ok()
                    }
                    connection::AirEvent::Track(track) => tx
                        .blocking_send(ReadEvent::MetadataChanged(track.artist, track.title))
                        .is_ok(),
                    connection::AirEvent::Eof => {
                        log::warn!("[ICY reader] EOF (0 bytes read)");
                        let _ = tx.blocking_send(ReadEvent::Eof);
                        false
                    }
                    connection::AirEvent::Error(msg) => {
                        log::error!("[ICY reader] Read error: {}", msg);
                        let _ = tx.blocking_send(ReadEvent::Error(msg));
                        false
                    }
                }
            });
        });

        // --- Async event consumer ---
        let started_at = chrono::Local::now().to_rfc3339();
        announce_transition(
            &app_handle,
            &manager,
            &stream_id,
            Transition::Recording { started_at },
        )
        .await;

        let mut local_bytes: u64 = 0;
        const BYTES_UPDATE_THRESHOLD: u64 = 65536;
        // The attempt counter resets on the first audio byte, not on a successful
        // `connect` — a connection that accepts and immediately drops (dead
        // mountpoint that still answers) must keep spending attempts, or the
        // ceiling and backoff never engage (ADR 2026-08-13).
        let mut got_audio = false;

        'read: loop {
            tokio::select! {
                _ = cancel_token.cancelled() => {
                    info!("[{}] Recording cancelled by user", stream_id);
                    drop(rx);
                    rec.close().await.ok();
                    break 'reconnect;
                }
                event = rx.recv() => {
                    match event {
                        None => {
                            warn!("[{}] Read channel closed (blocking thread exited)", stream_id);
                            rec.close().await.ok();
                            break 'read;
                        }
                        Some(ReadEvent::Eof) => {
                            warn!("[{}] Stream EOF received", stream_id);
                            rec.close().await.ok();
                            break 'read;
                        }
                        Some(ReadEvent::Error(msg)) => {
                            error!("[{}] Stream read error: {}", stream_id, msg);
                            rec.close().await.ok();
                            // Обрив сам собою не вердикт — його виносить
                            // `plan_retry` нижче, коли спроби скінчаться.
                            break 'read;
                        }
                        Some(ReadEvent::MetadataChanged(artist, title)) => {
                            // --- Wishlist/Ignorelist check ---
                            let track_action = {
                                let stream_title = matcher::build_stream_title(&artist, &title);
                                if let Some(ref st) = stream_title {
                                    let state = app_handle.state::<crate::app_state::AppState>();
                                    let profile = state.active_profile.read().await;
                                    let per_stream_ignorelist = profile.streams
                                        .iter()
                                        .find(|s| s.id == stream_id)
                                        .map(|s| s.ignorelist.as_slice())
                                        .unwrap_or(&[]);
                                    matcher::check_track(
                                        st,
                                        per_stream_ignorelist,
                                        &profile.ignorelist,
                                        &profile.wishlist,
                                    )
                                } else {
                                    matcher::TrackAction::Normal
                                }
                            };

                            match track_action {
                                matcher::TrackAction::Ignored { ref pattern } => {
                                    // Finalize any in-progress track so its audio is clean
                                    let meta = connection::TrackMetadata {
                                        artist: artist.clone(),
                                        title: title.clone(),
                                    };
                                    let action = spl.on_metadata_change(meta);
                                    if let splitter::SplitAction::FinalizeAndStart { completed, duration_ms, .. } = action
                                        && let Ok(Some(final_path)) = rec.finalize_track(&completed.artist, &completed.title, duration_ms).await
                                    {
                                        update_tracks_recorded(&manager, &stream_id).await;
                                        let file_name = final_path.file_name()
                                            .map(|n| n.to_string_lossy().to_string())
                                            .unwrap_or_default();
                                        emit_recording_completed(&app_handle, &stream_id, &file_name, duration_ms);
                                    }
                                    // Носій — кваліфікатор у рядку потоку; окремої події
                                    // «трек проігноровано» більше немає, бо оголошувати
                                    // кожен рекламний блок нічим (ADR 2026-08-31 §4).
                                    emit_track_changed(&app_handle, &stream_id, &artist, &title, true);
                                    update_track_info(&manager, &stream_id, &artist, &title, true).await;
                                    info!("[{}] Track ignored ({}): {} - {}", stream_id, pattern, artist, title);
                                }
                                matcher::TrackAction::WishlistMatch { ref pattern } => {
                                    // Носій-стан первинний, подія проєктується поверх нього
                                    // (ADR 2026-08-31 §2): спершу рядок у журналі, і вже його
                                    // несе подія.
                                    let entry = {
                                        let state = app_handle.state::<crate::app_state::AppState>();
                                        let mut log = state.match_log.write().await;
                                        log.push(
                                            MatchInput {
                                                stream_id: stream_id.clone(),
                                                station_name: station_name.clone(),
                                                artist: artist.clone(),
                                                title: title.clone(),
                                                pattern: pattern.clone(),
                                            },
                                            chrono::Local::now().to_rfc3339(),
                                        )
                                    };
                                    emit_wishlist_match(&app_handle, &entry);
                                    info!("[{}] Wishlist match ({}): {} - {}", stream_id, pattern, artist, title);
                                    let meta = connection::TrackMetadata {
                                        artist: artist.clone(),
                                        title: title.clone(),
                                    };
                                    let action = spl.on_metadata_change(meta);
                                    handle_splitter_action(action, &app_handle, &stream_id, &mut rec, &manager, &artist, &title).await;
                                }
                                matcher::TrackAction::Normal => {
                                    let meta = connection::TrackMetadata {
                                        artist: artist.clone(),
                                        title: title.clone(),
                                    };
                                    let action = spl.on_metadata_change(meta);
                                    handle_splitter_action(action, &app_handle, &stream_id, &mut rec, &manager, &artist, &title).await;
                                }
                            }
                        }
                        Some(ReadEvent::AudioBytes(data)) => {
                            if !got_audio {
                                got_audio = true;
                                attempt = 0;
                            }
                            local_bytes += data.len() as u64;
                            if let Err(e) = rec.write_bytes(&data).await {
                                error!("[{}] Write failed: {}", stream_id, e);
                                rec.close().await.ok();
                                // Станція ні до чого — перепідключення не помогло б.
                                outcome = TaskOutcome::Failed(FailureReason::DiskWriteFailed);
                                break 'reconnect;
                            }
                            // Flush accumulated byte count to manager periodically
                            if local_bytes >= BYTES_UPDATE_THRESHOLD {
                                update_bytes_recorded(&manager, &stream_id, local_bytes).await;
                                local_bytes = 0;
                            }
                        }
                    }
                }
            }
        }

        // Flush any remaining byte count
        if local_bytes > 0 {
            update_bytes_recorded(&manager, &stream_id, local_bytes).await;
        }

        // Drop rx explicitly so the blocking thread sees a closed channel and exits,
        // then await the handle to surface any panic.
        drop(rx);
        match blocking_handle.await {
            Ok(()) => {} // clean exit
            Err(e) if e.is_panic() => {
                log::error!(
                    "[{}] ICY reader thread panicked: {:?}", stream_id, e
                );
                // Treat as a connection error — fall through to reconnect logic
            }
            Err(_) => {} // cancelled (won't happen for spawn_blocking)
        }

        // --- Reconnect logic ---
        if cancel_token.is_cancelled() {
            break 'reconnect;
        }
        let Some(RetryPlan { attempt: next_attempt, delay_secs }) = plan_retry(&reconnect, attempt) else {
            outcome = TaskOutcome::Failed(FailureReason::StationUnreachable);
            break 'reconnect;
        };
        attempt = next_attempt;
        debug!("[{}] Reconnecting in {}s (attempt {}/{})", stream_id, delay_secs, attempt, reconnect.max_retries);
        announce_transition(
            &app_handle,
            &manager,
            &stream_id,
            Transition::Reconnecting(ReconnectProgress { attempt, max: reconnect.max_retries }),
        )
        .await;
        tokio::select! {
            _ = cancel_token.cancelled() => break 'reconnect,
            _ = tokio::time::sleep(Duration::from_secs(delay_secs)) => {}
        }
    }

    // --- Final cleanup ---
    info!("[{}] Recording task finished — cleaning up ({:?})", stream_id, outcome);
    announce_transition(&app_handle, &manager, &stream_id, Transition::Final(outcome)).await;

    // Remove entry from the manager
    manager.write().await.entries.remove(&stream_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Правило одного власника, усі стани менеджера плюс «менеджер про потік не
    /// знає». Один `matches!` — і саме тому запис `tauri-ts-type-drift` обійшовся
    /// без ADR: відкотити правило можна правкою цього рядка.
    #[test]
    fn player_owns_the_track_line_unless_the_stream_is_being_recorded() {
        // Потік пишеться — рядок і кваліфікатор належать менеджеру.
        assert!(!player_owns_track_line(Some(StreamState::Recording)));

        // Менеджер ефіру не спостерігає: свого з'єднання ще (або вже) немає.
        // Саме тут `is_active` замість `Recording` заморозив би рядок на весь
        // час перепідключення.
        assert!(player_owns_track_line(Some(StreamState::Connecting)));
        assert!(player_owns_track_line(Some(StreamState::Reconnecting)));

        assert!(player_owns_track_line(Some(StreamState::Idle)));
        assert!(player_owns_track_line(Some(StreamState::Error)));

        // Потік ніколи не писався — менеджер його не знає.
        assert!(player_owns_track_line(None));
    }

    /// Форма дроту `track-changed`: рівно чотири ключі, camelCase. Тест ловить
    /// і повернення `album`, і розбіжність із ручним типом у `src/lib/tauri.ts`,
    /// який цю подію читає (`TrackChangedPayload`).
    #[test]
    fn track_changed_payload_carries_exactly_four_keys() {
        let json = serde_json::to_value(TrackChangedPayload {
            stream_id: "s1".to_string(),
            artist: "Miles".to_string(),
            title: "So What".to_string(),
            ignored: true,
        })
        .unwrap();

        let mut keys: Vec<&str> = json.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["artist", "ignored", "streamId", "title"]);
        assert_eq!(json["ignored"], serde_json::json!(true));
    }

    fn reconnect_config(max_retries: u32) -> ReconnectConfig {
        ReconnectConfig {
            max_retries,
            retry_interval_secs: 5,
            backoff_multiplier: 1.5,
            max_interval_secs: 300,
        }
    }

    fn idle_status() -> StreamStatus {
        StreamStatus {
            stream_id: "x".to_string(),
            state: StreamState::Idle,
            current_track: None,
            recording_started_at: None,
            bytes_recorded: 0,
            tracks_recorded: 0,
            error: None,
            reconnect: None,
            session_id: 0,
        }
    }

    fn progress(attempt: u32, max: u32) -> ReconnectProgress {
        ReconnectProgress { attempt, max }
    }

    #[test]
    fn the_pair_rides_only_with_reconnecting_and_the_event_repeats_the_status() {
        // Пара існує тоді й лише тоді, коли стан `Reconnecting`, і обидва
        // виходи переходу — запис у статус і тіло події — несуть те саме
        // значення (ADR 2026-09-15 «Подія несе те, що знає перехід» §4).
        // Обидва числа при цьому з одного знімка — reconnect-max-in-status.
        let mut status = idle_status();

        let e = apply_transition(&mut status, Transition::Reconnecting(progress(3, 10)))
            .expect("a first reconnect changes the status");
        assert!(matches!(status.state, StreamState::Reconnecting));
        assert_eq!(status.reconnect, Some(progress(3, 10)));
        assert_eq!(e.reconnect, status.reconnect);

        let e = apply_transition(&mut status, Transition::Recording { started_at: "t0".into() })
            .expect("recording changes the status");
        assert_eq!(status.reconnect, None, "the pair does not outlive the reconnect");
        assert_eq!(e.reconnect, None);
        assert_eq!(status.recording_started_at.as_deref(), Some("t0"));
        assert_eq!(e.recording_started_at.as_deref(), Some("t0"));

        let e = apply_transition(&mut status, Transition::Connecting)
            .expect("connecting changes the status");
        assert_eq!(status.reconnect, None);
        assert_eq!(status.recording_started_at, None, "the start moment belongs to recording");
        assert_eq!(e.recording_started_at, None);
    }

    #[test]
    fn a_transition_that_changes_nothing_emits_nothing() {
        // ADR 2026-09-15 §5: подія виходить тоді й лише тоді, коли видиме
        // змінилось. Верх циклу оголошує перехід беззастережно, тож той самий
        // `Reconnecting` приходить двічі — до сну й після нього.
        let mut status = idle_status();
        assert!(apply_transition(&mut status, Transition::Reconnecting(progress(2, 7))).is_some());
        assert!(apply_transition(&mut status, Transition::Reconnecting(progress(2, 7))).is_none());
        assert!(apply_transition(&mut status, Transition::Reconnecting(progress(3, 7))).is_some());
    }

    #[test]
    fn every_emitted_field_alone_is_enough_to_emit() {
        // `apply_transition` перелічує ті самі чотири поля двічі — у перевірці
        // «чи змінилось» і в присвоєннях, — і п'яте поле, дописане лише в один
        // перелік, компілятор не спіймає. Кожне поле перевіряється окремо:
        // пара переходів нижче різниться рівно одним із них.
        let settled = |transition| {
            let mut status = idle_status();
            apply_transition(&mut status, transition);
            status
        };

        let mut status = settled(Transition::Connecting);
        assert!(
            apply_transition(&mut status, Transition::Final(TaskOutcome::Stopped)).is_some(),
            "state alone"
        );

        let mut status = settled(Transition::Reconnecting(progress(1, 5)));
        assert!(
            apply_transition(&mut status, Transition::Reconnecting(progress(2, 5))).is_some(),
            "reconnect alone"
        );

        let mut status = settled(Transition::Recording { started_at: "t0".into() });
        assert!(
            apply_transition(&mut status, Transition::Recording { started_at: "t1".into() }).is_some(),
            "recording_started_at alone"
        );

        let failed = |reason| Transition::Final(TaskOutcome::Failed(reason));
        let mut status = settled(failed(FailureReason::StationUnreachable));
        assert!(
            apply_transition(&mut status, failed(FailureReason::DiskWriteFailed)).is_some(),
            "error alone"
        );
    }

    #[test]
    fn a_task_whose_entry_is_already_gone_still_says_its_last_word() {
        // `stop_all_async` осушує `entries` на перемиканні профілю, поки задачі
        // ще доживають, — фінальному переходу такої задачі нема з чим
        // порівнюватись. Мовчати він при цьому не має права: `None` означає
        // «видиме не змінилось», а не «запису вже немає».
        let emission = emission_for(None, Transition::Final(TaskOutcome::Stopped))
            .expect("a vanished entry is not a reason to swallow the last event");
        assert_eq!(emission.status, RecordingStatus::Stopped);
    }

    #[test]
    fn only_the_first_connection_of_a_recording_is_connecting() {
        // ADR 2026-09-15 «Підключення — перше з'єднання запису»: спроби циклу
        // в `Connecting` не повертаються, інакше рядок половину циклу каже
        // «З'єднання…», а потік блимає у відрі «Потребує уваги».
        assert_eq!(opening_transition(0, 10), Transition::Connecting);
        assert_eq!(opening_transition(1, 10), Transition::Reconnecting(progress(1, 10)));
        assert_eq!(opening_transition(9, 10), Transition::Reconnecting(progress(9, 10)));
    }

    #[test]
    fn stream_status_serializes_the_reconnect_pair_in_camel_case() {
        let mut status = idle_status();
        apply_transition(&mut status, Transition::Reconnecting(progress(2, 7)));
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains(r#""reconnect":{"attempt":2,"max":7}"#), "got: {json}");
    }

    #[test]
    fn the_event_body_carries_the_pair_and_the_start_moment() {
        // Тіло події везе факти переходу — не весь StreamStatus (ADR §1-§3).
        let mut status = idle_status();
        let e = apply_transition(&mut status, Transition::Reconnecting(progress(1, 10))).unwrap();
        let json =
            serde_json::to_string(&RecordingStatusPayload { stream_id: "s1".to_string(), emission: e })
                .unwrap();
        assert!(json.contains(r#""reconnect":{"attempt":1,"max":10}"#), "got: {json}");
        assert!(json.contains(r#""recordingStartedAt":null"#), "got: {json}");
        assert!(!json.contains("bytesRecorded"), "the event is not a whole status: {json}");
    }

    #[test]
    fn a_task_that_gave_up_reports_error_not_stopped() {
        // The whole defect in one assertion: every exit from `recording_task`
        // used to emit "stopped", so a stream that exhausted its retries was
        // indistinguishable from one the user stopped by hand, and the frontend
        // never saw `error` at all.
        let gave_up = TaskOutcome::Failed(FailureReason::StationUnreachable);
        assert_eq!(gave_up.status(), RecordingStatus::Error);
        assert_eq!(gave_up.reason(), Some(FailureReason::StationUnreachable));
        assert!(matches!(gave_up.state(), StreamState::Error));
    }

    #[test]
    fn cancellation_and_refusal_stay_stopped() {
        // A user stop and a refused codec are not failures: neither spends an
        // attempt, and neither belongs in the «Потребує уваги» bucket
        // (ADR 2026-09-06 §7).
        assert_eq!(TaskOutcome::Stopped.status(), RecordingStatus::Stopped);
        assert_eq!(TaskOutcome::Stopped.reason(), None);
        assert!(matches!(TaskOutcome::Stopped.state(), StreamState::Idle));
    }

    /// Два словники на дроті: результат запису знає `stopped`, стан потоку —
    /// ні. Тест тримає обидві унії `src/lib/tauri.ts` (`RecordingStatus` і
    /// `StreamState`) і саме ту різницю, заради якої їх розвели.
    #[test]
    fn recording_result_and_stream_state_are_two_vocabularies() {
        let word = |v| serde_json::to_value(v).unwrap();

        assert_eq!(word(RecordingStatus::Connecting), "connecting");
        assert_eq!(word(RecordingStatus::Recording), "recording");
        assert_eq!(word(RecordingStatus::Reconnecting), "reconnecting");
        assert_eq!(word(RecordingStatus::Stopped), "stopped");
        assert_eq!(word(RecordingStatus::Error), "error");

        // `stopped` — результат, не стан: потік після зупинки в очікуванні.
        let states = [
            StreamState::Idle,
            StreamState::Connecting,
            StreamState::Recording,
            StreamState::Reconnecting,
            StreamState::Error,
        ];
        assert!(states.iter().all(|s| serde_json::to_value(s).unwrap() != "stopped"));
        assert_eq!(
            serde_json::to_value(TaskOutcome::Stopped.state()).unwrap(),
            "idle",
        );
    }

    #[test]
    fn failure_reason_crosses_the_boundary_as_a_closed_set() {
        // The wire contract with `FailureReason` in src/lib/tauri.ts. A raw
        // error string would arrive in English inside a Ukrainian interface and
        // be read out in full by NVDA (ADR 2026-09-06 §5).
        assert_eq!(
            serde_json::to_string(&FailureReason::StationUnreachable).unwrap(),
            "\"station_unreachable\"",
        );
        assert_eq!(
            serde_json::to_string(&FailureReason::DiskWriteFailed).unwrap(),
            "\"disk_write_failed\"",
        );
        // The state the mirror stores alongside it.
        assert_eq!(serde_json::to_string(&StreamState::Error).unwrap(), "\"error\"");
    }

    #[test]
    fn would_retry_matches_plan_retry_is_some() {
        // would_retry exists so callers that only need the boolean don't pay
        // for compute_backoff_delay; it must never disagree with plan_retry.
        for max_retries in [0, 1, 3, 10] {
            let cfg = reconnect_config(max_retries);
            for attempt in 0..5 {
                assert_eq!(
                    would_retry(&cfg, attempt),
                    plan_retry(&cfg, attempt).is_some(),
                    "max_retries={max_retries} attempt={attempt}",
                );
            }
        }
    }

    #[test]
    fn plan_retry_zero_max_retries_never_retries() {
        // ADR 2026-08-13: 0 means "don't reconnect", not "unlimited".
        let cfg = reconnect_config(0);
        assert!(plan_retry(&cfg, 0).is_none());
        assert!(plan_retry(&cfg, 5).is_none());
    }

    #[test]
    fn plan_retry_stays_within_ceiling() {
        let cfg = reconnect_config(3);
        assert!(plan_retry(&cfg, 0).is_some(), "attempt 1 of 3 should be planned");
        assert!(plan_retry(&cfg, 1).is_some(), "attempt 2 of 3 should be planned");
        assert!(plan_retry(&cfg, 2).is_some(), "attempt 3 of 3 should be planned");
        assert!(plan_retry(&cfg, 3).is_none(), "attempt 4 of 3 exceeds the ceiling");
    }

    #[test]
    fn plan_retry_increments_attempt() {
        let cfg = reconnect_config(10);
        let plan = plan_retry(&cfg, 4).expect("within ceiling");
        assert_eq!(plan.attempt, 5);
    }

    #[test]
    fn plan_retry_delay_matches_backoff() {
        let cfg = reconnect_config(10);
        let plan = plan_retry(&cfg, 0).expect("within ceiling");
        assert_eq!(plan.delay_secs, compute_backoff_delay(&cfg, plan.attempt));
    }

    #[test]
    fn compute_backoff_delay_grows_and_caps() {
        let cfg = reconnect_config(100);
        assert_eq!(compute_backoff_delay(&cfg, 1), 5); // 5 * 1.5^0
        assert_eq!(compute_backoff_delay(&cfg, 2), 7); // 5 * 1.5^1 = 7.5 -> 7 (truncation)
        assert_eq!(compute_backoff_delay(&cfg, 20), 300); // capped at max_interval_secs
    }

    #[test]
    fn stop_all_async_returns_handles_for_active_entries() {
        // We can't easily test the full async path here without a full Tauri runtime.
        // Instead, verify the method exists and compiles by calling it.
        // The real contract (tasks terminate) is verified via integration testing.
        let _: fn(&mut StreamManager) -> Vec<tokio::task::JoinHandle<()>> =
            StreamManager::stop_all_async;
    }

    #[test]
    fn start_all_has_expected_signature() {
        // Contract check: a full behavioural test needs a Tauri AppHandle, which
        // isn't available in a unit test. Mirror the stop_all_async test and just
        // pin the signature so refactors can't silently change it.
        type StartAll = fn(
            &mut StreamManager,
            Vec<StreamInfo>,
            RecordingSettings,
            Arc<RwLock<StreamManager>>,
        ) -> usize;
        let _: StartAll = StreamManager::start_all;
    }

    #[test]
    fn stream_status_serializes_session_id_camel_case() {
        let status = StreamStatus { state: StreamState::Recording, session_id: 7, ..idle_status() };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"sessionId\":7"), "got: {json}");
    }

    #[test]
    fn start_recording_returns_session_id() {
        // Поведінковий тест потребує Tauri AppHandle — пінимо сигнатуру,
        // як у сусідніх тестах stop_all_async / start_all.
        type StartRecording = fn(
            &mut StreamManager,
            StreamInfo,
            RecordingSettings,
            Arc<RwLock<StreamManager>>,
        ) -> Result<u64, RadioError>;
        let _: StartRecording = StreamManager::start_recording;
    }
}
