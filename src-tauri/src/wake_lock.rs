use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use windows::Win32::System::Power::{
    SetThreadExecutionState, ES_CONTINUOUS, ES_SYSTEM_REQUIRED, EXECUTION_STATE,
};

pub struct WakeLock {
    player_active: Arc<AtomicBool>,
    recording_active: Arc<AtomicBool>,
    notify_tx: std::sync::mpsc::Sender<()>,
}

impl WakeLock {
    /// Create a new WakeLock and spawn the background OS thread.
    ///
    /// Panics if the OS thread cannot be spawned (catastrophic, equivalent to OOM).
    pub fn new() -> Self {
        let player_active = Arc::new(AtomicBool::new(false));
        let recording_active = Arc::new(AtomicBool::new(false));
        let (notify_tx, notify_rx) = std::sync::mpsc::channel::<()>();

        let p = player_active.clone();
        let r = recording_active.clone();

        std::thread::Builder::new()
            .name("wake-lock".into())
            .spawn(move || {
                let mut applied = false;
                for _ in notify_rx {
                    let desired =
                        p.load(Ordering::SeqCst) || r.load(Ordering::SeqCst);
                    if desired != applied {
                        let flags: EXECUTION_STATE = if desired {
                            ES_CONTINUOUS | ES_SYSTEM_REQUIRED
                        } else {
                            ES_CONTINUOUS
                        };
                        // SAFETY: SetThreadExecutionState is safe to call from any thread.
                        let ret = unsafe { SetThreadExecutionState(flags) };
                        if ret == EXECUTION_STATE(0) {
                            log::warn!("WakeLock: SetThreadExecutionState failed");
                            // Do not update `applied` on failure so the next genuine
                            // state-change triggers a retry.
                        } else {
                            applied = desired;
                            log::debug!("WakeLock: prevent_sleep={desired}");
                        }
                    }
                }
                // notify_rx closed (WakeLock dropped) — thread exits cleanly.
            })
            .expect("WakeLock: failed to spawn background thread");

        Self {
            player_active,
            recording_active,
            notify_tx,
        }
    }

    /// Notify the background thread that player activity changed.
    /// `active = true` → player is Playing; `false` → Paused or Stopped.
    pub fn set_player(&self, active: bool) {
        self.player_active.store(active, Ordering::SeqCst);
        let _ = self.notify_tx.send(());
    }

    /// Notify the background thread that recording activity changed.
    /// `active = true` → at least one stream is Recording/Connecting/Reconnecting.
    pub fn set_recording(&self, active: bool) {
        self.recording_active.store(active, Ordering::SeqCst);
        let _ = self.notify_tx.send(());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wake_lock_new_does_not_panic() {
        let _wl = WakeLock::new();
    }

    #[test]
    fn set_player_stores_active_flag() {
        let wl = WakeLock::new();
        assert!(!wl.player_active.load(Ordering::SeqCst));
        wl.set_player(true);
        assert!(wl.player_active.load(Ordering::SeqCst));
        wl.set_player(false);
        assert!(!wl.player_active.load(Ordering::SeqCst));
    }

    #[test]
    fn set_recording_stores_active_flag() {
        let wl = WakeLock::new();
        assert!(!wl.recording_active.load(Ordering::SeqCst));
        wl.set_recording(true);
        assert!(wl.recording_active.load(Ordering::SeqCst));
        wl.set_recording(false);
        assert!(!wl.recording_active.load(Ordering::SeqCst));
    }

    #[test]
    fn drop_cleans_up_background_thread() {
        let wl = WakeLock::new();
        wl.set_player(true);
        drop(wl); // Sender dropped → notify_rx closed → thread exits
    }
}
