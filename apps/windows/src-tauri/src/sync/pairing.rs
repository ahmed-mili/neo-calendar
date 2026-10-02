//! L'appairage par QR code : un code à usage unique, valable 5 minutes, que le téléphone annonce au PC dans le
//! nom d'appareil qu'il présente (`Pixel 8 [NC:K7Q2M9XPAB]`) : le seul canal que l'API REST de la v2.1.5 expose
//! pour un appareil encore inconnu (`/rest/cluster/pending/devices` rend son `name`, vérifié sur deux vrais moteurs).
//!
//! Règle : rien n'est accepté tout seul, sauf la demande qui porte le bon code pendant la fenêtre ouverte.

use super::config::random_chars;
use std::collections::HashSet;
use std::time::{Duration, Instant};

pub const WINDOW: Duration = Duration::from_secs(5 * 60);
/// Au-delà, la fenêtre se ferme : un code de 50 bits ne se devine pas, mais rien n'oblige à laisser essayer.
pub const MAX_WRONG: u32 = 10;
pub const CODE_LEN: usize = 10;
const CODE_ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MARKER_OPEN: &str = "[NC:";

pub fn new_code() -> String {
    random_chars(CODE_ALPHABET, CODE_LEN)
}

/// Ce que contient le QR code : le schéma `neo-calendar://` est déjà celui de l'app.
pub fn qr_payload(device_id: &str, code: &str) -> String {
    format!("neo-calendar://pair?device={device_id}&code={code}")
}

/// Le QR code en SVG, noir sur blanc quel que soit le thème (un lecteur ne lit pas un QR sombre).
pub fn qr_svg(payload: &str) -> Result<String, String> {
    let code = qrcode::QrCode::new(payload.as_bytes()).map_err(|e| e.to_string())?;
    Ok(code
        .render::<qrcode::render::svg::Color>()
        .min_dimensions(220, 220)
        .quiet_zone(true)
        .dark_color(qrcode::render::svg::Color("#000000"))
        .light_color(qrcode::render::svg::Color("#ffffff"))
        .build())
}

/// Sépare le nom d'appareil de son éventuel code : `("Pixel 8", Some("K7Q2M9XPAB"))`. Le code doit finir le nom,
/// avoir la bonne longueur et l'alphabet ; sinon le nom est rendu tel quel, sans code.
pub fn split_name(name: &str) -> (String, Option<String>) {
    let trimmed = name.trim();
    if let Some(open) = trimmed.rfind(MARKER_OPEN) {
        if let Some(code) = trimmed[open + MARKER_OPEN.len()..].strip_suffix(']') {
            let valid = code.len() == CODE_LEN && code.bytes().all(|b| CODE_ALPHABET.contains(&b));
            if valid {
                return (trimmed[..open].trim().to_string(), Some(code.to_string()));
            }
        }
    }
    (trimmed.to_string(), None)
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Verdict {
    /// Le bon code, dans la fenêtre : la demande s'accepte sans question.
    Accept,
    /// Pas de code dans le nom : demande ordinaire, à accepter à la main.
    NotACode,
    /// Un code, mais pas le bon.
    Wrong,
    /// Un code, mais aucune fenêtre ouverte (jamais ouverte, expirée, déjà utilisée, ou trop d'essais).
    Closed,
}

struct Session {
    code: String,
    opened: Instant,
    /// Les appareils qui ont présenté un mauvais code : chacun compte une fois, même s'il se reconnecte chaque seconde.
    wrong: HashSet<String>,
    used: bool,
}

#[derive(Default)]
pub struct Pairing {
    session: Option<Session>,
}

fn same_code(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl Pairing {
    /// Ouvre une fenêtre (la précédente, s'il y en avait une, est fermée).
    pub fn start(&mut self, now: Instant, code: String) {
        self.session = Some(Session { code, opened: now, wrong: HashSet::new(), used: false });
    }

    /// Le code de la fenêtre en cours (les tests jouent le téléphone avec).
    #[cfg(test)]
    pub fn current_code(&self) -> Option<String> {
        self.session.as_ref().map(|s| s.code.clone())
    }

    pub fn cancel(&mut self) {
        self.session = None;
    }

    fn open(&self, now: Instant) -> Option<&Session> {
        self.session
            .as_ref()
            .filter(|s| !s.used && (s.wrong.len() as u32) < MAX_WRONG && now.saturating_duration_since(s.opened) <= WINDOW)
    }

    /// Le temps qu'il reste à la fenêtre ouverte, s'il y en a une.
    pub fn remaining(&self, now: Instant) -> Option<Duration> {
        self.open(now).map(|s| WINDOW.saturating_sub(now.saturating_duration_since(s.opened)))
    }

    /// Juge une demande entrante (l'identifiant de l'appareil et le nom qu'il présente). Un code correct est consommé :
    /// le même ne passe jamais deux fois.
    pub fn judge(&mut self, now: Instant, device_id: &str, device_name: &str) -> Verdict {
        let (_, presented) = split_name(device_name);
        let Some(presented) = presented else {
            return Verdict::NotACode;
        };
        if self.open(now).is_none() {
            return Verdict::Closed;
        }
        let session = self.session.as_mut().expect("fenêtre ouverte");
        if same_code(&session.code, &presented) {
            session.used = true;
            Verdict::Accept
        } else {
            session.wrong.insert(device_id.to_string());
            Verdict::Wrong
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "7ZSUPCU-MIU3GEY-RKFNTSV-LN2G6Y4-QEHRT7P-4MRWEY7-UNMY3TG-YKFZEQX";

    fn open_at(now: Instant) -> Pairing {
        let mut pairing = Pairing::default();
        pairing.start(now, "K7Q2M9XPAB".to_string());
        pairing
    }

    #[test]
    fn the_payload_is_the_agreed_contract_with_the_phone() {
        // Même vecteur que `PairingPayloadTest` côté Android : si l'un change, l'autre doit changer.
        assert_eq!(
            qr_payload(ID, "K7Q2M9XPAB"),
            "neo-calendar://pair?device=7ZSUPCU-MIU3GEY-RKFNTSV-LN2G6Y4-QEHRT7P-4MRWEY7-UNMY3TG-YKFZEQX&code=K7Q2M9XPAB"
        );
    }

    #[test]
    fn the_qr_is_an_svg_in_black_on_white() {
        let svg = qr_svg(&qr_payload(ID, "K7Q2M9XPAB")).unwrap();
        assert!(svg.contains("<svg"));
        assert!(svg.contains("#ffffff") && svg.contains("#000000"));
    }

    #[test]
    fn codes_are_random_and_use_the_agreed_alphabet() {
        let a = new_code();
        assert_eq!(a.len(), CODE_LEN);
        assert_ne!(a, new_code());
        assert!(a.bytes().all(|b| CODE_ALPHABET.contains(&b)));
    }

    #[test]
    fn the_code_is_read_from_the_end_of_the_device_name() {
        assert_eq!(split_name("Pixel 8 [NC:K7Q2M9XPAB]"), ("Pixel 8".to_string(), Some("K7Q2M9XPAB".to_string())));
        assert_eq!(split_name("  Pixel [NC:K7Q2M9XPAB] "), ("Pixel".to_string(), Some("K7Q2M9XPAB".to_string())));
        assert_eq!(split_name("[NC:K7Q2M9XPAB]"), (String::new(), Some("K7Q2M9XPAB".to_string())));
    }

    #[test]
    fn a_malformed_marker_is_just_part_of_the_name() {
        for name in ["Pixel [NC:COURT]", "Pixel [NC:K7Q2M9XPAB] suite", "Pixel [NC:k7q2m9xpab]", "Pixel [NC:K7Q2M9XPA0]", "Pixel"] {
            assert_eq!(split_name(name), (name.trim().to_string(), None), "{name}");
        }
    }

    #[test]
    fn the_right_code_is_accepted_once_inside_the_window() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        assert_eq!(pairing.judge(t0 + Duration::from_secs(10), "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Accept);
        assert_eq!(pairing.judge(t0 + Duration::from_secs(11), "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Closed, "usage unique");
        assert!(pairing.remaining(t0 + Duration::from_secs(12)).is_none());
    }

    #[test]
    fn the_window_lasts_five_minutes() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        assert_eq!(pairing.remaining(t0), Some(WINDOW));
        assert_eq!(pairing.judge(t0 + WINDOW, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Accept);
        let mut late = open_at(t0);
        assert_eq!(late.judge(t0 + WINDOW + Duration::from_millis(1), "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Closed);
    }

    #[test]
    fn a_wrong_code_is_never_accepted_and_the_window_closes_after_too_many() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        for i in 0..MAX_WRONG {
            assert_eq!(pairing.judge(t0, &format!("intrus-{i}"), "Intrus [NC:AAAAAAAAAA]"), Verdict::Wrong);
        }
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Closed);
    }

    #[test]
    fn one_device_retrying_every_second_counts_as_one_wrong_attempt() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        for _ in 0..(MAX_WRONG * 3) {
            assert_eq!(pairing.judge(t0, "meme-intrus", "Intrus [NC:AAAAAAAAAA]"), Verdict::Wrong);
        }
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Accept, "la fenêtre reste ouverte");
    }

    #[test]
    fn an_ordinary_request_stays_manual_and_does_not_burn_the_window() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        assert_eq!(pairing.judge(t0, "karim", "Le PC de Karim"), Verdict::NotACode);
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Accept);
    }

    #[test]
    fn without_a_window_a_code_is_closed_and_cancel_closes_it() {
        let t0 = Instant::now();
        let mut pairing = Pairing::default();
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Closed);
        let mut opened = open_at(t0);
        opened.cancel();
        assert_eq!(opened.judge(t0, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Closed);
    }

    #[test]
    fn a_new_window_replaces_the_old_code() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        pairing.start(t0, "ZZZZZZZZZZ".to_string());
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Wrong);
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:ZZZZZZZZZZ]"), Verdict::Accept);
    }
}
