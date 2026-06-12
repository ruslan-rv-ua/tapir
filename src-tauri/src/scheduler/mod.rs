//! Phase 3D Scheduler (§3).
//! windows — чиста календарна логіка; core — state machine тіка (Task 3);
//! timer — imperative shell (Task 6); validation — валідація моделі (Фаза 1).
pub mod core;
pub mod timer;
pub mod validation;
pub mod windows;
