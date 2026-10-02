//! Le client de l'API REST de Syncthing v2 (chemins relus dans `lib/api/api.go` de la v2.1.5).
//! Bloquant : il tourne toujours hors du fil de l'interface.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;
use std::time::Duration;

pub struct HttpResult {
    pub code: u16,
    pub body: String,
}

/// Le transport HTTP. `Err` = pas de réponse du tout (moteur éteint, délai dépassé).
pub trait HttpTransport: Send + Sync {
    fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<&str>,
        read_timeout: Duration,
    ) -> Result<HttpResult, String>;
}

/// HTTP sur `127.0.0.1` ; la clé d'API est ajoutée à chaque requête.
pub struct UreqTransport {
    base: String,
    key: String,
}

impl UreqTransport {
    pub fn new(address: &str, key: &str) -> Self {
        Self { base: format!("http://{address}"), key: key.to_string() }
    }
}

impl HttpTransport for UreqTransport {
    fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<&str>,
        read_timeout: Duration,
    ) -> Result<HttpResult, String> {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(2))
            .timeout_read(read_timeout)
            .timeout_write(Duration::from_secs(5))
            .build();
        let request = agent
            .request(method, &format!("{}{}", self.base, path))
            .set("X-API-Key", &self.key);
        let outcome = match body {
            Some(text) => request.set("Content-Type", "application/json").send_string(text),
            None => request.call(),
        };
        match outcome {
            Ok(response) => {
                let code = response.status();
                let body = response.into_string().map_err(|e| e.to_string())?;
                Ok(HttpResult { code, body })
            }
            Err(ureq::Error::Status(code, response)) => {
                Ok(HttpResult { code, body: response.into_string().unwrap_or_default() })
            }
            Err(ureq::Error::Transport(transport)) => Err(transport.to_string()),
        }
    }
}

/// `code` = 0 : le moteur n'a pas répondu.
#[derive(Debug, Clone, PartialEq)]
pub struct ApiError {
    pub code: u16,
    pub message: String,
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ApiError {}

pub type ApiResult<T> = Result<T, ApiError>;

#[derive(Debug, Clone, PartialEq)]
pub struct ConfiguredDevice {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ConfiguredFolder {
    pub id: String,
    pub label: String,
    pub path: String,
    pub device_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PendingDevice {
    pub id: String,
    pub name: String,
    pub address: String,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct FolderState {
    pub state: String,
    pub need_files: u64,
    pub need_bytes: u64,
    pub error: String,
}

/// Encodage d'une valeur de chemin ou de requête : tout ce qui n'est pas « non réservé » est échappé.
pub fn urlencode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => out.push(byte as char),
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

#[derive(Clone)]
pub struct SyncthingApi {
    transport: Arc<dyn HttpTransport>,
}

fn text(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn folder_from(value: &Value) -> ConfiguredFolder {
    ConfiguredFolder {
        id: text(value, "id"),
        label: text(value, "label"),
        path: text(value, "path"),
        device_ids: value
            .get("devices")
            .and_then(Value::as_array)
            .map(|items| items.iter().map(|d| text(d, "deviceID")).collect())
            .unwrap_or_default(),
    }
}

impl SyncthingApi {
    pub fn new(transport: Arc<dyn HttpTransport>) -> Self {
        Self { transport }
    }

    fn call(&self, method: &str, path: &str, body: Option<&Value>, timeout_ms: u64) -> ApiResult<String> {
        let payload = body.map(Value::to_string);
        let result = self
            .transport
            .request(method, path, payload.as_deref(), Duration::from_millis(timeout_ms))
            .map_err(|e| ApiError { code: 0, message: format!("Le moteur ne répond pas : {e}") })?;
        if !(200..300).contains(&result.code) {
            let excerpt: String = result.body.chars().take(200).collect();
            return Err(ApiError {
                code: result.code,
                message: format!("Syncthing a refusé {method} {path} ({}) : {excerpt}", result.code),
            });
        }
        Ok(result.body)
    }

    pub(crate) fn get(&self, path: &str) -> ApiResult<Value> {
        let body = self.call("GET", path, None, 15_000)?;
        serde_json::from_str(&body)
            .map_err(|e| ApiError { code: 0, message: format!("Réponse illisible pour {path} : {e}") })
    }

    /// Vrai quand le moteur répond (`/rest/noauth/health`). Ne lève jamais.
    pub fn is_healthy(&self) -> bool {
        matches!(
            self.transport.request("GET", "/rest/noauth/health", None, Duration::from_secs(3)),
            Ok(HttpResult { code: 200, .. })
        )
    }

    /// L'identifiant de CET appareil.
    pub fn my_id(&self) -> ApiResult<String> {
        Ok(text(&self.get("/rest/system/status")?, "myID"))
    }

    pub fn patch_options(&self, options: &Value) -> ApiResult<()> {
        self.call("PATCH", "/rest/config/options", Some(options), 15_000).map(|_| ())
    }

    pub fn devices(&self) -> ApiResult<Vec<ConfiguredDevice>> {
        let list = self.get("/rest/config/devices")?;
        Ok(list
            .as_array()
            .map(|items| {
                items.iter().map(|d| ConfiguredDevice { id: text(d, "deviceID"), name: text(d, "name") }).collect()
            })
            .unwrap_or_default())
    }

    pub fn put_device(&self, device: &Value) -> ApiResult<()> {
        let id = text(device, "deviceID");
        self.call("PUT", &format!("/rest/config/devices/{}", urlencode(&id)), Some(device), 15_000).map(|_| ())
    }

    pub fn remove_device(&self, id: &str) -> ApiResult<()> {
        self.call("DELETE", &format!("/rest/config/devices/{}", urlencode(id)), None, 15_000).map(|_| ())
    }

    pub fn folders(&self) -> ApiResult<Vec<ConfiguredFolder>> {
        let list = self.get("/rest/config/folders")?;
        Ok(list.as_array().map(|items| items.iter().map(folder_from).collect()).unwrap_or_default())
    }

    /// La configuration brute d'un dossier : la reprise la sauvegarde pour pouvoir le rendre tel quel.
    pub fn folder_config(&self, id: &str) -> ApiResult<Value> {
        self.get(&format!("/rest/config/folders/{}", urlencode(id)))
    }

    pub fn put_folder(&self, folder: &Value) -> ApiResult<()> {
        let id = text(folder, "id");
        self.call("PUT", &format!("/rest/config/folders/{}", urlencode(&id)), Some(folder), 15_000).map(|_| ())
    }

    pub fn set_folder_devices(&self, folder_id: &str, device_ids: &[String]) -> ApiResult<()> {
        let body = json!({ "devices": super::config::folder_devices(device_ids) });
        self.call("PATCH", &format!("/rest/config/folders/{}", urlencode(folder_id)), Some(&body), 15_000)
            .map(|_| ())
    }

    pub fn remove_folder(&self, id: &str) -> ApiResult<()> {
        self.call("DELETE", &format!("/rest/config/folders/{}", urlencode(id)), None, 15_000).map(|_| ())
    }

    /// Les appareils inconnus qui ont tenté de se connecter ; `name` est celui que l'appareil se donne.
    pub fn pending_devices(&self) -> ApiResult<Vec<PendingDevice>> {
        let map = self.get("/rest/cluster/pending/devices")?;
        Ok(map
            .as_object()
            .map(|entries| {
                entries
                    .iter()
                    .map(|(id, v)| PendingDevice { id: id.clone(), name: text(v, "name"), address: text(v, "address") })
                    .collect()
            })
            .unwrap_or_default())
    }

    pub fn dismiss_pending_device(&self, id: &str) -> ApiResult<()> {
        self.call("DELETE", &format!("/rest/cluster/pending/devices?device={}", urlencode(id)), None, 15_000)
            .map(|_| ())
    }

    /// Pour chaque appareil : connecté ou non (`/rest/system/connections`).
    pub fn connections(&self) -> ApiResult<HashMap<String, bool>> {
        let value = self.get("/rest/system/connections")?;
        Ok(value
            .get("connections")
            .and_then(Value::as_object)
            .map(|m| {
                m.iter()
                    .map(|(id, c)| (id.clone(), c.get("connected").and_then(Value::as_bool).unwrap_or(false)))
                    .collect()
            })
            .unwrap_or_default())
    }

    /// Dernière connexion de chaque appareil (texte ISO), `None` s'il ne s'est jamais connecté.
    pub fn last_seen(&self) -> ApiResult<HashMap<String, Option<String>>> {
        let value = self.get("/rest/stats/device")?;
        Ok(value
            .as_object()
            .map(|m| {
                m.iter()
                    .map(|(id, s)| {
                        let seen = text(s, "lastSeen");
                        let never = seen.is_empty() || seen.starts_with("1970-") || seen.starts_with("0001-");
                        (id.clone(), if never { None } else { Some(seen) })
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    pub fn folder_state(&self, folder_id: &str) -> ApiResult<FolderState> {
        let v = self.get(&format!("/rest/db/status?folder={}", urlencode(folder_id)))?;
        Ok(FolderState {
            state: text(&v, "state"),
            need_files: v.get("needFiles").and_then(Value::as_u64).unwrap_or(0),
            need_bytes: v.get("needBytes").and_then(Value::as_u64).unwrap_or(0),
            error: text(&v, "error"),
        })
    }

    /// Arrêt propre. Le moteur peut couper la connexion avant de répondre : ce n'est pas une erreur.
    pub fn shutdown(&self) -> ApiResult<()> {
        match self.call("POST", "/rest/system/shutdown", None, 3_000) {
            Err(e) if e.code != 0 => Err(e),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::testing::FakeTransport;

    fn api(fake: &Arc<FakeTransport>) -> SyncthingApi {
        SyncthingApi::new(fake.clone())
    }

    #[test]
    fn urlencode_escapes_everything_but_unreserved() {
        assert_eq!(urlencode("AB-c_1.~"), "AB-c_1.~");
        assert_eq!(urlencode("a b/é"), "a%20b%2F%C3%A9");
    }

    #[test]
    fn pending_devices_read_the_name_the_device_presents() {
        let fake = Arc::new(FakeTransport::default());
        fake.answer(
            "GET /rest/cluster/pending/devices",
            r#"{"ABC":{"time":"2026-10-02T18:23:21Z","name":"Pixel [NC:K7Q2M9XPAB]","address":"127.0.0.1:55148"}}"#,
        );
        let pending = api(&fake).pending_devices().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].id, "ABC");
        assert_eq!(pending[0].name, "Pixel [NC:K7Q2M9XPAB]");
    }

    #[test]
    fn a_refusal_carries_the_code_and_an_excerpt() {
        let fake = Arc::new(FakeTransport::default());
        fake.answer_code("PUT /rest/config/folders/f1", 400, "bad folder");
        let error = api(&fake).put_folder(&json!({"id": "f1"})).unwrap_err();
        assert_eq!(error.code, 400);
        assert!(error.message.contains("bad folder"));
    }

    #[test]
    fn folders_list_their_devices() {
        let fake = Arc::new(FakeTransport::default());
        fake.answer(
            "GET /rest/config/folders",
            r#"[{"id":"f1","label":"Neo","path":"C:\\Neo","devices":[{"deviceID":"A"},{"deviceID":"B"}]}]"#,
        );
        let folders = api(&fake).folders().unwrap();
        assert_eq!(folders[0].path, "C:\\Neo");
        assert_eq!(folders[0].device_ids, vec!["A", "B"]);
    }

    #[test]
    fn shutdown_tolerates_a_dropped_connection_but_not_a_refusal() {
        let fake = Arc::new(FakeTransport::default());
        fake.answer_code("POST /rest/system/shutdown", 403, "no");
        assert!(api(&fake).shutdown().is_err());
        let fake = Arc::new(FakeTransport::default());
        fake.answer("POST /rest/system/shutdown", "{}");
        assert!(api(&fake).shutdown().is_ok());
    }

    #[test]
    fn last_seen_maps_epoch_zero_to_never() {
        let fake = Arc::new(FakeTransport::default());
        fake.answer(
            "GET /rest/stats/device",
            r#"{"A":{"lastSeen":"1970-01-01T00:00:00Z"},"B":{"lastSeen":"2026-10-02T10:00:00Z"}}"#,
        );
        let seen = api(&fake).last_seen().unwrap();
        assert_eq!(seen["A"], None);
        assert_eq!(seen["B"].as_deref(), Some("2026-10-02T10:00:00Z"));
    }
}
