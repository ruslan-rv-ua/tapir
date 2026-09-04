//! Геометрія головного вікна: розмір, позиція, розгорнутість.
//!
//! Замінює `tauri-plugin-window-state`, який писав `.window-state.json` у
//! `app_config_dir()` (тобто в `%APPDATA%`) і не має опції каталогу. Розмір і
//! позицію вікна встановив користувач руками — це його рішення, і воно мусить
//! їхати разом із застосунком, як налаштування й профілі. Межа «що живе в
//! `data/`, а що лишається платформі» — в ADR 2026-09-04-portable-boundary.
//!
//! Зберігаємо п'ять полів. Немає `visible` (це рішення поточного запуску:
//! `--minimize` і трей; у плагіна воно ще й змушувало його самого показувати
//! вікно ДО `setup`), немає `fullscreen` (режим відхилено 2026-08-17) і немає
//! `decorated` (константа: `decorations: true` — вимога NVDA mouse tracking).

use crate::errors::RadioError;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Window};

/// Скільки пікселів заголовка мусить бути видно по горизонталі, щоб вікно
/// вважалось досяжним мишею.
const MIN_VISIBLE_WIDTH: i32 = 120;

/// Висота смуги заголовка, яка мусить лежати в межах екрана. Заниження безпечне:
/// перевірка від цього лише м'якшає, а справжня висота залежить від масштабування.
const TITLE_BAND_HEIGHT: i32 = 32;

/// Мінімальний розмір із `tauri.conf.json`. Обрізання розміру не має опускатись
/// нижче: Tauri однаково поверне вікно до мінімуму, і у файл ляже неправда.
const MIN_WIDTH: u32 = 640;
const MIN_HEIGHT: u32 = 480;

/// Прямокутник у фізичних пікселях спільного полотна моніторів.
///
/// Позиція — зовнішня (`outer_position`), розмір — внутрішній (`inner_size`),
/// рівно так, як їх віддає й приймає Tauri. Змішувати не можна: збережений
/// зовнішній розмір, відновлений як внутрішній, ріс би на товщину рамки щоразу.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Geometry {
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    /// Прямокутник вище — завжди **звичайного** вікна; це лише позначка, що
    /// сеанс закінчився розгорнутим.
    #[serde(default)]
    pub maximized: bool,
}

/// Робоча область монітора (екран за винятком панелі задач).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WorkArea {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl WorkArea {
    fn right(&self) -> i32 {
        self.x.saturating_add(self.width as i32)
    }
    fn bottom(&self) -> i32 {
        self.y.saturating_add(self.height as i32)
    }
}

/// Останній **звичайний** прямокутник цього сеансу.
///
/// Потрібен рівно для одного випадку: вихід із розгорнутого вікна. Тоді саме
/// вікно віддає координати розгорнутого, а у файл має лягти той прямокутник, до
/// якого воно повернеться. Оновлюється на `Moved`/`Resized`, пишеться на диск
/// один раз — при виході.
static NORMAL: Mutex<Option<Geometry>> = Mutex::new(None);

pub fn load() -> Option<Geometry> {
    load_from(&crate::portable::window_state_path())
}

fn load_from(path: &std::path::Path) -> Option<Geometry> {
    let content = std::fs::read_to_string(path).ok()?;
    match serde_json::from_str::<Geometry>(crate::settings::strip_bom(&content)) {
        Ok(geometry) => Some(geometry),
        Err(e) => {
            log::warn!("window.json: cannot parse ({e}) — falling back to the configured size");
            None
        }
    }
}

fn save_to(path: &std::path::Path, geometry: &Geometry) -> Result<(), RadioError> {
    crate::store::write_json_atomically(path, "json.tmp", geometry)
}

/// Чи досяжна мишею смуга заголовка вікна в межах цієї робочої області.
///
/// Плагін питав слабше — чи потрапляє в монітор бодай один із чотирьох кутів.
/// Вікно, у якого на екрані лише нижній край, ту перевірку проходить, а
/// заголовок висить над екраном, і мишею вікно вже не взяти.
fn title_bar_reachable(g: &Geometry, area: &WorkArea) -> bool {
    let right = g.x.saturating_add(g.width as i32);
    let overlap = right.min(area.right()) - g.x.max(area.x);
    overlap >= MIN_VISIBLE_WIDTH
        && g.y >= area.y
        && g.y.saturating_add(TITLE_BAND_HEIGHT) <= area.bottom()
}

fn clamp_size(g: &Geometry, area: &WorkArea) -> (u32, u32) {
    (
        g.width.min(area.width).max(MIN_WIDTH),
        g.height.min(area.height).max(MIN_HEIGHT),
    )
}

/// Куди насправді ставити вікно: збережений прямокутник, перевірений проти
/// наявних моніторів.
///
/// Заголовок видно на якомусь моніторі — лишаємо позицію як є, розмір обрізаємо
/// до його робочої області. Не видно ніде (монітор від'єднали, роздільність
/// змінилась) — центруємо на головному. Моніторів немає взагалі — не чіпаємо
/// нічого; такого не буває, але вгадувати тут нема з чого.
pub fn fit(saved: Geometry, monitors: &[WorkArea], primary: Option<&WorkArea>) -> Geometry {
    let target = monitors.iter().find(|a| title_bar_reachable(&saved, a));
    let Some(area) = target.or(primary) else {
        return saved;
    };
    let (width, height) = clamp_size(&saved, area);

    if target.is_some() {
        return Geometry { width, height, ..saved };
    }
    Geometry {
        width,
        height,
        x: area.x + (area.width as i32 - width as i32) / 2,
        y: area.y + (area.height as i32 - height as i32) / 2,
        maximized: saved.maximized,
    }
}

fn work_areas(window: &Window) -> (Vec<WorkArea>, Option<WorkArea>) {
    let to_area = |m: &tauri::window::Monitor| {
        let area = m.work_area();
        WorkArea {
            x: area.position.x,
            y: area.position.y,
            width: area.size.width,
            height: area.size.height,
        }
    };
    let monitors = window
        .available_monitors()
        .map(|ms| ms.iter().map(to_area).collect())
        .unwrap_or_default();
    let primary = window.primary_monitor().ok().flatten().map(|m| to_area(&m));
    (monitors, primary)
}

/// Застосувати збережену геометрію до ще прихованого вікна.
///
/// Викликається в `setup` **перед** `show()` + `set_focus()`: ті два лишаються
/// останніми й сусідніми, бо від них залежить, чи NVDA озвучить вікно при
/// запуску (docs/notes/screenreader-startup-foreground.md). Розгортання теж
/// тут, поки вікно приховане: Windows розгортає вікно викликом, який заразом
/// його показує, і зробити це після `show()` означало б видимий стрибок.
pub fn apply(window: &Window, saved: Option<Geometry>) {
    let Some(saved) = saved else { return };
    let (monitors, primary) = work_areas(window);
    let g = fit(saved, &monitors, primary.as_ref());

    let _ = window.set_position(PhysicalPosition { x: g.x, y: g.y });
    let _ = window.set_size(PhysicalSize {
        width: g.width,
        height: g.height,
    });
    if g.maximized {
        let _ = window.maximize();
    }
    *NORMAL.lock().unwrap() = Some(Geometry {
        maximized: false,
        ..g
    });
}

/// Знімок поточного прямокутника вікна, або `None`, якщо його зараз немає сенсу
/// читати: згорнуте вікно Windows описує координатами `-32000`.
fn snapshot(window: &Window) -> Option<Geometry> {
    if window.is_minimized().unwrap_or(false) {
        return None;
    }
    let size = window.inner_size().ok()?;
    let position = window.outer_position().ok()?;
    Some(Geometry {
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
        maximized: window.is_maximized().unwrap_or(false),
    })
}

/// Запам'ятати звичайний прямокутник. Викликається з `on_window_event` на
/// `Moved` і `Resized`: розгорнуте вікно шле ті самі події зі своїми
/// координатами, і саме їх сюди пускати не можна.
pub fn remember(window: &Window) {
    let Some(g) = snapshot(window) else { return };
    if g.maximized {
        return;
    }
    *NORMAL.lock().unwrap() = Some(g);
}

/// Записати геометрію на диск. Єдиний запис за сеанс — з `graceful_shutdown`,
/// куди сходяться обидва шляхи виходу (кнопка закриття і «Вийти» в треї).
pub fn save(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let window = window.as_ref().window();
    // Згорнуте вікно: у файлі лишається геометрія попереднього сеансу — краще,
    // ніж координати `-32000`.
    let Some(current) = snapshot(&window) else {
        return;
    };
    let normal = *NORMAL.lock().unwrap();
    let geometry = if current.maximized {
        // Вихід із розгорнутого вікна: пишемо прямокутник, до якого воно
        // повернеться, а не розмір екрана.
        match normal {
            Some(n) => Geometry {
                maximized: true,
                ..n
            },
            None => return,
        }
    } else {
        current
    };
    if let Err(e) = save_to(&crate::portable::window_state_path(), &geometry) {
        log::warn!("window.json: failed to save window geometry: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LAPTOP: WorkArea = WorkArea {
        x: 0,
        y: 0,
        width: 1920,
        height: 1040,
    };
    const SECOND: WorkArea = WorkArea {
        x: 1920,
        y: 0,
        width: 2560,
        height: 1400,
    };

    fn window(x: i32, y: i32) -> Geometry {
        Geometry {
            width: 900,
            height: 650,
            x,
            y,
            maximized: false,
        }
    }

    #[test]
    fn a_window_inside_a_monitor_is_left_alone() {
        let saved = window(100, 100);
        assert_eq!(fit(saved, &[LAPTOP, SECOND], Some(&LAPTOP)), saved);
    }

    #[test]
    fn a_window_on_a_monitor_that_is_gone_is_centred_on_the_primary() {
        let saved = window(2400, 300);
        let placed = fit(saved, &[LAPTOP], Some(&LAPTOP));
        assert_eq!(placed.x, (1920 - 900) / 2);
        assert_eq!(placed.y, (1040 - 650) / 2);
        assert_eq!((placed.width, placed.height), (900, 650));
    }

    #[test]
    fn a_title_bar_above_the_screen_is_not_reachable() {
        // Нижній край на екрані — перевірка плагіна («бодай один кут») пройшла б.
        let placed = fit(window(100, -400), &[LAPTOP], Some(&LAPTOP));
        assert_eq!(placed.y, (1040 - 650) / 2);
    }

    #[test]
    fn a_sliver_at_the_right_edge_is_not_reachable() {
        let placed = fit(window(1880, 100), &[LAPTOP], Some(&LAPTOP));
        assert_eq!(placed.x, (1920 - 900) / 2);
    }

    #[test]
    fn a_window_wider_than_the_screen_is_clamped() {
        let saved = Geometry {
            width: 3000,
            height: 1800,
            x: 0,
            y: 0,
            maximized: false,
        };
        let placed = fit(saved, &[LAPTOP], Some(&LAPTOP));
        assert_eq!((placed.width, placed.height), (1920, 1040));
        assert_eq!((placed.x, placed.y), (0, 0));
    }

    #[test]
    fn clamping_never_goes_below_the_configured_minimum() {
        let tiny = WorkArea {
            x: 0,
            y: 0,
            width: 320,
            height: 240,
        };
        let placed = fit(window(0, 0), &[tiny], Some(&tiny));
        assert_eq!((placed.width, placed.height), (MIN_WIDTH, MIN_HEIGHT));
    }

    #[test]
    fn maximized_survives_a_move_to_the_primary() {
        let saved = Geometry {
            maximized: true,
            ..window(2400, 300)
        };
        assert!(fit(saved, &[LAPTOP], Some(&LAPTOP)).maximized);
    }

    #[test]
    fn without_any_monitor_the_saved_rectangle_is_used_as_is() {
        let saved = window(2400, 300);
        assert_eq!(fit(saved, &[], None), saved);
    }

    #[test]
    fn a_missing_file_reads_as_no_geometry() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(load_from(&tmp.path().join("window.json")), None);
    }

    #[test]
    fn a_broken_file_reads_as_no_geometry() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("window.json");
        std::fs::write(&path, "{ not json").unwrap();
        assert_eq!(load_from(&path), None);
    }

    #[test]
    fn what_is_saved_is_what_is_read_back() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("window.json");
        let geometry = Geometry {
            width: 1200,
            height: 800,
            x: -7,
            y: 15,
            maximized: true,
        };
        save_to(&path, &geometry).unwrap();
        assert_eq!(load_from(&path), Some(geometry));
    }
}
