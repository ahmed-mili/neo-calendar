//! Un Syncthing installé à côté de l'app : le détecter, et lui reprendre le seul dossier Neo Calendar.
//!
//! Règles d'Ahmed : jamais deux synchros sur le même dossier ; la détection ne repose JAMAIS sur la présence de
//! `.stfolder` (un marqueur orphelin reste quand on retire un partage : ce n'est pas un conflit) mais sur la
//! configuration du Syncthing installé ; la reprise se fait après confirmation, avec sauvegarde de sa
//! configuration, et ne retire QUE le dossier Neo Calendar (ses autres dossiers et appareils ne sont pas touchés).

use super::api::{SyncthingApi, UreqTransport};
use super::setup::same_path;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq)]
pub struct InstalledFolder {
    pub id: String,
    pub label: String,
    pub path: String,
    pub device_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct InstalledConfig {
    pub gui_address: String,
    pub gui_tls: bool,
    pub api_key: String,
    pub folders: Vec<InstalledFolder>,
    /// Les appareils déclarés (identifiant, nom), le Syncthing installé compris.
    pub devices: Vec<(String, String)>,
}

/// `%LOCALAPPDATA%\Syncthing\config.xml`.
pub fn config_path(local_app_data: &Path) -> PathBuf {
    local_app_data.join("Syncthing").join("config.xml")
}

fn attribute(element: &quick_xml::events::BytesStart<'_>, name: &str) -> Option<String> {
    element
        .attributes()
        .flatten()
        .find(|a| a.key.as_ref() == name.as_bytes())
        .and_then(|a| a.normalized_value(quick_xml::XmlVersion::Implicit1_0).ok())
        .map(|v| v.into_owned())
}

/// Lit la configuration d'un Syncthing (lecture seule). Seuls les éléments de premier niveau comptent : les
/// `<folder>` et `<device>` du bloc `<defaults>` sont des modèles, pas des partages.
pub fn parse_config(xml: &str) -> Result<InstalledConfig, String> {
    let mut reader = Reader::from_str(xml);
    let mut config = InstalledConfig::default();
    let mut path: Vec<String> = Vec::new();
    let mut saw_configuration = false;
    loop {
        let event = reader.read_event().map_err(|e| format!("config.xml illisible : {e}"))?;
        match event {
            Event::Eof => break,
            Event::Start(ref e) | Event::Empty(ref e) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).into_owned();
                let here: Vec<&str> = path.iter().map(String::as_str).chain([name.as_str()]).collect();
                match here.as_slice() {
                    ["configuration"] => saw_configuration = true,
                    ["configuration", "gui"] => config.gui_tls = attribute(e, "tls").as_deref() == Some("true"),
                    ["configuration", "folder"] => config.folders.push(InstalledFolder {
                        id: attribute(e, "id").unwrap_or_default(),
                        label: attribute(e, "label").unwrap_or_default(),
                        path: attribute(e, "path").unwrap_or_default(),
                        device_ids: Vec::new(),
                    }),
                    ["configuration", "folder", "device"] => {
                        if let (Some(folder), Some(id)) = (config.folders.last_mut(), attribute(e, "id")) {
                            folder.device_ids.push(id);
                        }
                    }
                    ["configuration", "device"] => config
                        .devices
                        .push((attribute(e, "id").unwrap_or_default(), attribute(e, "name").unwrap_or_default())),
                    _ => {}
                }
                if matches!(event, Event::Start(_)) {
                    path.push(name);
                }
            }
            Event::End(_) => {
                path.pop();
            }
            Event::Text(ref t) => {
                let text = t.decode().map(|c| c.trim().to_string()).unwrap_or_default();
                match path.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
                    ["configuration", "gui", "address"] => config.gui_address = text,
                    ["configuration", "gui", "apikey"] => config.api_key = text,
                    _ => {}
                }
            }
            _ => {}
        }
    }
    if !saw_configuration {
        return Err("ce n'est pas une configuration Syncthing".to_string());
    }
    Ok(config)
}

/// `None` quand aucun Syncthing n'est installé pour cet utilisateur.
pub fn read_config(local_app_data: &Path) -> Result<Option<InstalledConfig>, String> {
    let path = config_path(local_app_data);
    if !path.is_file() {
        return Ok(None);
    }
    let xml = fs::read_to_string(&path).map_err(|e| format!("Lecture de {} impossible : {e}", path.display()))?;
    parse_config(&xml).map(Some)
}

impl InstalledConfig {
    /// Le dossier de ce Syncthing qui est le dossier de données de l'app, s'il y en a un.
    pub fn sharing(&self, data_folder: &str) -> Option<&InstalledFolder> {
        self.folders.iter().find(|f| same_path(&f.path, data_folder))
    }

    /// L'adresse où joindre l'interface : une adresse d'écoute « générique » (`0.0.0.0`, `[::]`, hôte vide) n'est pas
    /// une adresse où se connecter, on passe par la boucle locale.
    pub fn connect_address(&self) -> String {
        let address = self.gui_address.trim();
        let (host, port) = address.rsplit_once(':').unwrap_or(("", address));
        if matches!(host, "" | "0.0.0.0" | "[::]" | "::") {
            format!("127.0.0.1:{port}")
        } else {
            address.to_string()
        }
    }

    pub fn api(&self) -> SyncthingApi {
        SyncthingApi::new(Arc::new(UreqTransport::new(&self.connect_address(), &self.api_key)))
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Detection {
    /// Pas de Syncthing installé.
    NotInstalled,
    /// Un Syncthing est installé mais ne partage pas le dossier de données (un `.stfolder` orphelin n'y change rien).
    NotSharing,
    /// Il partage le dossier : le moteur de l'app ne démarre pas dessus. `running` : son API répond, la reprise est possible.
    Shares { folder_id: String, label: String, running: bool, tls: bool, other_folders: usize },
}

pub fn detect(config: Option<&InstalledConfig>, data_folder: &str, running: &dyn Fn(&InstalledConfig) -> bool) -> Detection {
    let Some(config) = config else {
        return Detection::NotInstalled;
    };
    match config.sharing(data_folder) {
        None => Detection::NotSharing,
        Some(folder) => Detection::Shares {
            folder_id: folder.id.clone(),
            label: folder.label.clone(),
            running: !config.gui_tls && running(config),
            tls: config.gui_tls,
            other_folders: config.folders.len() - 1,
        },
    }
}

/// Ce qu'il faut garder pour rendre le dossier : sa configuration brute, les appareils qui le partageaient, la sauvegarde.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Takeover {
    pub folder_id: String,
    pub folder: Value,
    /// Les appareils qui partageaient le dossier (identifiant, nom), sans le Syncthing installé lui-même.
    pub devices: Vec<(String, String)>,
    pub old_device_id: String,
    pub backup_path: String,
    pub taken_at: String,
}

/// Étapes 1 à 3 de la reprise, côté Syncthing installé : sauvegarde de sa configuration, lecture du dossier, retrait
/// de CE dossier seulement. Rien ne touche au moteur de l'app. Si le retrait n'a pas l'effet attendu (un autre dossier
/// a disparu aussi), le dossier est remis et la reprise échoue.
pub fn withdraw_folder(
    config: &InstalledConfig,
    old: &SyncthingApi,
    config_file: &Path,
    backup_dir: &Path,
    stamp: &str,
    data_folder: &str,
) -> Result<Takeover, String> {
    if config.gui_tls {
        return Err("L'interface de ce Syncthing est en HTTPS : l'app ne peut pas la piloter. Retirez le dossier Neo Calendar dans Syncthing, puis relancez la détection.".to_string());
    }
    let folder = config.sharing(data_folder).ok_or("Ce Syncthing ne partage pas le dossier de Neo Calendar.")?;

    fs::create_dir_all(backup_dir).map_err(|e| format!("Sauvegarde impossible : {e}"))?;
    let backup = backup_dir.join(format!("config.xml.avant-reprise-{stamp}"));
    fs::copy(config_file, &backup).map_err(|e| format!("Sauvegarde de la configuration impossible : {e}"))?;
    let copy = fs::read_to_string(&backup).map_err(|e| format!("Sauvegarde illisible : {e}"))?;
    if parse_config(&copy).map(|c| c.folders.len()) != Ok(config.folders.len()) {
        return Err("La sauvegarde de la configuration n'est pas conforme : reprise annulée.".to_string());
    }

    let raw = old.folder_config(&folder.id).map_err(|e| e.to_string())?;
    let old_device_id = old.my_id().map_err(|e| e.to_string())?;
    let names = old.devices().map_err(|e| e.to_string())?;
    let before: Vec<String> = old.folders().map_err(|e| e.to_string())?.into_iter().map(|f| f.id).collect();

    let takeover = Takeover {
        folder_id: folder.id.clone(),
        folder: raw,
        devices: folder
            .device_ids
            .iter()
            .filter(|id| **id != old_device_id)
            .map(|id| (id.clone(), names.iter().find(|d| &d.id == id).map(|d| d.name.clone()).unwrap_or_default()))
            .collect(),
        old_device_id,
        backup_path: backup.to_string_lossy().into_owned(),
        taken_at: stamp.to_string(),
    };

    old.remove_folder(&folder.id).map_err(|e| e.to_string())?;
    let after: Vec<String> = old.folders().map_err(|e| e.to_string())?.into_iter().map(|f| f.id).collect();
    let expected: Vec<String> = before.iter().filter(|id| **id != folder.id).cloned().collect();
    if after != expected {
        let _ = old.put_folder(&takeover.folder);
        return Err("Le retrait du dossier a touché autre chose que Neo Calendar : le dossier a été remis, reprise annulée.".to_string());
    }
    Ok(takeover)
}

/// Remet le dossier dans le Syncthing installé, tel qu'il était (« Rendre le dossier à Syncthing »).
pub fn restore_folder(old: &SyncthingApi, takeover: &Takeover) -> Result<(), String> {
    old.put_folder(&takeover.folder).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::testing::FakeTransport;

    const CONFIG: &str = r#"<configuration version="52">
    <folder id="neo-old" label="Neo Calendar" path="C:\Neo Calendar" type="sendreceive">
        <device id="OLDPC" introducedBy=""></device>
        <device id="LAPTOP" introducedBy=""></device>
        <device id="PHONE" introducedBy=""></device>
    </folder>
    <folder id="vault" label="Coffre" path="C:\Vaults\Perso" type="sendreceive">
        <device id="OLDPC" introducedBy=""></device>
        <device id="LAPTOP" introducedBy=""></device>
    </folder>
    <device id="OLDPC" name="DESKTOP-1" compression="metadata"><address>dynamic</address></device>
    <device id="LAPTOP" name="Laptop d'Ahmed" compression="metadata"><address>dynamic</address></device>
    <device id="PHONE" name="Pixel" compression="metadata"><address>dynamic</address></device>
    <gui enabled="true" tls="false"><address>127.0.0.1:8384</address><apikey>CLE</apikey></gui>
    <defaults>
        <folder id="" label="" path="~"><device id="OLDPC"></device></folder>
        <device id="" compression="metadata"></device>
    </defaults>
</configuration>"#;

    #[test]
    fn the_installed_config_is_read_without_the_defaults_block() {
        let config = parse_config(CONFIG).unwrap();
        assert_eq!(config.folders.len(), 2, "les modèles de <defaults> ne sont pas des partages");
        assert_eq!(config.folders[0].device_ids, vec!["OLDPC", "LAPTOP", "PHONE"]);
        assert_eq!(config.devices.len(), 3);
        assert_eq!(config.devices[1], ("LAPTOP".to_string(), "Laptop d'Ahmed".to_string()));
        assert_eq!((config.gui_address.as_str(), config.api_key.as_str(), config.gui_tls), ("127.0.0.1:8384", "CLE", false));
    }

    #[test]
    fn something_else_than_a_config_is_refused() {
        assert!(parse_config("<html></html>").is_err());
    }

    #[test]
    fn sharing_is_decided_on_the_config_path_not_on_the_filesystem() {
        let config = parse_config(CONFIG).unwrap();
        assert_eq!(config.sharing("c:/neo calendar/").unwrap().id, "neo-old");
        assert!(config.sharing("C:\\Vaults").is_none());
    }

    #[test]
    fn an_orphan_stfolder_marker_is_not_a_conflict() {
        // Ahmed a retiré le partage dans son Syncthing : `.stfolder` reste, la configuration ne partage plus rien.
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join(".stfolder")).unwrap();
        let only_vaults = CONFIG.replace(r#"path="C:\Neo Calendar""#, r#"path="C:\Ailleurs""#);
        let config = parse_config(&only_vaults).unwrap();
        let data_folder = dir.path().to_string_lossy().into_owned();
        assert_eq!(detect(Some(&config), &data_folder, &|_| true), Detection::NotSharing);
    }

    #[test]
    fn detection_covers_every_case() {
        let config = parse_config(CONFIG).unwrap();
        assert_eq!(detect(None, "C:\\Neo Calendar", &|_| true), Detection::NotInstalled);
        assert_eq!(detect(Some(&config), "D:\\Autre", &|_| true), Detection::NotSharing);
        assert_eq!(
            detect(Some(&config), "C:\\Neo Calendar", &|_| false),
            Detection::Shares { folder_id: "neo-old".into(), label: "Neo Calendar".into(), running: false, tls: false, other_folders: 1 }
        );
        let tls = parse_config(&CONFIG.replace(r#"tls="false""#, r#"tls="true""#)).unwrap();
        let Detection::Shares { running, tls: is_tls, .. } = detect(Some(&tls), "C:\\Neo Calendar", &|_| true) else {
            panic!("doit partager")
        };
        assert!(is_tls && !running, "en HTTPS la reprise automatique n'est pas proposée");
    }

    fn old_syncthing() -> (Arc<FakeTransport>, SyncthingApi) {
        let fake = Arc::new(FakeTransport::default());
        fake.answer("GET /rest/system/status", r#"{"myID":"OLDPC"}"#);
        fake.answer("GET /rest/config/devices", r#"[{"deviceID":"OLDPC","name":"DESKTOP-1"},{"deviceID":"LAPTOP","name":"Laptop d'Ahmed"},{"deviceID":"PHONE","name":"Pixel"}]"#);
        fake.answer("GET /rest/config/folders/neo-old", r#"{"id":"neo-old","label":"Neo Calendar","path":"C:\\Neo Calendar","devices":[{"deviceID":"OLDPC"},{"deviceID":"LAPTOP"},{"deviceID":"PHONE"}]}"#);
        let api = SyncthingApi::new(fake.clone());
        (fake, api)
    }

    fn setup_files() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("config.xml");
        fs::write(&file, CONFIG).unwrap();
        (dir, file)
    }

    #[test]
    fn withdrawing_backs_up_first_then_removes_only_the_neo_calendar_folder() {
        let (fake, api) = old_syncthing();
        let (dir, file) = setup_files();
        let config = parse_config(CONFIG).unwrap();
        fake.answer_once("GET /rest/config/folders", r#"[{"id":"neo-old"},{"id":"vault"}]"#);
        fake.answer_once("GET /rest/config/folders", r#"[{"id":"vault"}]"#);
        fake.answer("DELETE /rest/config/folders/neo-old", "");

        let takeover = withdraw_folder(&config, &api, &file, &dir.path().join("sauvegardes"), "20261002-190000", "C:\\Neo Calendar").unwrap();

        let backup = dir.path().join("sauvegardes").join("config.xml.avant-reprise-20261002-190000");
        assert_eq!(fs::read_to_string(backup).unwrap(), CONFIG, "sauvegarde identique à l'original");
        assert_eq!(takeover.folder_id, "neo-old");
        assert_eq!(takeover.devices, vec![("LAPTOP".to_string(), "Laptop d'Ahmed".to_string()), ("PHONE".to_string(), "Pixel".to_string())]);
        assert_eq!(takeover.old_device_id, "OLDPC");
        let calls = fake.calls.lock().unwrap();
        let deletes: Vec<&str> = calls.iter().filter(|c| c.method == "DELETE").map(|c| c.path.as_str()).collect();
        assert_eq!(deletes, vec!["/rest/config/folders/neo-old"], "un seul retrait, et pas celui des coffres");
        assert!(calls.iter().all(|c| !c.path.contains("/devices/") || c.method == "GET"), "aucun appareil retiré ou modifié");
    }

    #[test]
    fn if_the_removal_touches_something_else_the_folder_is_put_back() {
        let (fake, api) = old_syncthing();
        let (dir, file) = setup_files();
        let config = parse_config(CONFIG).unwrap();
        fake.answer_once("GET /rest/config/folders", r#"[{"id":"neo-old"},{"id":"vault"}]"#);
        fake.answer_once("GET /rest/config/folders", r#"[]"#);
        fake.answer("DELETE /rest/config/folders/neo-old", "");
        fake.answer("PUT /rest/config/folders/neo-old", "");
        let error = withdraw_folder(&config, &api, &file, dir.path(), "x", "C:\\Neo Calendar").unwrap_err();
        assert!(error.contains("remis"));
        assert_eq!(fake.count("PUT", "/rest/config/folders/neo-old"), 1);
    }

    #[test]
    fn a_failed_backup_stops_everything_before_any_removal() {
        let (fake, api) = old_syncthing();
        let config = parse_config(CONFIG).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("absent.xml");
        assert!(withdraw_folder(&config, &api, &missing, dir.path(), "x", "C:\\Neo Calendar").is_err());
        assert_eq!(fake.count("DELETE", "/rest"), 0);
    }

    #[test]
    fn a_https_gui_is_refused_with_an_explanation() {
        let (fake, api) = old_syncthing();
        let (dir, file) = setup_files();
        let tls = parse_config(&CONFIG.replace(r#"tls="false""#, r#"tls="true""#)).unwrap();
        let error = withdraw_folder(&tls, &api, &file, dir.path(), "x", "C:\\Neo Calendar").unwrap_err();
        assert!(error.contains("HTTPS"));
        assert_eq!(fake.calls.lock().unwrap().len(), 0);
    }

    #[test]
    fn giving_back_puts_the_saved_folder_into_the_installed_syncthing() {
        let (fake, api) = old_syncthing();
        fake.answer("PUT /rest/config/folders/neo-old", "");
        let takeover = Takeover {
            folder_id: "neo-old".into(),
            folder: serde_json::json!({"id": "neo-old", "path": "C:\\Neo Calendar"}),
            devices: vec![],
            old_device_id: "OLDPC".into(),
            backup_path: String::new(),
            taken_at: String::new(),
        };
        restore_folder(&api, &takeover).unwrap();
        assert!(fake.sent("PUT", "/rest/config/folders/neo-old").unwrap().contains("C:\\\\Neo Calendar"));
    }

    #[test]
    fn a_wildcard_gui_address_is_reached_on_loopback() {
        for (address, expected) in [
            ("0.0.0.0:8384", "127.0.0.1:8384"),
            (":8384", "127.0.0.1:8384"),
            ("[::]:8384", "127.0.0.1:8384"),
            ("127.0.0.1:9000", "127.0.0.1:9000"),
        ] {
            let config = InstalledConfig { gui_address: address.to_string(), ..Default::default() };
            assert_eq!(config.connect_address(), expected, "{address}");
        }
    }
}
