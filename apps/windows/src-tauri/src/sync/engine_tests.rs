use super::*;

use crate::sync::testing::real_binary;

fn fast_policy() -> RestartPolicy {
    RestartPolicy::new(5, Duration::from_millis(20), Duration::from_millis(100), Duration::from_secs(60))
}

fn hooks(keep_running: Arc<AtomicBool>) -> Arc<Hooks> {
    Arc::new(Hooks {
        on_listen_port: Box::new(|_| {}),
        on_tick: Box::new(move |_| keep_running.load(Ordering::SeqCst)),
    })
}

fn params(dir: &Path, exe: PathBuf) -> EngineParams {
    EngineParams {
        exe,
        home: dir.join("etat"),
        folder_path: dir.join("Neo Calendar"),
        listen_port: None,
        gui_user: "neo-calendar".into(),
        gui_password_hash: "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234".into(),
        seed: FolderSeed::default(),
    }
}

fn wait_for(engine: &Engine, what: &str, check: impl Fn(&EngineState) -> bool, seconds: u64) {
    let end = Instant::now() + Duration::from_secs(seconds);
    while Instant::now() < end {
        if check(&engine.snapshot().state) {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    panic!("{what} : état {:?}", engine.snapshot().state);
}

fn new_engine(dir: &Path) -> (Engine, Arc<RotatingLog>) {
    let log = Arc::new(RotatingLog::new(dir.join("journal"), 100_000));
    (Engine::new(log.clone()), log)
}

#[test]
fn a_missing_engine_binary_is_reported_not_retried() {
    let dir = tempfile::tempdir().unwrap();
    let (engine, _) = new_engine(dir.path());
    let result = engine.start(
        params(dir.path(), dir.path().join("absent.exe")),
        hooks(Arc::new(AtomicBool::new(true))),
        fast_policy(),
    );
    assert!(result.is_err());
    assert_eq!(engine.snapshot().state, EngineState::Missing);
    assert!(!engine.is_active());
}

/// Un « moteur » qui échoue toujours : une copie de `find.exe` renommée `syncthing.exe` (`find generate --home=…` échoue aussitôt).
#[cfg(windows)]
fn failing_engine(dir: &Path) -> PathBuf {
    let exe = dir.join("syncthing.exe");
    let system = std::env::var("SystemRoot").unwrap();
    fs::copy(Path::new(&system).join("System32").join("FIND.EXE"), &exe).unwrap();
    exe
}

#[cfg(windows)]
#[test]
fn an_engine_that_keeps_failing_is_retried_then_abandoned_at_the_fifth_failure() {
    let dir = tempfile::tempdir().unwrap();
    let (engine, log) = new_engine(dir.path());
    let exe = failing_engine(dir.path());
    engine.start(params(dir.path(), exe.clone()), hooks(Arc::new(AtomicBool::new(true))), fast_policy()).unwrap();
    wait_for(&engine, "abandon", |s| matches!(s, EngineState::Failed { .. }), 20);
    assert!(log.read_all().contains("Trop d'échecs de suite"));
    // « Réessayer » : on repart de zéro, et on abandonne de nouveau au cinquième échec.
    engine.start(params(dir.path(), exe), hooks(Arc::new(AtomicBool::new(true))), fast_policy()).unwrap();
    wait_for(&engine, "nouvel abandon", |s| matches!(s, EngineState::Failed { .. }), 20);
    engine.stop();
    assert_eq!(engine.snapshot().state, EngineState::Stopped);
}

#[cfg(windows)]
#[test]
fn stopping_during_a_retry_delay_is_immediate() {
    let dir = tempfile::tempdir().unwrap();
    let (engine, _) = new_engine(dir.path());
    let slow = RestartPolicy::new(5, Duration::from_secs(30), Duration::from_secs(300), Duration::from_secs(60));
    engine.start(params(dir.path(), failing_engine(dir.path())), hooks(Arc::new(AtomicBool::new(true))), slow).unwrap();
    wait_for(&engine, "attente de relance", |s| matches!(s, EngineState::Backoff { .. }), 20);
    let started = Instant::now();
    engine.stop();
    assert!(started.elapsed() < Duration::from_secs(3));
    assert_eq!(engine.snapshot().state, EngineState::Stopped);
}

#[test]
fn the_real_engine_runs_with_the_imposed_configuration_and_stops_cleanly() {
    let Some(exe) = real_binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let (engine, _) = new_engine(dir.path());
    let p = params(dir.path(), exe);
    let home = p.home.clone();
    engine.start(p.clone(), hooks(Arc::new(AtomicBool::new(true))), RestartPolicy::default()).unwrap();
    wait_for(&engine, "moteur prêt", |s| *s == EngineState::Running, 90);

    let snapshot = engine.snapshot();
    let api = snapshot.api.clone().unwrap();
    // Un moteur neuf n'a aucun dossier par défaut : seulement celui de l'app, créé sur le dossier de données.
    let folders = api.folders().unwrap();
    assert_eq!(folders.len(), 1);
    assert!(crate::sync::setup::same_path(&folders[0].path, &p.folder_path.to_string_lossy()));
    assert!(p.folder_path.join(".stfolder").is_dir());
    assert!(snapshot.mismatch.is_none());
    // L'interface web est verrouillée et les options imposées sont écrites avant le premier serve.
    let written = fs::read_to_string(home.join("config.xml")).unwrap();
    assert!(written.contains("<user>neo-calendar</user>") && written.contains("<password>$2b$"));
    assert!(written.contains("<localAnnounceEnabled>false</localAnnounceEnabled>"));
    assert!(home.join("engine.pid").is_file());

    engine.stop();
    assert!(!home.join("engine.pid").exists(), "le fichier de PID est retiré à l'arrêt propre");
    assert_eq!(engine.snapshot().state, EngineState::Stopped);
    assert!(api.my_id().is_err(), "le moteur ne répond plus");

    // Relance : même identité, même dossier.
    engine.start(p, hooks(Arc::new(AtomicBool::new(true))), RestartPolicy::default()).unwrap();
    wait_for(&engine, "moteur prêt (2)", |s| *s == EngineState::Running, 90);
    assert_eq!(engine.snapshot().api.unwrap().folders().unwrap().len(), 1);
    engine.stop();
}

#[test]
fn the_real_engine_stops_itself_when_the_exclusivity_hook_says_so() {
    let Some(exe) = real_binary() else { return };
    let dir = tempfile::tempdir().unwrap();
    let (engine, _) = new_engine(dir.path());
    let keep = Arc::new(AtomicBool::new(true));
    engine.start(params(dir.path(), exe), hooks(keep.clone()), RestartPolicy::default()).unwrap();
    wait_for(&engine, "moteur prêt", |s| *s == EngineState::Running, 90);
    keep.store(false, Ordering::SeqCst);
    wait_for(&engine, "blocage", |s| *s == EngineState::BlockedByInstalled, 30);
    engine.stop();
}
