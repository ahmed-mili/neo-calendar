//! Quand relancer un moteur qui s'est arrêté seul : 2 s, 4 s, 8 s, 16 s, abandon au cinquième échec de suite
//! (même règle que l'Android).

use serde::Serialize;
use std::time::Duration;

/// Où en est le processus Syncthing.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EngineState {
    /// Pas lancé (ou arrêté proprement, ou synchro désactivée).
    Stopped,
    /// `syncthing.exe` est absent du dossier de l'application.
    Missing,
    /// Un Syncthing installé partage déjà le dossier : le moteur de l'app ne démarre pas dessus.
    BlockedByInstalled,
    Starting,
    Running,
    /// S'est arrêté de lui-même : une relance est programmée.
    #[serde(rename_all = "camelCase")]
    Backoff { attempt: u32, retry_in_ms: u64, error: String },
    /// Trop d'échecs de suite : plus de relance automatique jusqu'à une action de l'utilisateur.
    Failed { error: String },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Decision {
    RetryIn { delay: Duration, attempt: u32 },
    GiveUp,
}

pub struct RestartPolicy {
    max_failures: u32,
    base: Duration,
    cap: Duration,
    stable_after: Duration,
    failures: u32,
}

impl Default for RestartPolicy {
    fn default() -> Self {
        Self::new(5, Duration::from_secs(2), Duration::from_secs(300), Duration::from_secs(60))
    }
}

impl RestartPolicy {
    pub fn new(max_failures: u32, base: Duration, cap: Duration, stable_after: Duration) -> Self {
        Self { max_failures, base, cap, stable_after, failures: 0 }
    }

    /// `ran` : durée de marche mesurée depuis l'instant où le moteur répondait. `answered = false` : il n'a
    /// jamais répondu (vivant mais muet, tué par l'app) : jamais stable, quelle que soit sa durée de vie.
    pub fn on_exit(&mut self, ran: Duration, answered: bool) -> Decision {
        if answered && ran >= self.stable_after {
            self.failures = 0;
        }
        self.failures += 1;
        if self.failures >= self.max_failures {
            return Decision::GiveUp;
        }
        let doubled = self.base.saturating_mul(1u32 << (self.failures - 1).min(20));
        Decision::RetryIn { delay: doubled.min(self.cap), attempt: self.failures }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secs(n: u64) -> Duration {
        Duration::from_secs(n)
    }

    #[test]
    fn it_retries_after_2_4_8_16_seconds_then_gives_up_at_the_fifth_failure() {
        let mut policy = RestartPolicy::default();
        for (expected, attempt) in [(2, 1), (4, 2), (8, 3), (16, 4)] {
            assert_eq!(policy.on_exit(secs(1), true), Decision::RetryIn { delay: secs(expected), attempt });
        }
        assert_eq!(policy.on_exit(secs(1), true), Decision::GiveUp);
    }

    #[test]
    fn a_minute_of_stable_running_resets_the_count() {
        let mut policy = RestartPolicy::default();
        policy.on_exit(secs(1), true);
        policy.on_exit(secs(1), true);
        assert_eq!(policy.on_exit(secs(120), true), Decision::RetryIn { delay: secs(2), attempt: 1 });
    }

    #[test]
    fn an_engine_that_never_answered_is_never_stable() {
        let mut policy = RestartPolicy::default();
        for _ in 0..4 {
            policy.on_exit(secs(3600), false);
        }
        assert_eq!(policy.on_exit(secs(3600), false), Decision::GiveUp);
    }

    #[test]
    fn the_delay_is_capped() {
        let mut policy = RestartPolicy::new(100, secs(2), secs(10), secs(60));
        let mut last = Duration::ZERO;
        for _ in 0..30 {
            if let Decision::RetryIn { delay, .. } = policy.on_exit(secs(1), true) {
                last = delay;
            }
        }
        assert_eq!(last, secs(10));
    }

    #[test]
    fn the_state_serialises_with_a_kind_tag_for_the_page() {
        let json = serde_json::to_string(&EngineState::Backoff { attempt: 2, retry_in_ms: 4000, error: "x".into() }).unwrap();
        assert!(json.contains(r#""kind":"backoff""#));
        assert!(json.contains(r#""retryInMs":4000"#));
        assert_eq!(serde_json::to_string(&EngineState::BlockedByInstalled).unwrap(), r#"{"kind":"blockedByInstalled"}"#);
    }
}
