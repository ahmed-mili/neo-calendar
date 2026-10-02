//! Les réglages de la synchro propres à CE PC, dans le dossier d'état du moteur : jamais dans le dossier de
//! notes (le fichier `.neo-calendar.json` s'y synchronise avec les autres appareils, ceci ne doit pas).

use super::config::random_chars;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::Path;

const FILE_NAME: &str = "settings.json";
const PASSWORD_ALPHABET: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyzABCDEF";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SyncSettings {
    /// La synchro intégrée est active sur ce PC.
    pub enabled: bool,
    /// Le dossier de données qui est synchronisé (celui choisi dans l'app).
    pub folder_path: Option<String>,
    /// Le port d'écoute TCP/QUIC, choisi libre une fois puis gardé (revérifié à chaque lancement).
    pub listen_port: Option<u16>,
    /// Identifiant et mot de passe (haché) de l'interface web du moteur. Le mot de passe en clair n'est jamais gardé.
    pub gui_user: Option<String>,
    pub gui_password_hash: Option<String>,
}

impl SyncSettings {
    /// Un fichier absent donne les réglages par défaut (synchro désactivée). Un fichier illisible est mis de côté
    /// (`settings.json.illisible`) plutôt qu'écrasé en silence, puis les réglages par défaut s'appliquent.
    pub fn load(dir: &Path) -> SyncSettings {
        let path = dir.join(FILE_NAME);
        let Ok(bytes) = fs::read(&path) else {
            return SyncSettings::default();
        };
        match serde_json::from_slice(&bytes) {
            Ok(settings) => settings,
            Err(_) => {
                let _ = fs::rename(&path, dir.join(format!("{FILE_NAME}.illisible")));
                SyncSettings::default()
            }
        }
    }

    /// Écriture atomique : fichier temporaire du même dossier, puis renommage.
    pub fn save(&self, dir: &Path) -> io::Result<()> {
        fs::create_dir_all(dir)?;
        let temporary = dir.join(format!("{FILE_NAME}.tmp"));
        fs::write(&temporary, serde_json::to_vec_pretty(self).map_err(io::Error::other)?)?;
        fs::rename(&temporary, dir.join(FILE_NAME))
    }

    /// Pose l'identifiant et le mot de passe de l'interface web s'ils manquent. Rend vrai si quelque chose a changé.
    pub fn ensure_gui_credentials(&mut self) -> Result<bool, String> {
        if self.gui_user.is_some() && self.gui_password_hash.is_some() {
            return Ok(false);
        }
        let password = random_chars(PASSWORD_ALPHABET, 32);
        let hash = bcrypt::hash(&password, 10).map_err(|e| e.to_string())?;
        self.gui_user = Some("neo-calendar".to_string());
        self.gui_password_hash = Some(hash);
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_means_sync_is_off() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(SyncSettings::load(dir.path()), SyncSettings::default());
        assert!(!SyncSettings::load(dir.path()).enabled);
    }

    #[test]
    fn settings_survive_a_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let settings = SyncSettings {
            enabled: true,
            folder_path: Some("C:\\Neo Calendar".into()),
            listen_port: Some(40123),
            ..Default::default()
        };
        settings.save(dir.path()).unwrap();
        assert_eq!(SyncSettings::load(dir.path()), settings);
        assert!(!dir.path().join("settings.json.tmp").exists());
    }

    #[test]
    fn an_unreadable_file_is_set_aside_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("settings.json"), "{ pas du json").unwrap();
        assert_eq!(SyncSettings::load(dir.path()), SyncSettings::default());
        assert_eq!(fs::read_to_string(dir.path().join("settings.json.illisible")).unwrap(), "{ pas du json");
    }

    #[test]
    fn unknown_fields_and_missing_fields_are_tolerated() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("settings.json"), r#"{"enabled":true,"futur":1}"#).unwrap();
        assert!(SyncSettings::load(dir.path()).enabled);
    }

    #[test]
    fn web_credentials_are_created_once_and_only_the_hash_is_kept() {
        let mut settings = SyncSettings::default();
        assert!(settings.ensure_gui_credentials().unwrap());
        let hash = settings.gui_password_hash.clone().unwrap();
        assert!(hash.starts_with("$2"));
        assert!(!settings.ensure_gui_credentials().unwrap());
        assert_eq!(settings.gui_password_hash.unwrap(), hash);
    }
}
