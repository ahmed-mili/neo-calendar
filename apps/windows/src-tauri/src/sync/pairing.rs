//! L'appairage par QR code : un code à usage unique que le téléphone annonce au PC dans le nom d'appareil qu'il
//! présente (`Pixel 8 [NC:K7Q2M9XPAB]`) : le seul canal que l'API REST de la v2.1.5 expose pour un appareil encore
//! inconnu (`/rest/cluster/pending/devices` rend son `name`, vérifié sur deux vrais moteurs).
//!
//! Le QR code change toutes les `REFRESH` tant que la fenêtre est ouverte : une photo prise par-dessus l'épaule ne
//! sert plus longtemps. Chaque code reste pourtant valable `CODE_LIFE` après avoir été tiré, parce que le téléphone
//! ne le présente qu'une fois connecté au PC, ce qui prend de quelques secondes à quelques dizaines de secondes.
//!
//! Règle : rien n'est accepté tout seul, sauf la demande qui porte un code valable de la fenêtre ouverte.

use super::config::random_chars;
use std::collections::HashSet;
use std::time::{Duration, Instant};

/// Toutes les combien la page demande un nouveau code.
pub const REFRESH: Duration = Duration::from_secs(25);
/// Combien de temps un code reste valable après avoir été tiré (affiché `REFRESH`, puis une minute de grâce).
pub const CODE_LIFE: Duration = Duration::from_secs(90);
/// Au-delà, la fenêtre se ferme : un code de 50 bits ne se devine pas, mais rien n'oblige à laisser essayer.
pub const MAX_WRONG: u32 = 10;
pub const CODE_LEN: usize = 10;
const CODE_ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MARKER_OPEN: &str = "[NC:";

pub fn new_code() -> String {
    random_chars(CODE_ALPHABET, CODE_LEN)
}

/// Un identifiant d'appareil Syncthing tapé ou collé, remis à la forme que le moteur écrit (`AAAAAAA-BBBBBBB-...`) :
/// espaces, tirets et casse ignorés, et les chiffres que la base 32 ne contient pas (0, 1, 8) lus comme les lettres
/// qu'ils imitent, comme le fait Syncthing. La somme de contrôle reste au moteur, qui refuse un identifiant faux.
pub fn normalize_device_id(raw: &str) -> Option<String> {
    let chars: Vec<char> = raw
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| match c.to_ascii_uppercase() {
            '0' => 'O',
            '1' => 'I',
            '8' => 'B',
            other => other,
        })
        .collect();
    if chars.len() != 56 || !chars.iter().all(|c| c.is_ascii_uppercase() || ('2'..='7').contains(c)) {
        return None;
    }
    Some(chars.chunks(7).map(|group| group.iter().collect::<String>()).collect::<Vec<_>>().join("-"))
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
    /// Un code valable de la fenêtre ouverte : la demande s'accepte sans question.
    Accept,
    /// Pas de code dans le nom : demande ordinaire, à accepter à la main.
    NotACode,
    /// Un code, mais aucun de ceux qui sont valables.
    Wrong,
    /// Un code, mais aucune fenêtre ouverte (jamais ouverte, codes expirés, déjà servie, ou trop d'essais).
    Closed,
}

struct Session {
    /// Les codes tirés depuis l'ouverture, avec l'instant du tirage ; les expirés sont oubliés au tirage suivant.
    codes: Vec<(String, Instant)>,
    /// Les appareils qui ont présenté un mauvais code : chacun compte une fois, même s'il se reconnecte chaque seconde.
    /// Le compte survit aux changements de code : sinon le renouvellement remettrait les essais à zéro.
    wrong: HashSet<String>,
    used: bool,
}

impl Session {
    fn live_codes(&self, now: Instant) -> impl Iterator<Item = &(String, Instant)> {
        self.codes.iter().filter(move |(_, issued)| now.saturating_duration_since(*issued) <= CODE_LIFE)
    }
}

#[derive(Default)]
pub struct Pairing {
    session: Option<Session>,
}

fn same_code(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl Pairing {
    /// Ouvre une fenêtre avec son premier code (la précédente, s'il y en avait une, est fermée).
    pub fn start(&mut self, now: Instant, code: String) {
        self.session = Some(Session { codes: vec![(code, now)], wrong: HashSet::new(), used: false });
    }

    /// Ajoute un nouveau code à la fenêtre ouverte ; les précédents restent valables jusqu'au bout de leur durée.
    /// Refusé sans fenêtre utilisable (jamais ouverte, déjà servie, trop d'essais) : il faut en rouvrir une.
    pub fn rotate(&mut self, now: Instant, code: String) -> bool {
        let Some(session) = self.session.as_mut() else { return false };
        if session.used || (session.wrong.len() as u32) >= MAX_WRONG {
            return false;
        }
        session.codes.retain(|(_, issued)| now.saturating_duration_since(*issued) <= CODE_LIFE);
        session.codes.push((code, now));
        true
    }

    /// Le dernier code tiré (les tests jouent le téléphone avec).
    #[cfg(test)]
    pub fn current_code(&self) -> Option<String> {
        self.session.as_ref().and_then(|s| s.codes.last()).map(|(code, _)| code.clone())
    }

    pub fn cancel(&mut self) {
        self.session = None;
    }

    fn open(&self, now: Instant) -> Option<&Session> {
        self.session
            .as_ref()
            .filter(|s| !s.used && (s.wrong.len() as u32) < MAX_WRONG && s.live_codes(now).next().is_some())
    }

    /// Le temps qu'il reste au code valable le plus récent, s'il y en a un.
    pub fn remaining(&self, now: Instant) -> Option<Duration> {
        self.open(now)?
            .live_codes(now)
            .map(|(_, issued)| CODE_LIFE.saturating_sub(now.saturating_duration_since(*issued)))
            .max()
    }

    /// Juge une demande entrante (l'identifiant de l'appareil et le nom qu'il présente). Un code correct ferme la
    /// fenêtre et tous ses codes : aucun code montré sur cet écran ne passe deux fois.
    pub fn judge(&mut self, now: Instant, device_id: &str, device_name: &str) -> Verdict {
        let (_, presented) = split_name(device_name);
        let Some(presented) = presented else {
            return Verdict::NotACode;
        };
        if self.open(now).is_none() {
            return Verdict::Closed;
        }
        let session = self.session.as_mut().expect("fenêtre ouverte");
        // Tous les codes valables sont comparés, sans s'arrêter au premier qui correspond.
        let matched = session.live_codes(now).fold(false, |found, (code, _)| found | same_code(code, &presented));
        if matched {
            session.used = true;
            session.codes.clear();
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
    fn a_typed_device_id_is_put_back_in_the_engine_form() {
        let typed = "7zsupcu miu3gey rkfntsv ln2g6y4 qehrt7p 4mrwey7 unmy3tg ykfzeqx";
        assert_eq!(normalize_device_id(typed).as_deref(), Some(ID));
        assert_eq!(normalize_device_id(&ID.replace('-', "")).as_deref(), Some(ID));
        assert_eq!(normalize_device_id(&format!("  {ID}\n")).as_deref(), Some(ID));
        assert_eq!(normalize_device_id(&ID.replace('I', "1")).as_deref(), Some(ID), "1 se lit I");
        for bad in ["", "7ZSUPCU", &ID[..62], &format!("{ID}A"), &ID.replace('Z', "9"), &ID.replace('Z', "/")] {
            assert_eq!(normalize_device_id(bad), None, "{bad}");
        }
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
    fn a_code_lives_ninety_seconds() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        assert_eq!(pairing.remaining(t0), Some(CODE_LIFE));
        assert_eq!(pairing.judge(t0 + CODE_LIFE, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Accept);
        let mut late = open_at(t0);
        let after = t0 + CODE_LIFE + Duration::from_millis(1);
        assert_eq!(late.judge(after, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Closed);
        assert!(late.remaining(after).is_none());
    }

    #[test]
    fn after_a_rotation_the_new_code_and_the_previous_one_both_work() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        assert!(pairing.rotate(t0 + REFRESH, "ZZZZZZZZZZ".to_string()));
        assert_eq!(pairing.current_code().as_deref(), Some("ZZZZZZZZZZ"));
        assert_eq!(pairing.remaining(t0 + REFRESH), Some(CODE_LIFE), "le plus récent compte");
        // Le téléphone a lu l'ancien juste avant le changement et se connecte 30 s plus tard.
        let later = t0 + REFRESH + Duration::from_secs(30);
        assert_eq!(pairing.judge(later, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Accept);
        let mut fresh = open_at(t0);
        assert!(fresh.rotate(t0 + REFRESH, "ZZZZZZZZZZ".to_string()));
        assert_eq!(fresh.judge(t0 + REFRESH, "tel", "Pixel [NC:ZZZZZZZZZZ]"), Verdict::Accept);
    }

    #[test]
    fn an_old_code_dies_at_the_end_of_its_life_even_while_the_window_rotates() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        let mut now = t0;
        for i in 0..4 {
            now += REFRESH;
            assert!(pairing.rotate(now, format!("ZZZZZZZZZ{}", i + 2)));
        }
        assert!(now.saturating_duration_since(t0) > CODE_LIFE);
        assert_eq!(pairing.judge(now, "photo", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Wrong);
        assert_eq!(pairing.judge(now, "tel", "Pixel [NC:ZZZZZZZZZ5]"), Verdict::Accept);
    }

    #[test]
    fn an_accepted_code_closes_the_window_and_every_code_shown_on_it() {
        let t0 = Instant::now();
        let mut pairing = open_at(t0);
        assert!(pairing.rotate(t0, "ZZZZZZZZZZ".to_string()));
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:ZZZZZZZZZZ]"), Verdict::Accept);
        assert_eq!(pairing.judge(t0, "autre", "Autre [NC:K7Q2M9XPAB]"), Verdict::Closed);
        assert!(!pairing.rotate(t0, "YYYYYYYYYY".to_string()), "une fenêtre servie ne se renouvelle pas");
        assert!(pairing.remaining(t0).is_none());
    }

    #[test]
    fn rotation_needs_an_open_window_and_keeps_the_wrong_attempts() {
        let t0 = Instant::now();
        assert!(!Pairing::default().rotate(t0, "ZZZZZZZZZZ".to_string()));
        let mut pairing = open_at(t0);
        for i in 0..MAX_WRONG {
            assert!(pairing.rotate(t0, new_code()));
            assert_eq!(pairing.judge(t0, &format!("intrus-{i}"), "Intrus [NC:AAAAAAAAAA]"), Verdict::Wrong);
        }
        assert!(!pairing.rotate(t0, "ZZZZZZZZZZ".to_string()), "les essais ne repartent pas de zéro");
        assert_eq!(pairing.judge(t0, "tel", "Pixel [NC:K7Q2M9XPAB]"), Verdict::Closed);
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
