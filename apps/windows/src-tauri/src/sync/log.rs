//! Le journal du moteur (sa sortie) : deux fichiers, `engine.log` et `engine.log.1`, qui ne dépassent jamais
//! `max_bytes` à eux deux (1 Mo). Quand le fichier courant atteint la moitié, il devient `engine.log.1`
//! (l'ancien `.1` disparaît). Même principe que `RotatingLog` de l'Android.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

/// Le code d'appairage voyage dans le nom d'appareil (`Pixel 8 [NC:K7Q2M9XPAB]`) et Syncthing écrit ce nom dans sa
/// sortie à la connexion : le journal (que la page peut afficher) n'en garde jamais le code.
pub fn redact_pairing_codes(bytes: &[u8]) -> Vec<u8> {
    const MARKER: &[u8] = b"[NC:";
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index..].starts_with(MARKER) {
            out.extend_from_slice(MARKER);
            index += MARKER.len();
            while index < bytes.len() && bytes[index].is_ascii_alphanumeric() {
                out.push(b'*');
                index += 1;
            }
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    out
}

pub struct RotatingLog {
    current: PathBuf,
    previous: PathBuf,
    max_bytes: u64,
    inner: Mutex<Inner>,
}

struct Inner {
    out: Option<File>,
    size: u64,
}

impl RotatingLog {
    pub fn new(dir: PathBuf, max_bytes: u64) -> Self {
        Self {
            current: dir.join("engine.log"),
            previous: dir.join("engine.log.1"),
            max_bytes,
            inner: Mutex::new(Inner { out: None, size: 0 }),
        }
    }

    fn open(&self, inner: &mut Inner) -> std::io::Result<()> {
        if let Some(parent) = self.current.parent() {
            fs::create_dir_all(parent)?;
        }
        inner.size = fs::metadata(&self.current).map(|m| m.len()).unwrap_or(0);
        inner.out = Some(OpenOptions::new().create(true).append(true).open(&self.current)?);
        Ok(())
    }

    /// Ne rend jamais d'erreur : un journal qui ne peut pas écrire (disque plein, dossier disparu) perd la
    /// ligne, mais celui qui vide la sortie du processus doit continuer, sinon le moteur se bloque sur son tuyau.
    pub fn write(&self, bytes: &[u8]) {
        let bytes = redact_pairing_codes(bytes);
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        if self.write_locked(&mut inner, &bytes).is_err() {
            inner.out = None;
        }
    }

    fn write_locked(&self, inner: &mut Inner, bytes: &[u8]) -> std::io::Result<()> {
        if inner.out.is_none() {
            self.open(inner)?;
        }
        let half = (self.max_bytes / 2) as usize;
        // Un seul morceau plus gros que la moitié du plafond : on n'en garde que la fin.
        let kept = &bytes[bytes.len().saturating_sub(half)..];
        if inner.size + kept.len() as u64 > half as u64 {
            inner.out = None;
            let _ = fs::remove_file(&self.previous);
            let _ = fs::rename(&self.current, &self.previous);
            self.open(inner)?;
        }
        let out = inner.out.as_mut().expect("ouvert juste au-dessus");
        out.write_all(kept)?;
        out.flush()?;
        inner.size += kept.len() as u64;
        Ok(())
    }

    /// Une ligne de l'app elle-même (« démarrage », « abandon »…), horodatée par l'appelant.
    pub fn note(&self, line: &str) {
        self.write(format!("{line}\n").as_bytes());
    }

    /// Tout le journal, le plus ancien d'abord.
    pub fn read_all(&self) -> String {
        let old = fs::read(&self.previous).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
        let now = fs::read(&self.current).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
        old + &now
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_appends_and_reads_back_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let log = RotatingLog::new(dir.path().to_path_buf(), 1000);
        log.note("un");
        log.note("deux");
        assert_eq!(log.read_all(), "un\ndeux\n");
    }

    #[test]
    fn it_never_exceeds_its_cap_and_keeps_the_newest_lines() {
        let dir = tempfile::tempdir().unwrap();
        let log = RotatingLog::new(dir.path().to_path_buf(), 100);
        for i in 0..50 {
            log.note(&format!("ligne {i:03}"));
        }
        let total = fs::metadata(dir.path().join("engine.log")).unwrap().len()
            + fs::metadata(dir.path().join("engine.log.1")).unwrap().len();
        assert!(total <= 100, "total {total}");
        assert!(log.read_all().ends_with("ligne 049\n"));
        assert!(!log.read_all().contains("ligne 000"));
    }

    #[test]
    fn a_huge_chunk_keeps_only_its_tail() {
        let dir = tempfile::tempdir().unwrap();
        let log = RotatingLog::new(dir.path().to_path_buf(), 100);
        let chunk = vec![b'x'; 500];
        log.write(&chunk);
        log.note("fin");
        assert!(log.read_all().len() <= 100);
        assert!(log.read_all().ends_with("fin\n"));
    }

    #[test]
    fn an_unwritable_log_never_panics() {
        let dir = tempfile::tempdir().unwrap();
        let blocked = dir.path().join("fichier");
        fs::write(&blocked, "x").unwrap();
        // Le « dossier » du journal est un fichier : l'ouverture échoue, l'écriture est perdue sans bruit.
        let log = RotatingLog::new(blocked.join("sous"), 100);
        log.note("perdue");
        assert_eq!(log.read_all(), "");
    }

    #[test]
    fn a_pairing_code_never_reaches_the_journal() {
        let dir = tempfile::tempdir().unwrap();
        let log = RotatingLog::new(dir.path().to_path_buf(), 10_000);
        log.write(b"INF New device connection (remote.name=\"Pixel 8 [NC:Q67C64KRPE]\" log.pkg=model)\n");
        log.note("nom [NC:abcdefghij] fin");
        let text = log.read_all();
        assert!(!text.contains("Q67C64KRPE") && !text.contains("abcdefghij"), "{text}");
        assert!(text.contains("Pixel 8 [NC:**********]") && text.contains("log.pkg=model"), "le reste de la ligne est intact : {text}");
    }
}
