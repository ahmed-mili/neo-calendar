//! Le superviseur du moteur : lancement, configuration imposée AVANT le premier `serve`, relances espacées,
//! arrêt propre. Tout tourne sur un fil à lui : l'interface n'attend jamais le moteur.

use super::api::{SyncthingApi, UreqTransport};
use super::config;
use super::log::RotatingLog;
use super::ports;
use super::process;
use super::setup::{FolderSeed, SyncSetup};
use super::supervision::{Decision, EngineState, RestartPolicy};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct EngineParams {
    /// Le `syncthing.exe` livré avec l'app. Le moteur ne tourne JAMAIS depuis lui : `run_once` le copie dans
    /// `<home>\bin\syncthing-<version>.exe` et lance la copie (l'installateur ne trouve jamais le fichier verrouillé).
    pub exe: PathBuf,
    /// La version du moteur (nom de la copie).
    pub version: String,
    /// Le dossier d'état du moteur (clé, certificat, `config.xml`, index, journal) : jamais dans le dossier de notes.
    pub home: PathBuf,
    /// Le dossier synchronisé : le dossier de données choisi dans l'app, directement.
    pub folder_path: PathBuf,
    pub listen_port: Option<u16>,
    pub gui_user: String,
    pub gui_password_hash: String,
    pub seed: FolderSeed,
}

pub struct Hooks {
    /// Le port d'écoute réellement utilisé (le réglage gardé n'était plus libre : un autre a été tiré).
    pub on_listen_port: Box<dyn Fn(u16) + Send + Sync>,
    /// Appelé chaque seconde tant que le moteur tourne. Rend `false` pour demander l'arrêt (un Syncthing installé
    /// partage maintenant le dossier : jamais deux synchros sur le même dossier).
    pub on_tick: Box<dyn Fn(&SyncthingApi) -> bool + Send + Sync>,
}

#[derive(Clone)]
pub struct Snapshot {
    pub state: EngineState,
    pub api: Option<SyncthingApi>,
    pub my_id: Option<String>,
    /// L'adresse de l'interface REST (`127.0.0.1:port`), jamais la clé.
    #[cfg_attr(not(test), allow(dead_code))] // lu par les essais (l'API refuse sans la clé)
    pub gui_address: Option<String>,
    /// Le chemin du dossier du moteur quand il n'est plus le dossier de données de l'app.
    pub mismatch: Option<String>,
}

impl Snapshot {
    fn idle(state: EngineState) -> Self {
        Self { state, api: None, my_id: None, gui_address: None, mismatch: None }
    }
}

pub struct Engine {
    snapshot: Arc<Mutex<Snapshot>>,
    /// Le drapeau d'arrêt du superviseur EN COURS : un drapeau neuf à chaque `start`, pour qu'un `start` qui suit un
    /// `stop` ne rende jamais la main à un ancien superviseur qui n'a pas encore vu l'arrêt.
    stop: Mutex<Arc<AtomicBool>>,
    thread: Mutex<Option<JoinHandle<()>>>,
    /// Sérialise `start` et `stop` (`stop` attend la fin du fil : `thread` n'est pas gardé pendant ce temps).
    lifecycle: Mutex<()>,
    pub log: Arc<RotatingLog>,
}

enum Outcome {
    Stopped,
    Blocked,
    Exited { answered_at: Option<Instant>, error: String },
}

const READY_TIMEOUT: Duration = Duration::from_secs(60);
const STOP_TIMEOUT: Duration = Duration::from_secs(10);

impl Engine {
    pub fn new(log: Arc<RotatingLog>) -> Self {
        Self {
            snapshot: Arc::new(Mutex::new(Snapshot::idle(EngineState::Stopped))),
            stop: Mutex::new(Arc::new(AtomicBool::new(false))),
            thread: Mutex::new(None),
            lifecycle: Mutex::new(()),
            log,
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        self.snapshot.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Le fil superviseur tourne (le moteur marche, ou une relance est programmée).
    pub fn is_active(&self) -> bool {
        self.thread.lock().unwrap_or_else(|e| e.into_inner()).as_ref().is_some_and(|t| !t.is_finished())
    }

    pub fn set_state(&self, state: EngineState) {
        self.snapshot.lock().unwrap_or_else(|e| e.into_inner()).state = state;
    }

    /// Lance le superviseur, sans attendre le moteur. Un superviseur qui a abandonné se relance ici (« Réessayer »).
    pub fn start(&self, params: EngineParams, hooks: Arc<Hooks>, policy: RestartPolicy) -> Result<(), String> {
        let _lifecycle = self.lifecycle.lock().unwrap_or_else(|e| e.into_inner());
        let mut slot = self.thread.lock().unwrap_or_else(|e| e.into_inner());
        if slot.as_ref().is_some_and(|t| !t.is_finished()) {
            return Err("Le moteur de synchronisation est déjà lancé.".to_string());
        }
        if let Some(finished) = slot.take() {
            let _ = finished.join();
        }
        if !params.exe.is_file() {
            self.set_state(EngineState::Missing);
            return Err(format!("Le moteur de synchronisation est introuvable : {}", params.exe.display()));
        }
        let stop = Arc::new(AtomicBool::new(false));
        *self.stop.lock().unwrap_or_else(|e| e.into_inner()) = stop.clone();
        self.set_state(EngineState::Starting);
        let (snapshot, log) = (self.snapshot.clone(), self.log.clone());
        *slot = Some(
            std::thread::Builder::new()
                .name("syncthing-supervisor".into())
                .spawn(move || supervise(params, hooks, policy, snapshot, stop, log))
                .map_err(|e| e.to_string())?,
        );
        Ok(())
    }

    /// Arrêt propre (`/rest/system/shutdown`, puis fin du processus) : bloque jusqu'à 10 s.
    pub fn stop(&self) {
        let _lifecycle = self.lifecycle.lock().unwrap_or_else(|e| e.into_inner());
        self.stop.lock().unwrap_or_else(|e| e.into_inner()).store(true, Ordering::SeqCst);
        let handle = self.thread.lock().unwrap_or_else(|e| e.into_inner()).take();
        if let Some(handle) = handle {
            let _ = handle.join();
        }
        *self.snapshot.lock().unwrap_or_else(|e| e.into_inner()) = Snapshot::idle(EngineState::Stopped);
    }
}

fn sleep_unless_stopped(stop: &AtomicBool, total: Duration) -> bool {
    let end = Instant::now() + total;
    while Instant::now() < end {
        if stop.load(Ordering::SeqCst) {
            return false;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    !stop.load(Ordering::SeqCst)
}

fn supervise(
    params: EngineParams,
    hooks: Arc<Hooks>,
    mut policy: RestartPolicy,
    snapshot: Arc<Mutex<Snapshot>>,
    stop: Arc<AtomicBool>,
    log: Arc<RotatingLog>,
) {
    let set = |state: EngineState| snapshot.lock().unwrap_or_else(|e| e.into_inner()).state = state;
    while !stop.load(Ordering::SeqCst) {
        set(EngineState::Starting);
        let outcome = run_once(&params, &hooks, &snapshot, &stop, &log);
        // Le moteur est terminé : la clé d'API d'exécution, que Syncthing a réécrite dans `config.xml`, n'y reste pas.
        scrub_stale_key(&params.home);
        match outcome {
            Outcome::Stopped => break,
            Outcome::Blocked => {
                log.note("Un Syncthing installé partage maintenant le dossier : le moteur de l'app s'arrête.");
                *snapshot.lock().unwrap_or_else(|e| e.into_inner()) = Snapshot::idle(EngineState::BlockedByInstalled);
                return;
            }
            Outcome::Exited { answered_at, error } => {
                log.note(&format!("Moteur arrêté : {error}"));
                *snapshot.lock().unwrap_or_else(|e| e.into_inner()) = Snapshot::idle(EngineState::Starting);
                let ran = answered_at.map(|at| at.elapsed()).unwrap_or_default();
                match policy.on_exit(ran, answered_at.is_some()) {
                    Decision::RetryIn { delay, attempt } => {
                        set(EngineState::Backoff { attempt, retry_in_ms: delay.as_millis() as u64, error });
                        if !sleep_unless_stopped(&stop, delay) {
                            break;
                        }
                    }
                    Decision::GiveUp => {
                        log.note("Trop d'échecs de suite : plus de relance automatique.");
                        set(EngineState::Failed { error });
                        return;
                    }
                }
            }
        }
    }
    *snapshot.lock().unwrap_or_else(|e| e.into_inner()) = Snapshot::idle(EngineState::Stopped);
}

/// Remplace la clé d'API de `config.xml` (voir `config::scrub_api_key`). Sans effet si le fichier manque ou est illisible.
fn scrub_stale_key(home: &Path) {
    let path = home.join("config.xml");
    let Ok(xml) = fs::read_to_string(&path) else { return };
    let Ok(clean) = config::scrub_api_key(&xml) else { return };
    let temporary = home.join("config.xml.neo-tmp");
    if fs::write(&temporary, clean).is_ok() && fs::rename(&temporary, &path).is_err() {
        let _ = fs::remove_file(&temporary);
    }
}

/// Réécrit `config.xml` avec les options imposées (écriture atomique). Appelé avant CHAQUE `serve` : le port d'écoute
/// gardé est revérifié, et un autre est tiré s'il n'est plus libre.
fn prepare_home(params: &EngineParams, hooks: &Hooks, run_exe: &Path, stop: &AtomicBool) -> Result<u16, String> {
    process::ensure_generated(run_exe, &params.home, stop)?;
    let port = match params.listen_port {
        Some(port) if ports::binds_tcp_and_udp(port) => port,
        _ => {
            let port = ports::pick_listen_port()?;
            (hooks.on_listen_port)(port);
            port
        }
    };
    let path = params.home.join("config.xml");
    let xml = fs::read_to_string(&path).map_err(|e| format!("config.xml illisible : {e}"))?;
    let prepared = config::scrub_api_key(&config::prepare_config(&xml, port, &params.gui_user, &params.gui_password_hash)?)?;
    let temporary = params.home.join("config.xml.neo-tmp");
    fs::write(&temporary, prepared).map_err(|e| format!("config.xml impossible à écrire : {e}"))?;
    fs::rename(&temporary, &path).map_err(|e| format!("config.xml impossible à remplacer : {e}"))?;
    Ok(port)
}

fn run_once(
    params: &EngineParams,
    hooks: &Hooks,
    snapshot: &Mutex<Snapshot>,
    stop: &AtomicBool,
    log: &Arc<RotatingLog>,
) -> Outcome {
    let failed = |error: String| Outcome::Exited { answered_at: None, error };
    log.note("Démarrage du moteur de synchronisation");
    // D'abord le nettoyage d'un orphelin (de n'importe quelle version de notre copie), ensuite la copie : un orphelin
    // vivant verrouillerait la copie à remplacer.
    let bin_dir = params.home.join("bin");
    match process::kill_stale(&params.home, &bin_dir) {
        Ok(Some(pid)) => log.note(&format!("Moteur resté d'un lancement précédent terminé (PID {pid})")),
        Ok(None) => {}
        Err(e) => return failed(e),
    }
    let run_exe = match process::ensure_engine_copy(&params.exe, &bin_dir, &params.version) {
        Ok(copy) => copy,
        Err(e) => return failed(e),
    };
    let port = match prepare_home(params, hooks, &run_exe, stop) {
        Ok(port) => port,
        Err(e) => return failed(e),
    };
    let gui_port = match ports::pick_gui_port() {
        Ok(p) => p,
        Err(e) => return failed(e),
    };
    let key = config::random_chars(b"abcdefghijklmnopqrstuvwxyzABCDEF", 32);
    let address = format!("127.0.0.1:{gui_port}");
    let mut child = match process::spawn(&run_exe, &params.home, &address, &key) {
        Ok(child) => child,
        Err(e) => return failed(format!("Syncthing ne se lance pas : {e}")),
    };
    // Sans fichier de PID, un plantage de l'app laisserait un orphelin introuvable : on n'avance pas sans lui.
    if let Err(e) = process::write_pidfile(&params.home, child.id()) {
        let _ = child.kill();
        let _ = child.wait();
        return failed(format!("Fichier de PID impossible à écrire : {e}"));
    }
    // Le Job Object emporte le moteur si l'app meurt ; sans lui, le nettoyage par PID au lancement suivant prend le relais.
    let _job = match process::bind_to_job(&child) {
        Ok(job) => Some(job),
        Err(e) => {
            log.note(&format!("Avertissement : {e}"));
            None
        }
    };
    process::pump_output(&mut child, log);
    let api = SyncthingApi::new(Arc::new(UreqTransport::new(&address, &key)));

    // Attente de la réponse du moteur.
    let deadline = Instant::now() + READY_TIMEOUT;
    loop {
        if stop.load(Ordering::SeqCst) {
            shut_down(&api, &mut child, &params.home, log);
            return Outcome::Stopped;
        }
        if let Ok(Some(status)) = child.try_wait() {
            process::remove_pidfile(&params.home);
            return failed(format!("Le moteur s'est arrêté au démarrage ({status})"));
        }
        if api.is_healthy() {
            break;
        }
        if Instant::now() > deadline {
            shut_down(&api, &mut child, &params.home, log);
            return failed("Le moteur ne répond pas".to_string());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    let answered_at = Instant::now();

    let my_id = match configure(&api, params, port) {
        Ok((id, mismatch)) => {
            let mut shared = snapshot.lock().unwrap_or_else(|e| e.into_inner());
            *shared = Snapshot { state: EngineState::Running, api: Some(api.clone()), my_id: Some(id.clone()), gui_address: Some(address.clone()), mismatch };
            id
        }
        Err(e) => {
            shut_down(&api, &mut child, &params.home, log);
            return failed(format!("Configuration refusée par le moteur : {e}"));
        }
    };
    log.note(&format!("Moteur prêt (appareil {})", my_id.chars().take(7).collect::<String>()));

    let mut last_tick = Instant::now() - Duration::from_secs(1);
    loop {
        if stop.load(Ordering::SeqCst) {
            shut_down(&api, &mut child, &params.home, log);
            return Outcome::Stopped;
        }
        if let Ok(Some(status)) = child.try_wait() {
            process::remove_pidfile(&params.home);
            return Outcome::Exited { answered_at: Some(answered_at), error: format!("Le moteur s'est arrêté ({status})") };
        }
        if last_tick.elapsed() >= Duration::from_secs(1) {
            last_tick = Instant::now();
            if !(hooks.on_tick)(&api) {
                shut_down(&api, &mut child, &params.home, log);
                return Outcome::Blocked;
            }
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// Options par l'API (la source de vérité après le démarrage), dossier de notes, détection d'un changement de dossier de données.
fn configure(api: &SyncthingApi, params: &EngineParams, port: u16) -> Result<(String, Option<String>), String> {
    api.patch_options(&config::options_json(port)).map_err(|e| e.to_string())?;
    let setup = SyncSetup { api, folder_path: Path::new(&params.folder_path) };
    setup.ensure_folder_seeded(&params.seed).map_err(|e| e.to_string())?;
    let mismatch = setup.folder_mismatch().map_err(|e| e.to_string())?.map(|f| f.path);
    Ok((api.my_id().map_err(|e| e.to_string())?, mismatch))
}

/// `/rest/system/shutdown`, puis fin du processus ; au bout de 10 s, fin forcée DU PROCESSUS QU'ON A LANCÉ (notre `Child`).
fn shut_down(api: &SyncthingApi, child: &mut Child, home: &Path, log: &RotatingLog) {
    let _ = api.shutdown();
    let end = Instant::now() + STOP_TIMEOUT;
    while Instant::now() < end {
        if matches!(child.try_wait(), Ok(Some(_))) {
            process::remove_pidfile(home);
            log.note("Moteur arrêté proprement");
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
    process::remove_pidfile(home);
    log.note("Moteur arrêté de force (il n'a pas répondu à l'arrêt propre)");
}

#[cfg(test)]
#[path = "engine_tests.rs"]
mod tests;
