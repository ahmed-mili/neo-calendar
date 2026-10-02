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
    ///
    /// `None` pour toute autre adresse (IP du réseau, nom d'hôte, `unix://`) : la clé d'API de l'utilisateur ne part
    /// jamais ailleurs que sur cette machine, et l'interface n'est alors pas pilotable.
    pub fn connect_address(&self) -> Option<String> {
        let address = self.gui_address.trim();
        let (host, port) = address.rsplit_once(':').unwrap_or(("", address));
        match host {
            "" | "0.0.0.0" | "[::]" | "::" => Some(format!("127.0.0.1:{port}")),
            "127.0.0.1" | "localhost" | "[::1]" => Some(address.to_string()),
            _ => None,
        }
    }

    /// Pourquoi l'interface de ce Syncthing ne peut pas être pilotée par l'app, quand c'est une affaire de configuration.
    pub fn unreachable_reason(&self) -> Option<String> {
        if self.gui_tls {
            return Some("L'interface de ce Syncthing est en HTTPS : l'app ne peut pas la piloter.".to_string());
        }
        if self.connect_address().is_none() {
            return Some(format!(
                "L'interface de ce Syncthing n'écoute pas sur la machine locale ({}) : l'app ne la pilote pas.",
                self.gui_address.trim()
            ));
        }
        None
    }

    pub fn api(&self) -> Result<SyncthingApi, String> {
        let address = self
            .connect_address()
            .ok_or_else(|| self.unreachable_reason().unwrap_or_else(|| "Interface du Syncthing installé injoignable.".to_string()))?;
        Ok(SyncthingApi::new(Arc::new(UreqTransport::new(&address, &self.api_key))))
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

    let backup = write_backup(config_file, backup_dir, stamp)?;
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

    // Tout ce qui suit le `DELETE` passe par ici : sur TOUTE erreur (un retrait qui expire alors que Syncthing l'a traité,
    // une relecture qui échoue, un autre dossier emporté), le dossier est remis (`PUT`, sans effet s'il est encore là).
    let removal = || -> Result<(), String> {
        old.remove_folder(&folder.id).map_err(|e| format!("Le retrait du dossier a échoué ({e})."))?;
        let after: Vec<String> = old
            .folders()
            .map_err(|e| format!("Le dossier n'a pas pu être relu après le retrait ({e})."))?
            .into_iter()
            .map(|f| f.id)
            .collect();
        let expected: Vec<String> = before.iter().filter(|id| **id != folder.id).cloned().collect();
        if after != expected {
            return Err("Le retrait du dossier a touché autre chose que Neo Calendar.".to_string());
        }
        Ok(())
    };
    if let Err(reason) = removal() {
        return Err(put_back(old, &takeover, &reason));
    }
    Ok(takeover)
}

/// Remet le dossier et dit la vérité sur le résultat : remis, ou pas remis (avec le chemin de la sauvegarde).
fn put_back(old: &SyncthingApi, takeover: &Takeover, reason: &str) -> String {
    match restore_folder(old, takeover) {
        Ok(()) => format!("{reason} Le dossier a été remis dans votre Syncthing, reprise annulée."),
        Err(e) => format!(
            "{reason} Le dossier n'a pas pu être remis dans votre Syncthing ({e}). Sa configuration d'origine est sauvegardée : {}",
            takeover.backup_path
        ),
    }
}

/// Copie la configuration dans `backup_dir` sans jamais écraser une sauvegarde existante (suffixe `-2`, `-3`…) et relit
/// la copie : les octets doivent être identiques.
fn write_backup(config_file: &Path, backup_dir: &Path, stamp: &str) -> Result<PathBuf, String> {
    use std::io::Write;
    let original = fs::read(config_file).map_err(|e| format!("Sauvegarde de la configuration impossible : {e}"))?;
    fs::create_dir_all(backup_dir).map_err(|e| format!("Sauvegarde impossible : {e}"))?;
    for attempt in 1..=99 {
        let name = if attempt == 1 {
            format!("config.xml.avant-reprise-{stamp}")
        } else {
            format!("config.xml.avant-reprise-{stamp}-{attempt}")
        };
        let path = backup_dir.join(name);
        let mut file = match fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Sauvegarde de la configuration impossible : {e}")),
        };
        file.write_all(&original).and_then(|_| file.sync_all()).map_err(|e| format!("Sauvegarde de la configuration impossible : {e}"))?;
        if fs::read(&path).map_err(|e| format!("Sauvegarde illisible : {e}"))? != original {
            return Err("La sauvegarde de la configuration n'est pas identique à l'original : reprise annulée.".to_string());
        }
        return Ok(path);
    }
    Err("Trop de sauvegardes portent déjà ce nom : reprise annulée.".to_string())
}

/// Remet le dossier dans le Syncthing installé, tel qu'il était (« Rendre le dossier à Syncthing »).
pub fn restore_folder(old: &SyncthingApi, takeover: &Takeover) -> Result<(), String> {
    match old.put_folder(&takeover.folder) {
        Ok(()) => Ok(()),
        Err(error) => {
            // Un appareil du dossier supprimé depuis dans le Syncthing installé fait refuser la remise : on le nomme.
            let known: Vec<String> = old.devices().map(|d| d.into_iter().map(|d| d.id).collect()).unwrap_or_default();
            let missing: Vec<String> = takeover
                .devices
                .iter()
                .filter(|(id, _)| !known.is_empty() && !known.contains(id))
                .map(|(id, name)| if name.is_empty() { id.chars().take(7).collect() } else { name.clone() })
                .collect();
            if missing.is_empty() {
                Err(error.to_string())
            } else {
                Err(format!(
                    "{error}. Ces appareils partageaient le dossier mais ont été supprimés depuis de votre Syncthing : {}. Ajoutez-les de nouveau dans Syncthing, puis réessayez",
                    missing.join(", ")
                ))
            }
        }
    }
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
            assert_eq!(config.connect_address().as_deref(), Some(expected), "{address}");
        }
    }

    #[test]
    fn a_failed_listing_after_the_removal_puts_the_folder_back() {
        let (fake, api) = old_syncthing();
        let (dir, file) = setup_files();
        let config = parse_config(CONFIG).unwrap();
        fake.answer_once("GET /rest/config/folders", r#"[{"id":"neo-old"},{"id":"vault"}]"#);
        fake.answer_code_once("GET /rest/config/folders", 500, "boum");
        fake.answer("DELETE /rest/config/folders/neo-old", "");
        fake.answer("PUT /rest/config/folders/neo-old", "");
        let error = withdraw_folder(&config, &api, &file, dir.path(), "x", "C:\\Neo Calendar").unwrap_err();
        assert_eq!(fake.count("PUT", "/rest/config/folders/neo-old"), 1, "remis malgré l'échec de la relecture");
        assert!(error.contains("a été remis") && error.contains("boum"), "{error}");
    }

    #[test]
    fn a_removal_that_times_out_but_was_processed_is_put_back_too() {
        let (fake, api) = old_syncthing();
        let (dir, file) = setup_files();
        let config = parse_config(CONFIG).unwrap();
        fake.answer("GET /rest/config/folders", r#"[{"id":"neo-old"},{"id":"vault"}]"#);
        fake.answer_code("DELETE /rest/config/folders/neo-old", 500, "délai dépassé");
        fake.answer("PUT /rest/config/folders/neo-old", "");
        let error = withdraw_folder(&config, &api, &file, dir.path(), "x", "C:\\Neo Calendar").unwrap_err();
        assert_eq!(fake.count("PUT", "/rest/config/folders/neo-old"), 1);
        assert!(error.contains("a été remis"), "{error}");
    }

    #[test]
    fn when_even_the_put_back_fails_the_message_says_so_and_gives_the_backup() {
        let (fake, api) = old_syncthing();
        let (dir, file) = setup_files();
        let config = parse_config(CONFIG).unwrap();
        fake.answer_once("GET /rest/config/folders", r#"[{"id":"neo-old"},{"id":"vault"}]"#);
        fake.answer_once("GET /rest/config/folders", "[]");
        fake.answer("DELETE /rest/config/folders/neo-old", "");
        fake.answer_code("PUT /rest/config/folders/neo-old", 500, "non");
        let error = withdraw_folder(&config, &api, &file, dir.path(), "x", "C:\\Neo Calendar").unwrap_err();
        assert!(error.contains("n'a pas pu être remis") && !error.contains("a été remis"), "{error}");
        assert!(error.contains("config.xml.avant-reprise-x"), "le chemin de la sauvegarde : {error}");
    }

    #[test]
    fn an_existing_backup_is_never_overwritten() {
        let (fake, api) = old_syncthing();
        let (dir, file) = setup_files();
        let config = parse_config(CONFIG).unwrap();
        fake.answer_once("GET /rest/config/folders", r#"[{"id":"neo-old"},{"id":"vault"}]"#);
        fake.answer_once("GET /rest/config/folders", r#"[{"id":"vault"}]"#);
        fake.answer("DELETE /rest/config/folders/neo-old", "");
        let backups = dir.path().join("sauvegardes");
        fs::create_dir_all(&backups).unwrap();
        let earlier = backups.join("config.xml.avant-reprise-20261002-190000");
        fs::write(&earlier, "la première sauvegarde").unwrap();
        let takeover = withdraw_folder(&config, &api, &file, &backups, "20261002-190000", "C:\\Neo Calendar").unwrap();
        assert_eq!(fs::read_to_string(&earlier).unwrap(), "la première sauvegarde");
        assert!(takeover.backup_path.ends_with("20261002-190000-2"), "{}", takeover.backup_path);
        assert_eq!(fs::read_to_string(&takeover.backup_path).unwrap(), CONFIG);
    }

    #[test]
    fn only_a_local_gui_address_is_ever_used_and_the_key_never_goes_elsewhere() {
        for address in ["192.168.1.5:8384", "unix:///tmp/st.sock", "pc-de-ahmed:8384", "8.8.8.8:8384"] {
            let config = InstalledConfig { gui_address: address.to_string(), api_key: "CLE".into(), ..Default::default() };
            assert_eq!(config.connect_address(), None, "{address}");
            assert!(config.api().is_err(), "{address}");
            assert!(config.unreachable_reason().is_some_and(|r| r.contains("locale")), "{address}");
        }
        for (address, expected) in [("localhost:8384", "localhost:8384"), ("[::1]:8384", "[::1]:8384"), ("0.0.0.0:1", "127.0.0.1:1")] {
            let config = InstalledConfig { gui_address: address.to_string(), ..Default::default() };
            assert_eq!(config.connect_address().as_deref(), Some(expected));
            assert!(config.api().is_ok() && config.unreachable_reason().is_none());
        }
    }

    #[test]
    fn giving_back_names_the_devices_that_no_longer_exist_in_the_installed_syncthing() {
        let (fake, api) = old_syncthing();
        fake.answer_code("PUT /rest/config/folders/neo-old", 400, "device not found");
        fake.answer("GET /rest/config/devices", r#"[{"deviceID":"OLDPC","name":"DESKTOP-1"},{"deviceID":"PHONE","name":"Pixel"}]"#);
        let takeover = Takeover {
            folder_id: "neo-old".into(),
            folder: serde_json::json!({"id": "neo-old", "devices": [{"deviceID": "OLDPC"}, {"deviceID": "LAPTOP"}, {"deviceID": "PHONE"}]}),
            devices: vec![("LAPTOP".into(), "Laptop d'Ahmed".into()), ("PHONE".into(), "Pixel".into())],
            old_device_id: "OLDPC".into(),
            backup_path: "C:\\sauvegardes\\x".into(),
            taken_at: String::new(),
        };
        let error = restore_folder(&api, &takeover).unwrap_err();
        assert!(error.contains("Laptop d'Ahmed") && !error.contains("Pixel"), "{error}");
        assert!(error.contains("supprimé"), "{error}");
    }
}
