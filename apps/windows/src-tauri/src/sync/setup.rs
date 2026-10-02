//! Les gestes de l'utilisateur sur les appareils et le dossier, traduits en appels à l'API du moteur de l'app.
//! Rien n'est accepté ici sans qu'un appelant l'ait décidé (geste de l'utilisateur ou code d'appairage valide).

use super::api::{ApiError, ApiResult, ConfiguredFolder, SyncthingApi};
use super::config;
use std::fs;
use std::path::Path;

/// Deux chemins Windows désignent-ils le même dossier ? (casse, sens des barres, barre finale, préfixe `\\?\`)
pub fn same_path(a: &str, b: &str) -> bool {
    fn normal(path: &str) -> String {
        let flat = path.trim().replace('/', "\\");
        let flat = flat.strip_prefix("\\\\?\\").unwrap_or(&flat);
        flat.trim_end_matches('\\').to_lowercase()
    }
    normal(a) == normal(b)
}

/// Ce qu'un dossier neuf reprend d'une reprise : son identifiant et les appareils qui le partageaient (identifiant, nom).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct FolderSeed {
    pub folder_id: Option<String>,
    pub devices: Vec<(String, String)>,
}

pub struct SyncSetup<'a> {
    pub api: &'a SyncthingApi,
    pub folder_path: &'a Path,
}

fn local_error(message: String) -> ApiError {
    ApiError { code: 0, message }
}

impl SyncSetup<'_> {
    /// Le moteur refuse un dossier sans `.stfolder`. Un marqueur déjà là (resté d'un ancien partage) est repris tel quel.
    fn ensure_marker(&self) -> ApiResult<()> {
        fs::create_dir_all(self.folder_path.join(".stfolder")).map_err(|e| {
            local_error(format!("Impossible de préparer le dossier « {} » : {e}", self.folder_path.display()))
        })
    }

    fn path_text(&self) -> String {
        self.folder_path.to_string_lossy().into_owned()
    }

    /// Le dossier de notes dans le moteur. Absent (premier démarrage), il est créé, partagé avec personne.
    /// Un seul dossier est synchronisé : un moteur qui en a déjà un n'en reçoit jamais un deuxième.
    pub fn ensure_folder(&self) -> ApiResult<ConfiguredFolder> {
        self.ensure_folder_seeded(&FolderSeed::default())
    }

    /// Comme `ensure_folder`, mais un dossier absent est créé avec l'identifiant et les appareils de la `seed` (reprise
    /// depuis un Syncthing installé : les autres appareils reconnaissent le dossier à son identifiant).
    pub fn ensure_folder_seeded(&self, seed: &FolderSeed) -> ApiResult<ConfiguredFolder> {
        if let Some(folder) = self.api.folders()?.into_iter().next() {
            return Ok(folder);
        }
        let me = self.api.my_id()?;
        self.ensure_marker()?;
        for (id, name) in &seed.devices {
            self.api.put_device(&config::device(id, name))?;
        }
        let id = seed.folder_id.clone().unwrap_or_else(config::new_folder_id);
        let mut device_ids = vec![me];
        device_ids.extend(seed.devices.iter().map(|(id, _)| id.clone()));
        self.api.put_folder(&config::folder(&id, config::FOLDER_LABEL, &self.path_text(), &device_ids))?;
        Ok(ConfiguredFolder { id, label: config::FOLDER_LABEL.to_string(), path: self.path_text(), device_ids })
    }

    /// Le dossier du moteur n'est plus le dossier de données choisi dans l'app (changement de dossier de données).
    pub fn folder_mismatch(&self) -> ApiResult<Option<ConfiguredFolder>> {
        Ok(self.api.folders()?.into_iter().next().filter(|f| !same_path(&f.path, &self.path_text())))
    }

    /// Remet le dossier du moteur sur le dossier de données actuel, au même identifiant : retiré puis reposé, pour
    /// repartir d'un index vide (recréer `.stfolder` à la main sur un index ancien désactiverait la sécurité de
    /// Syncthing, qui prendrait les fichiers « absents » pour des suppressions à propager).
    pub fn repoint_folder(&self) -> ApiResult<()> {
        let Some(old) = self.api.folders()?.into_iter().next() else {
            return Ok(());
        };
        self.ensure_marker()?;
        self.api.remove_folder(&old.id)?;
        self.api.put_folder(&config::folder(&old.id, &old.label, &self.path_text(), &old.device_ids))
    }

    fn share_with(&self, device_id: &str) -> ApiResult<()> {
        let folder = self.ensure_folder()?;
        if !folder.device_ids.iter().any(|d| d == device_id) {
            let mut devices = folder.device_ids.clone();
            devices.push(device_id.to_string());
            self.api.set_folder_devices(&folder.id, &devices)?;
        }
        Ok(())
    }

    /// Accepte un appareil (demande entrante) ou le reprend (reprise depuis un Syncthing installé) et lui partage le dossier.
    /// Jamais appelé sans geste de l'utilisateur ni code d'appairage valide.
    pub fn accept_device(&self, id: &str, name: &str) -> ApiResult<()> {
        if id == self.api.my_id()? {
            return Err(local_error("C'est l'identifiant de ce PC.".to_string()));
        }
        let name = name.trim();
        let name = if name.is_empty() { id.chars().take(7).collect::<String>() } else { name.to_string() };
        self.api.put_device(&config::device(id, &name))?;
        self.share_with(id)?;
        let _ = self.api.dismiss_pending_device(id);
        Ok(())
    }

    pub fn reject_device(&self, id: &str) -> ApiResult<()> {
        self.api.dismiss_pending_device(id)
    }

    /// Retire l'appareil, d'abord du dossier puis du moteur. Les notes locales ne sont pas touchées.
    pub fn remove_device(&self, id: &str) -> ApiResult<()> {
        if let Some(folder) = self.api.folders()?.into_iter().find(|f| f.device_ids.iter().any(|d| d == id)) {
            let remaining: Vec<String> = folder.device_ids.iter().filter(|d| *d != id).cloned().collect();
            self.api.set_folder_devices(&folder.id, &remaining)?;
        }
        self.api.remove_device(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::testing::FakeTransport;
    use std::sync::Arc;

    const ME: &str = "ME-ME-ME";
    const PHONE: &str = "PHONE-ID";

    fn fixture() -> (Arc<FakeTransport>, SyncthingApi, tempfile::TempDir) {
        let fake = Arc::new(FakeTransport::default());
        fake.answer("GET /rest/system/status", &format!(r#"{{"myID":"{ME}"}}"#));
        let api = SyncthingApi::new(fake.clone());
        (fake, api, tempfile::tempdir().unwrap())
    }

    #[test]
    fn paths_compare_like_windows_does() {
        assert!(same_path("C:\\Neo Calendar", "c:/neo calendar/"));
        assert!(same_path("\\\\?\\C:\\Neo Calendar", "C:\\Neo Calendar"));
        assert!(!same_path("C:\\Neo Calendar", "C:\\Neo Calendar 2"));
    }

    #[test]
    fn the_first_accepted_device_creates_the_folder_shared_with_it() {
        let (fake, api, dir) = fixture();
        fake.answer("GET /rest/config/folders", "[]");
        fake.answer("PUT /rest/config/devices/*", "");
        fake.answer("PUT /rest/config/folders/*", "");
        fake.answer("PATCH /rest/config/folders/*", "");
        fake.answer("DELETE /rest/cluster/pending/devices*", "");
        let setup = SyncSetup { api: &api, folder_path: dir.path() };
        setup.accept_device(PHONE, "  Pixel 8 ").unwrap();
        assert!(fake.sent("PUT", &format!("/rest/config/devices/{PHONE}")).unwrap().contains("\"name\":\"Pixel 8\""));
        let calls = fake.calls.lock().unwrap();
        let folder_put = calls.iter().find(|c| c.method == "PUT" && c.path.starts_with("/rest/config/folders/neo-")).unwrap();
        assert!(folder_put.body.as_ref().unwrap().contains(ME));
        assert!(dir.path().join(".stfolder").is_dir(), "le marqueur est posé");
        drop(calls);
        assert_eq!(fake.count("DELETE", "/rest/cluster/pending/devices"), 1);
    }

    #[test]
    fn a_seeded_folder_keeps_the_old_id_and_shares_with_the_old_devices() {
        let (fake, api, dir) = fixture();
        fake.answer("GET /rest/config/folders", "[]");
        fake.answer("PUT /rest/config/devices/*", "");
        fake.answer("PUT /rest/config/folders/*", "");
        let seed = FolderSeed { folder_id: Some("neo-old".into()), devices: vec![("LAPTOP".into(), "Laptop".into()), ("PHONE".into(), "Pixel".into())] };
        SyncSetup { api: &api, folder_path: dir.path() }.ensure_folder_seeded(&seed).unwrap();
        let body = fake.sent("PUT", "/rest/config/folders/neo-old").expect("même identifiant que l'ancien partage");
        for id in [ME, "LAPTOP", "PHONE"] {
            assert!(body.contains(id), "{id}");
        }
        assert!(fake.sent("PUT", "/rest/config/devices/LAPTOP").unwrap().contains("\"name\":\"Laptop\""));
    }

    #[test]
    fn a_second_device_is_added_to_the_existing_folder_never_a_second_folder() {
        let (fake, api, dir) = fixture();
        fake.answer(
            "GET /rest/config/folders",
            &format!(r#"[{{"id":"neo-x","label":"Neo","path":"C:\\N","devices":[{{"deviceID":"{ME}"}}]}}]"#),
        );
        fake.answer("PUT /rest/config/devices/*", "");
        fake.answer("PATCH /rest/config/folders/neo-x", "");
        fake.answer("DELETE /rest/cluster/pending/devices*", "");
        SyncSetup { api: &api, folder_path: dir.path() }.accept_device(PHONE, "").unwrap();
        assert_eq!(fake.count("PUT", "/rest/config/folders/"), 0);
        let patch = fake.sent("PATCH", "/rest/config/folders/neo-x").unwrap();
        assert!(patch.contains(PHONE) && patch.contains(ME));
        assert!(fake.sent("PUT", &format!("/rest/config/devices/{PHONE}")).unwrap().contains("\"name\":\"PHONE-I\""));
    }

    #[test]
    fn this_pcs_own_id_is_refused_before_any_write() {
        let (fake, api, dir) = fixture();
        let error = SyncSetup { api: &api, folder_path: dir.path() }.accept_device(ME, "moi").unwrap_err();
        assert!(error.message.contains("ce PC"));
        assert_eq!(fake.count("PUT", "/rest"), 0);
    }

    #[test]
    fn removing_a_device_leaves_it_out_of_the_folder_first() {
        let (fake, api, dir) = fixture();
        fake.answer(
            "GET /rest/config/folders",
            &format!(r#"[{{"id":"neo-x","label":"N","path":"C:\\N","devices":[{{"deviceID":"{ME}"}},{{"deviceID":"{PHONE}"}}]}}]"#),
        );
        fake.answer("PATCH /rest/config/folders/neo-x", "");
        fake.answer(&format!("DELETE /rest/config/devices/{PHONE}"), "");
        SyncSetup { api: &api, folder_path: dir.path() }.remove_device(PHONE).unwrap();
        let patch = fake.sent("PATCH", "/rest/config/folders/neo-x").unwrap();
        assert!(!patch.contains(PHONE) && patch.contains(ME));
    }

    #[test]
    fn a_changed_data_folder_is_detected_and_repointed_with_the_same_id() {
        let (fake, api, dir) = fixture();
        fake.answer(
            "GET /rest/config/folders",
            &format!(r#"[{{"id":"neo-x","label":"N","path":"C:\\Ancien","devices":[{{"deviceID":"{ME}"}}]}}]"#),
        );
        fake.answer("DELETE /rest/config/folders/neo-x", "");
        fake.answer("PUT /rest/config/folders/neo-x", "");
        let setup = SyncSetup { api: &api, folder_path: dir.path() };
        assert_eq!(setup.folder_mismatch().unwrap().unwrap().id, "neo-x");
        setup.repoint_folder().unwrap();
        let put = fake.sent("PUT", "/rest/config/folders/neo-x").unwrap();
        assert!(put.contains("\"id\":\"neo-x\""));
        let path = dir.path().to_string_lossy().replace('\\', "\\\\");
        assert!(put.contains(&path), "{put}");
    }

    #[test]
    fn a_folder_already_on_the_right_path_is_no_mismatch() {
        let (fake, api, dir) = fixture();
        let path = dir.path().to_string_lossy().replace('\\', "\\\\");
        fake.answer("GET /rest/config/folders", &format!(r#"[{{"id":"neo-x","label":"N","path":"{path}","devices":[]}}]"#));
        assert!(SyncSetup { api: &api, folder_path: dir.path() }.folder_mismatch().unwrap().is_none());
    }
}
