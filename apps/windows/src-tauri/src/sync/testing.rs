//! Un transport pour les tests : réponses fixées d'avance, liste des requêtes reçues.

use super::api::{HttpResult, HttpTransport};
use std::sync::Mutex;
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct Call {
    pub method: String,
    pub path: String,
    pub body: Option<String>,
}

#[derive(Default)]
pub struct FakeTransport {
    pub calls: Mutex<Vec<Call>>,
    answers: Mutex<Vec<(String, u16, String)>>,
    once: Mutex<Vec<(String, u16, String)>>,
}

impl FakeTransport {
    /// `key` = « MÉTHODE chemin » exact ; une clé qui finit par `*` répond à tout chemin qui commence par elle.
    /// La dernière réponse posée pour une même clé l'emporte.
    pub fn answer(&self, key: &str, body: &str) {
        self.answer_code(key, 200, body);
    }

    pub fn answer_code(&self, key: &str, code: u16, body: &str) {
        self.answers.lock().unwrap().push((key.to_string(), code, body.to_string()));
    }

    /// Une réponse consommée au premier appel qui correspond (avant les réponses permanentes) : pour une lecture qui change.
    pub fn answer_once(&self, key: &str, body: &str) {
        self.answer_code_once(key, 200, body);
    }

    pub fn answer_code_once(&self, key: &str, code: u16, body: &str) {
        self.once.lock().unwrap().push((key.to_string(), code, body.to_string()));
    }

    pub fn sent(&self, method: &str, path: &str) -> Option<String> {
        self.calls
            .lock()
            .unwrap()
            .iter()
            .rev()
            .find(|c| c.method == method && c.path == path)
            .and_then(|c| c.body.clone())
    }

    pub fn count(&self, method: &str, path_prefix: &str) -> usize {
        self.calls.lock().unwrap().iter().filter(|c| c.method == method && c.path.starts_with(path_prefix)).count()
    }
}

impl HttpTransport for FakeTransport {
    fn request(&self, method: &str, path: &str, body: Option<&str>, _timeout: Duration) -> Result<HttpResult, String> {
        self.calls.lock().unwrap().push(Call {
            method: method.to_string(),
            path: path.to_string(),
            body: body.map(str::to_string),
        });
        let key = format!("{method} {path}");
        {
            let mut once = self.once.lock().unwrap();
            if let Some(index) = once.iter().position(|(k, _, _)| *k == key) {
                let (_, code, text) = once.remove(index);
                return Ok(HttpResult { code, body: text });
            }
        }
        let answers = self.answers.lock().unwrap();
        let found = answers
            .iter()
            .rev()
            .find(|(k, _, _)| *k == key)
            .or_else(|| answers.iter().rev().find(|(k, _, _)| k.ends_with('*') && key.starts_with(&k[..k.len() - 1])));
        match found {
            Some((_, code, text)) => Ok(HttpResult { code: *code, body: text.clone() }),
            None => Ok(HttpResult { code: 404, body: format!("pas de réponse prévue pour {key}") }),
        }
    }
}

/// Le vrai `syncthing.exe` de la version épinglée (`scripts/fetch-syncthing-windows.mjs` donne son chemin).
pub fn real_binary() -> Option<std::path::PathBuf> {
    let found = std::env::var_os("SYNCTHING_BINARY").map(std::path::PathBuf::from).filter(|p| p.is_file());
    // En CI le moteur réel est toujours fourni : son absence serait un test sauté en silence.
    assert!(found.is_some() || std::env::var_os("CI").is_none(), "SYNCTHING_BINARY manque en CI");
    if found.is_none() {
        eprintln!("SKIP : SYNCTHING_BINARY non défini (voir scripts/fetch-syncthing-windows.mjs)");
    }
    found
}
