//! Журнал збігів із вішлістом — сесійний носій-стан для події, якої користувач
//! не викликав (ADR 2026-08-31 «Носії для подій станції» §3, §6).
//!
//! Кільцевий буфер у пам'яті: на диск не йде і в профіль не пишеться. Профіль
//! для цього не годиться двічі — він пишеться цілком на кожному коміті (кожен
//! збіг переписував би файл) і експортується, тобто історія прослуховування
//! поїхала б у файлі, яким діляться.

use std::collections::VecDeque;

use serde::{Deserialize, Serialize};

/// Стеля буфера: далі найстаріший збіг витісняється.
pub const MATCH_LOG_CAPACITY: usize = 200;

/// Один збіг: подія, не здобич. Файлу в цей момент ще немає (`emit_wishlist_match`
/// спрацьовує на початку треку), тож на файл тут нічого не посилається.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WishlistMatch {
    /// Монотонний id у межах сесії — стабільний ключ рядка для списку.
    pub id: u64,
    /// Локальний час збігу, RFC3339. Формат для показу обирає фронтенд.
    pub matched_at: String,
    pub stream_id: String,
    pub station_name: String,
    pub artist: String,
    pub title: String,
    pub pattern: String,
}

/// Те, що знає про збіг місце події; `id` і час додає сам журнал.
pub struct MatchInput {
    pub stream_id: String,
    pub station_name: String,
    pub artist: String,
    pub title: String,
    pub pattern: String,
}

#[derive(Default)]
pub struct MatchLog {
    entries: VecDeque<WishlistMatch>,
    next_id: u64,
}

impl MatchLog {
    /// Записати збіг і повернути рядок, який ліг у журнал.
    pub fn push(&mut self, input: MatchInput, matched_at: String) -> WishlistMatch {
        self.next_id += 1;
        let entry = WishlistMatch {
            id: self.next_id,
            matched_at,
            stream_id: input.stream_id,
            station_name: input.station_name,
            artist: input.artist,
            title: input.title,
            pattern: input.pattern,
        };
        self.entries.push_front(entry.clone());
        if self.entries.len() > MATCH_LOG_CAPACITY {
            self.entries.pop_back();
        }
        entry
    }

    /// Спорожнити журнал — переключення профілю (вішліст профільний).
    /// Зупинка запису журнал НЕ чистить: сеанс той самий.
    pub fn clear(&mut self) {
        self.entries.clear();
    }

    /// Знімок журналу, найновіші зверху.
    pub fn entries(&self) -> Vec<WishlistMatch> {
        self.entries.iter().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(title: &str) -> MatchInput {
        MatchInput {
            stream_id: "st1".into(),
            station_name: "Radio Tapir".into(),
            artist: "Tycho".into(),
            title: title.into(),
            pattern: "Tycho*".into(),
        }
    }

    #[test]
    fn clear_empties_the_log_but_ids_never_repeat() {
        // Журнал очищається на переключенні профілю (вішліст профільний). Id
        // при цьому не перезапускається: дзеркало на фронтенді ключує рядки
        // саме ним, і повторений id зіштовхнув би новий збіг зі старим рядком,
        // який ще не встиг зникнути.
        let mut log = MatchLog::default();
        let first = log.push(input("Dive"), "2026-08-31T21:00:00+03:00".into());

        log.clear();
        assert!(log.entries().is_empty());

        let after = log.push(input("Awake"), "2026-08-31T21:04:00+03:00".into());
        assert_ne!(after.id, first.id);
    }

    #[test]
    fn oldest_match_is_evicted_at_the_ceiling() {
        let mut log = MatchLog::default();
        for n in 0..MATCH_LOG_CAPACITY + 5 {
            log.push(input(&format!("track {n}")), "2026-08-31T21:00:00+03:00".into());
        }

        let entries = log.entries();
        assert_eq!(entries.len(), MATCH_LOG_CAPACITY);
        assert_eq!(entries.first().unwrap().title, format!("track {}", MATCH_LOG_CAPACITY + 4));
        assert_eq!(entries.last().unwrap().title, "track 5");
    }

    #[test]
    fn newest_match_comes_first() {
        let mut log = MatchLog::default();
        log.push(input("Dive"), "2026-08-31T21:00:00+03:00".into());
        log.push(input("Awake"), "2026-08-31T21:04:00+03:00".into());

        let titles: Vec<String> = log.entries().into_iter().map(|m| m.title).collect();
        assert_eq!(titles, vec!["Awake".to_string(), "Dive".to_string()]);
    }
}
