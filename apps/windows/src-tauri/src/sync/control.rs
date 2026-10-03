//! Le chef d'orchestre de la synchro intégrée : réglages, moteur, appairage, reprise depuis un Syncthing installé.
//! Aucune dépendance à Tauri : les commandes de `commands.rs` ne sont que de fines enveloppes, et les tests
//! pilotent ce module avec de vrais moteurs.

use super::api::SyncthingApi;
use super::engine::{Engine, EngineParams, Hooks};
use super::installed::{self, Detection, Takeover};
use super::log::RotatingLog;
use super::pairing::{self, Pairing, Verdict};
use super::settings::SyncSettings;
use super::setup::{FolderSeed, SyncSetup};
use super::supervision::{EngineState, RestartPolicy};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// La version du moteur embarqué, affichée sur la page.
pub const ENGINE_VERSION: &str = "2.1.5";
const TAKEOVER_FILE: &str = "reprise.json";
/// L'exclusivité est revérifiée toutes les 30 secondes : un Syncthing installé qui reprendrait le dossier plus tard ne doit pas coexister.
const EXCLUSIVITY_EVERY_TICKS: u64 = 30;

pub struct Controller {
    state_dir: PathBuf,
    local_app_data: PathBuf,
    /// Le `syncthing.exe` posé par l'installateur à côté de l'app (la source de la copie qui tourne).
    exe: PathBuf,
    engine: Engine,
    settings: Mutex<SyncSettings>,
    pairing: Mutex<Pairing>,
    /// Un seul geste lourd (reprise, retour en arrière) à la fois.
    heavy: Mutex<()>,
    takeover_running: AtomicBool,
    ticks: AtomicU64,
    /// Lectures illisibles de la configuration du Syncthing installé, de suite (une seule est tolérée en marche).
    unreadable_streak: AtomicU32,
    /// `start_if_enabled` a déjà été appelé (par l'interface) : le filet du lancement masqué ne rejoue pas un abandon.
    launched: AtomicBool,
    /// Une demande portant le bon code a été consommée mais n'a pas pu être acceptée : le code est à regénérer.
    pairing_error: Mutex<Option<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDto {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub last_seen: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingDto {
    pub id: String,
    /// Le nom présenté par l'appareil, sans son éventuel code d'appairage (qui ne s'affiche jamais).
    pub name: String,
    pub address: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderDto {
    pub id: String,
    pub path: String,
    pub state: String,
    pub need_files: u64,
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusDto {
    pub enabled: bool,
    pub engine_version: &'static str,
    pub state: EngineState,
    pub my_id: Option<String>,
    pub folder_path: Option<String>,
    pub folder: Option<FolderDto>,
    pub devices: Vec<DeviceDto>,
    pub pending: Vec<PendingDto>,
    /// Le dossier du moteur n'est plus le dossier de données de l'app : le chemin que le moteur synchronise encore.
    pub mismatch: Option<String>,
    pub pairing_remaining_ms: Option<u64>,
    /// Le dossier a été repris à un Syncthing installé : « Rendre le dossier à Syncthing » est proposé.
    pub taken_over: bool,
    /// Message à montrer quand l'appairage par QR code a échoué après la lecture du code (il faut un nouveau code).
    pub pairing_error: Option<String>,
    /// Le nom de ce PC (celui que Syncthing donne à l'appareil), affiché à côté de son identifiant.
    pub device_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingDto {
    pub qr_svg: String,
    /// L'identifiant de ce PC, montré en entier au-dessus du QR code.
    pub my_id: String,
    /// Dans combien de temps la page doit demander le code suivant.
    pub refresh_in_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DetectionDto {
    NotInstalled,
    NotSharing,
    #[serde(rename_all = "camelCase")]
    Shares { folder_id: String, label: String, running: bool, tls: bool, other_folders: usize, reason: Option<String> },
}

/// Ce que la configuration du Syncthing installé dit du dossier de données.
enum Sharing {
    No,
    Yes,
    Unreadable(String),
}

impl Controller {
    pub fn new(state_dir: PathBuf, local_app_data: PathBuf, exe: PathBuf) -> Arc<Self> {
        let log = Arc::new(RotatingLog::new(state_dir.join("journal"), 1_048_576));
        let settings = SyncSettings::load(&state_dir);
        Arc::new(Self {
            engine: Engine::new(log),
            settings: Mutex::new(settings),
            pairing: Mutex::new(Pairing::default()),
            heavy: Mutex::new(()),
            takeover_running: AtomicBool::new(false),
            ticks: AtomicU64::new(0),
            unreadable_streak: AtomicU32::new(0),
            launched: AtomicBool::new(false),
            pairing_error: Mutex::new(None),
            state_dir,
            local_app_data,
            exe,
        })
    }

    fn lock_settings(&self) -> std::sync::MutexGuard<'_, SyncSettings> {
        self.settings.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn save_settings(&self, settings: &SyncSettings) -> Result<(), String> {
        settings.save(&self.state_dir).map_err(|e| format!("Réglages de la synchro impossibles à enregistrer : {e}"))
    }

    pub fn log_text(&self) -> String {
        self.engine.log.read_all()
    }

    fn home(&self) -> PathBuf {
        self.state_dir.join("moteur")
    }

    fn takeover_path(&self) -> PathBuf {
        self.state_dir.join(TAKEOVER_FILE)
    }

    fn read_takeover(&self) -> Option<Takeover> {
        serde_json::from_slice(&fs::read(self.takeover_path()).ok()?).ok()
    }

    /// Ce que dit la configuration du Syncthing installé du dossier de données (jamais le disque : un `.stfolder`
    /// orphelin n'est pas un partage).
    fn installed_sharing(&self, data_folder: &str) -> Sharing {
        match installed::read_config(&self.local_app_data) {
            Ok(None) => Sharing::No,
            Ok(Some(config)) if config.sharing(data_folder).is_some() => Sharing::Yes,
            Ok(Some(_)) => Sharing::No,
            Err(e) => Sharing::Unreadable(e),
        }
    }

    /// Au lancement : dans le doute (configuration illisible), le moteur ne démarre pas : la fiabilité d'abord.
    fn installed_shares(&self, data_folder: &str) -> bool {
        match self.installed_sharing(data_folder) {
            Sharing::No => false,
            Sharing::Yes => true,
            Sharing::Unreadable(e) => {
                self.engine.log.note(&format!("Configuration du Syncthing installé illisible, par prudence le moteur de l'app ne démarre pas : {e}"));
                true
            }
        }
    }

    /// Le dossier et les appareils à imposer au moteur qui démarre : ceux d'une reprise en cours (`reprise.json`), pour
    /// qu'une reprise interrompue (Quitter, mise à jour, plantage) ne crée jamais un dossier d'identifiant aléatoire.
    fn seed_for_start(&self, seed: FolderSeed) -> FolderSeed {
        if seed.folder_id.is_some() {
            return seed;
        }
        match self.read_takeover() {
            Some(takeover) => FolderSeed { folder_id: Some(takeover.folder_id), devices: takeover.devices },
            None => seed,
        }
    }

    // ----- Cycle de vie -----

    /// Lance le moteur si la synchro est active. À appeler APRÈS le premier écran, jamais sur le chemin du lancement :
    /// ne bloque pas (le superviseur a son fil). `data_folder` : le dossier de données actuel de l'app.
    pub fn start_if_enabled(self: &Arc<Self>, data_folder: Option<&str>) -> Result<(), String> {
        self.launched.store(true, Ordering::SeqCst);
        self.start_enabled(data_folder)
    }

    /// Le filet d'un lancement masqué : ne démarre le moteur que si l'interface ne l'a jamais demandé (un moteur qui a
    /// abandonné ne repart pas tout seul, il attend une action de l'utilisateur).
    pub fn start_if_never_launched(self: &Arc<Self>) -> Result<(), String> {
        if self.launched.swap(true, Ordering::SeqCst) {
            return Ok(());
        }
        self.start_enabled(None)
    }

    fn start_enabled(self: &Arc<Self>, data_folder: Option<&str>) -> Result<(), String> {
        {
            let mut settings = self.lock_settings();
            if !settings.enabled {
                return Ok(());
            }
            if let Some(folder) = data_folder {
                if settings.folder_path.as_deref() != Some(folder) {
                    settings.folder_path = Some(folder.to_string());
                    self.save_settings(&settings)?;
                }
            }
        }
        if self.engine.is_active() {
            return Ok(());
        }
        self.start_engine(false, FolderSeed::default())
    }

    fn start_engine(self: &Arc<Self>, skip_exclusivity: bool, seed: FolderSeed) -> Result<(), String> {
        let params = {
            let mut settings = self.lock_settings();
            let folder = settings.folder_path.clone().ok_or("Aucun dossier de données choisi.")?;
            if settings.ensure_gui_credentials()? {
                self.save_settings(&settings)?;
            }
            if !skip_exclusivity && self.installed_shares(&folder) {
                self.engine.set_state(EngineState::BlockedByInstalled);
                self.engine.log.note("Un Syncthing installé partage ce dossier : le moteur de l'app ne démarre pas dessus.");
                return Ok(());
            }
            // `Engine` copie lui-même le moteur livré dans `<état>\moteur\bin` et lance la copie.
            EngineParams {
                exe: self.exe.clone(),
                version: ENGINE_VERSION.to_string(),
                home: self.home(),
                folder_path: PathBuf::from(&folder),
                listen_port: settings.listen_port,
                gui_user: settings.gui_user.clone().unwrap_or_default(),
                gui_password_hash: settings.gui_password_hash.clone().unwrap_or_default(),
                seed: self.seed_for_start(seed),
            }
        };
        let (for_port, for_tick) = (self.clone(), self.clone());
        let hooks = Arc::new(Hooks {
            on_listen_port: Box::new(move |port| {
                let mut settings = for_port.lock_settings();
                settings.listen_port = Some(port);
                let _ = for_port.save_settings(&settings);
            }),
            on_tick: Box::new(move |api| for_tick.tick(api)),
        });
        self.engine.start(params, hooks, RestartPolicy::default())
    }

    /// Active la synchro intégrée sur ce dossier de données (geste de l'utilisateur) et lance le moteur.
    pub fn enable(self: &Arc<Self>, data_folder: &str) -> Result<(), String> {
        {
            let mut settings = self.lock_settings();
            settings.enabled = true;
            settings.folder_path = Some(data_folder.to_string());
            self.save_settings(&settings)?;
        }
        if self.engine.is_active() {
            return Ok(());
        }
        self.start_engine(false, FolderSeed::default())
    }

    pub fn disable(&self) -> Result<(), String> {
        self.pairing.lock().unwrap_or_else(|e| e.into_inner()).cancel();
        self.engine.stop();
        let mut settings = self.lock_settings();
        settings.enabled = false;
        self.save_settings(&settings)
    }

    /// « Réessayer » après un abandon : on repart de zéro.
    pub fn retry(self: &Arc<Self>) -> Result<(), String> {
        self.engine.stop();
        if !self.lock_settings().enabled {
            return Ok(());
        }
        self.start_engine(false, FolderSeed::default())
    }

    /// À la fermeture de l'app (« Quitter », mise à jour) : arrêt propre du moteur.
    pub fn shutdown(&self) {
        self.engine.stop();
    }

    // ----- Chaque seconde, fil du moteur -----

    fn tick(&self, api: &SyncthingApi) -> bool {
        let count = self.ticks.fetch_add(1, Ordering::SeqCst) + 1;
        if count % EXCLUSIVITY_EVERY_TICKS == 0 && !self.takeover_running.load(Ordering::SeqCst) {
            let folder = self.lock_settings().folder_path.clone();
            match folder.map(|f| self.installed_sharing(&f)).unwrap_or(Sharing::No) {
                Sharing::No => self.unreadable_streak.store(0, Ordering::SeqCst),
                Sharing::Yes => return false,
                Sharing::Unreadable(e) => {
                    // Une lecture ratée peut tomber pendant que Syncthing réécrit son fichier : une seule est tolérée.
                    if self.unreadable_streak.fetch_add(1, Ordering::SeqCst) + 1 >= 2 {
                        self.engine.log.note(&format!("Configuration du Syncthing installé illisible deux fois de suite ({e}) : par prudence le moteur de l'app s'arrête."));
                        return false;
                    }
                    self.engine.log.note(&format!("Configuration du Syncthing installé illisible ({e}) : nouvel essai dans 30 secondes."));
                }
            }
        }
        self.accept_paired(api);
        true
    }

    /// Accepte la demande qui porte le bon code d'appairage, et elle seule. Toute autre reste à accepter à la main.
    fn accept_paired(&self, api: &SyncthingApi) {
        let Ok(pending) = api.pending_devices() else { return };
        if pending.is_empty() {
            return;
        }
        let Some(folder) = self.lock_settings().folder_path.clone() else { return };
        for request in pending {
            let verdict = self.pairing.lock().unwrap_or_else(|e| e.into_inner()).judge(Instant::now(), &request.id, &request.name);
            if verdict != Verdict::Accept {
                continue;
            }
            let (name, _) = pairing::split_name(&request.name);
            let setup = SyncSetup { api, folder_path: Path::new(&folder) };
            match setup.accept_device(&request.id, &name) {
                Ok(()) => {
                    *self.pairing_error.lock().unwrap_or_else(|e| e.into_inner()) = None;
                    self.engine.log.note("Appairage par QR code : appareil accepté");
                }
                Err(e) => {
                    // Le code est consommé (usage unique) : la page doit dire qu'il faut en regénérer un.
                    *self.pairing_error.lock().unwrap_or_else(|e| e.into_inner()) = Some(
                        "L'appairage a échoué après la lecture du code : générez un nouveau code et scannez-le de nouveau.".to_string(),
                    );
                    self.engine.log.note(&format!("Appairage par QR code : échec de l'acceptation ({e})"));
                }
            }
        }
    }

    // ----- La page -----

    fn api(&self) -> Result<SyncthingApi, String> {
        self.engine.snapshot().api.ok_or_else(|| "Le moteur de synchronisation démarre : réessayez dans un instant.".to_string())
    }

    pub fn status(&self) -> StatusDto {
        let snapshot = self.engine.snapshot();
        let settings = self.lock_settings().clone();
        let mut dto = StatusDto {
            enabled: settings.enabled,
            engine_version: ENGINE_VERSION,
            state: snapshot.state.clone(),
            my_id: snapshot.my_id.clone(),
            folder_path: settings.folder_path.clone(),
            folder: None,
            devices: Vec::new(),
            pending: Vec::new(),
            mismatch: snapshot.mismatch.clone(),
            pairing_remaining_ms: self
                .pairing
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remaining(Instant::now())
                .map(|d| d.as_millis() as u64),
            taken_over: self.read_takeover().is_some(),
            pairing_error: self.pairing_error.lock().unwrap_or_else(|e| e.into_inner()).clone(),
            device_name: std::env::var("COMPUTERNAME").ok().filter(|name| !name.is_empty()),
        };
        let (Some(api), Some(me)) = (snapshot.api, snapshot.my_id) else { return dto };
        if let Ok(Some(folder)) = api.folders().map(|f| f.into_iter().next()) {
            let state = api.folder_state(&folder.id).unwrap_or_default();
            dto.folder = Some(FolderDto {
                id: folder.id,
                path: folder.path,
                state: state.state,
                need_files: state.need_files,
                error: state.error,
            });
        }
        let connections = api.connections().unwrap_or_default();
        let seen = api.last_seen().unwrap_or_default();
        dto.devices = api
            .devices()
            .unwrap_or_default()
            .into_iter()
            .filter(|d| d.id != me)
            .map(|d| DeviceDto {
                connected: connections.get(&d.id).copied().unwrap_or(false),
                last_seen: seen.get(&d.id).cloned().flatten(),
                name: if d.name.is_empty() { d.id.chars().take(7).collect() } else { d.name },
                id: d.id,
            })
            .collect();
        dto.pending = api
            .pending_devices()
            .unwrap_or_default()
            .into_iter()
            .map(|p| PendingDto { name: pairing::split_name(&p.name).0, id: p.id, address: p.address })
            .collect();
        dto
    }

    // ----- Appairage par QR code -----

    /// Ouvre la fenêtre d'appairage avec son premier code.
    pub fn pairing_start(&self) -> Result<PairingDto, String> {
        self.pairing_code(true)
    }

    /// Le code suivant, que la page demande toutes les `REFRESH` ; les précédents restent valables `CODE_LIFE`.
    pub fn pairing_next(&self) -> Result<PairingDto, String> {
        self.pairing_code(false)
    }

    fn pairing_code(&self, open: bool) -> Result<PairingDto, String> {
        let snapshot = self.engine.snapshot();
        let my_id = snapshot.my_id.ok_or("Le moteur de synchronisation démarre : réessayez dans un instant.")?;
        let code = pairing::new_code();
        let svg = pairing::qr_svg(&pairing::qr_payload(&my_id, &code))?;
        let mut session = self.pairing.lock().unwrap_or_else(|e| e.into_inner());
        if open {
            session.start(Instant::now(), code);
            *self.pairing_error.lock().unwrap_or_else(|e| e.into_inner()) = None;
        } else if !session.rotate(Instant::now(), code) {
            return Err("La fenêtre d'appairage est fermée.".to_string());
        }
        Ok(PairingDto { qr_svg: svg, my_id, refresh_in_ms: pairing::REFRESH.as_millis() as u64 })
    }

    pub fn pairing_cancel(&self) {
        self.pairing.lock().unwrap_or_else(|e| e.into_inner()).cancel();
        *self.pairing_error.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    // ----- Appareils (gestes de l'utilisateur) -----

    fn with_setup<T>(&self, run: impl FnOnce(&SyncSetup<'_>) -> Result<T, super::api::ApiError>) -> Result<T, String> {
        let api = self.api()?;
        let folder = self.lock_settings().folder_path.clone().ok_or("Aucun dossier de données choisi.")?;
        run(&SyncSetup { api: &api, folder_path: Path::new(&folder) }).map_err(|e| e.message)
    }

    /// Accepte une demande entrante : toujours un geste de l'utilisateur ici (l'appairage par QR code a son propre chemin).
    pub fn accept_device(&self, id: &str) -> Result<(), String> {
        let name = self
            .api()?
            .pending_devices()
            .map_err(|e| e.message)?
            .into_iter()
            .find(|p| p.id == id)
            .map(|p| pairing::split_name(&p.name).0)
            .ok_or("Cette demande n'existe plus.")?;
        self.with_setup(|setup| setup.accept_device(id, &name))
    }

    /// « Ajouter un appareil » : l'identifiant d'un autre appareil, tapé ou collé. Le dossier lui est partagé tout de
    /// suite ; l'autre appareil doit encore accepter ce PC de son côté.
    pub fn add_device(&self, id: &str, name: &str) -> Result<(), String> {
        let id = pairing::normalize_device_id(id).ok_or("Cet identifiant d'appareil n'est pas valable.")?;
        self.with_setup(|setup| setup.accept_device(&id, name))
    }

    pub fn reject_device(&self, id: &str) -> Result<(), String> {
        self.with_setup(|setup| setup.reject_device(id))
    }

    pub fn remove_device(&self, id: &str) -> Result<(), String> {
        self.with_setup(|setup| setup.remove_device(id))
    }

    /// Le dossier de données a changé : le moteur synchronise le nouveau (même identifiant, index repartant de zéro).
    pub fn repoint_folder(&self) -> Result<(), String> {
        self.with_setup(|setup| setup.repoint_folder())
    }

    // ----- Reprise depuis un Syncthing installé -----

    pub fn detect(&self, data_folder: &str) -> Result<DetectionDto, String> {
        let config = installed::read_config(&self.local_app_data)?;
        let healthy = |c: &installed::InstalledConfig| c.api().map(|api| api.is_healthy()).unwrap_or(false);
        Ok(match installed::detect(config.as_ref(), data_folder, &healthy) {
            Detection::NotInstalled => DetectionDto::NotInstalled,
            Detection::NotSharing => DetectionDto::NotSharing,
            Detection::Shares { folder_id, label, running, tls, other_folders } => {
                // Quand la reprise n'est pas possible, la raison : interface en HTTPS, non locale, ou arrêtée.
                let reason = if running {
                    None
                } else {
                    config.as_ref().and_then(|c| c.unreachable_reason()).or_else(|| {
                        Some("Ce Syncthing ne répond pas : lancez-le, puis relancez la détection.".to_string())
                    })
                };
                DetectionDto::Shares { folder_id, label, running, tls, other_folders, reason }
            }
        })
    }

    fn wait_until_running(&self, timeout: Duration) -> Result<SyncthingApi, String> {
        let end = Instant::now() + timeout;
        while Instant::now() < end {
            let snapshot = self.engine.snapshot();
            match (&snapshot.state, snapshot.api) {
                (EngineState::Running, Some(api)) => return Ok(api),
                (EngineState::Failed { error }, _) => return Err(format!("Le moteur n'a pas démarré : {error}")),
                (EngineState::Missing, _) => return Err("Le moteur de synchronisation est introuvable.".to_string()),
                _ => std::thread::sleep(Duration::from_millis(200)),
            }
        }
        Err("Le moteur n'a pas démarré à temps.".to_string())
    }

    /// Après confirmation de l'utilisateur : sauvegarde la configuration du Syncthing installé, lui retire le seul
    /// dossier Neo Calendar, et le moteur de l'app le prend (même identifiant, mêmes appareils proposés).
    /// Au moindre échec, le dossier est rendu au Syncthing installé.
    pub fn take_over(self: &Arc<Self>, data_folder: &str, stamp: &str) -> Result<(), String> {
        let _heavy = self.heavy.lock().unwrap_or_else(|e| e.into_inner());
        self.takeover_running.store(true, Ordering::SeqCst);
        let result = self.take_over_locked(data_folder, stamp);
        self.takeover_running.store(false, Ordering::SeqCst);
        result
    }

    fn take_over_locked(self: &Arc<Self>, data_folder: &str, stamp: &str) -> Result<(), String> {
        let config = installed::read_config(&self.local_app_data)?.ok_or("Aucun Syncthing n'est installé.")?;
        let folder_id = config.sharing(data_folder).ok_or("Ce Syncthing ne partage pas le dossier de Neo Calendar.")?.id.clone();

        // Avant de toucher à quoi que ce soit : l'interface du Syncthing installé est-elle pilotable, et répond-elle ?
        // (le moteur de l'app n'est arrêté qu'ensuite : une reprise refusée ne coûte pas la synchro en cours)
        if let Some(reason) = config.unreachable_reason() {
            return Err(format!("{reason} Retirez le dossier Neo Calendar dans Syncthing, puis relancez la détection."));
        }
        let old = config.api()?;
        if !old.is_healthy() {
            return Err("Lancez votre Syncthing, puis réessayez : la reprise passe par son interface locale.".to_string());
        }

        // Le moteur de l'app ne doit avoir aucun autre dossier : jamais deux dossiers synchronisés.
        let engine_config = fs::read_to_string(self.home().join("config.xml")).ok().and_then(|x| installed::parse_config(&x).ok());
        if engine_config.is_some_and(|c| c.folders.iter().any(|f| f.id != folder_id)) {
            return Err("Le moteur de l'app synchronise déjà un autre dossier : désactivez la synchro intégrée d'abord.".to_string());
        }

        self.engine.stop();
        let takeover = installed::withdraw_folder(
            &config,
            &old,
            &installed::config_path(&self.local_app_data),
            &self.state_dir.join("sauvegardes"),
            stamp,
            data_folder,
        )?;

        let give_back = |reason: String| -> String { Self::rollback(&old, &takeover, &self.takeover_path(), &reason) };

        if let Err(e) = fs::create_dir_all(&self.state_dir)
            .and_then(|_| fs::write(self.takeover_path(), serde_json::to_vec_pretty(&takeover).unwrap_or_default()))
        {
            return Err(give_back(format!("Reprise impossible à enregistrer ({e}).")));
        }
        {
            let mut settings = self.lock_settings();
            settings.enabled = true;
            settings.folder_path = Some(data_folder.to_string());
            if let Err(e) = self.save_settings(&settings) {
                drop(settings);
                return Err(give_back(e));
            }
        }
        let seed = FolderSeed { folder_id: Some(takeover.folder_id.clone()), devices: takeover.devices.clone() };
        if let Err(e) = self.start_engine(true, seed) {
            return Err(give_back(e));
        }
        if let Err(e) = self.wait_until_running(Duration::from_secs(90)) {
            self.engine.stop();
            return Err(give_back(e));
        }
        self.engine.log.note(&format!("Reprise du dossier {} depuis le Syncthing installé", takeover.folder_id));
        Ok(())
    }

    /// Une reprise a échoué : le dossier est remis dans le Syncthing installé. `reprise.json` n'est supprimé que si la
    /// remise a réussi ; sinon il reste (« Rendre le dossier à Syncthing » reste proposé, et un nouveau lancement
    /// repart du même identifiant de dossier) et le message donne le chemin de la sauvegarde.
    fn rollback(old: &SyncthingApi, takeover: &Takeover, takeover_file: &Path, reason: &str) -> String {
        match installed::restore_folder(old, takeover) {
            Ok(()) => {
                let _ = fs::remove_file(takeover_file);
                format!("{reason} Le dossier a été rendu à votre Syncthing.")
            }
            Err(e) => format!(
                "{reason} Le dossier n'a pas pu être rendu à votre Syncthing ({e}). Il reste repris par l'app : « Rendre le dossier à Syncthing » reste proposé. Sa configuration d'origine est sauvegardée : {}",
                takeover.backup_path
            ),
        }
    }

    /// « Rendre le dossier à Syncthing » : le moteur de l'app lâche le dossier et s'arrête, puis le Syncthing installé le reprend.
    pub fn give_back(self: &Arc<Self>) -> Result<(), String> {
        let _heavy = self.heavy.lock().unwrap_or_else(|e| e.into_inner());
        self.takeover_running.store(true, Ordering::SeqCst);
        let result = self.give_back_locked();
        self.takeover_running.store(false, Ordering::SeqCst);
        result
    }

    fn give_back_locked(self: &Arc<Self>) -> Result<(), String> {
        let takeover = self.read_takeover().ok_or("Aucune reprise à annuler.")?;
        let config = installed::read_config(&self.local_app_data)?.ok_or("Aucun Syncthing n'est installé.")?;
        if let Some(reason) = config.unreachable_reason() {
            return Err(format!("{reason} Passez-la en HTTP sur cette machine, puis réessayez : le dossier lui est rendu par son interface locale."));
        }
        let old = config.api()?;
        if !old.is_healthy() {
            return Err("Lancez votre Syncthing, puis réessayez : le dossier lui est rendu par son interface locale.".to_string());
        }
        if !self.engine.is_active() {
            // Même identifiant que la reprise : un moteur qui n'a plus le dossier ne s'en crée pas un autre au hasard.
            let seed = FolderSeed { folder_id: Some(takeover.folder_id.clone()), devices: Vec::new() };
            self.start_engine(true, seed)?;
        }
        let api = self.wait_until_running(Duration::from_secs(90))?;
        // Le dossier part du moteur de l'app AVANT de revenir dans l'autre : jamais deux synchros sur le même dossier.
        // (Absent du moteur : un retour précédent l'avait déjà retiré mais n'a pas pu le remettre, on reprend de là.)
        let in_engine = api.folders().map_err(|e| e.message)?.iter().any(|f| f.id == takeover.folder_id);
        if in_engine {
            api.remove_folder(&takeover.folder_id).map_err(|e| e.message)?;
        }
        self.engine.stop();
        {
            let mut settings = self.lock_settings();
            settings.enabled = false;
            self.save_settings(&settings)?;
        }
        installed::restore_folder(&old, &takeover).map_err(|e| {
            format!(
                "Le dossier n'a pas pu être remis dans votre Syncthing ({e}). Relancez « Rendre le dossier à Syncthing » ; sa configuration d'origine est sauvegardée : {}",
                takeover.backup_path
            )
        })?;
        let _ = fs::remove_file(self.takeover_path());
        Ok(())
    }
}

#[cfg(test)]
#[path = "control_tests.rs"]
mod tests;
