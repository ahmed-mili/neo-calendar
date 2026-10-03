use super::*;
use crate::sync::config;
use crate::sync::pairing;
use crate::sync::testing::{real_binary, OldSyncthing};
use serde_json::json;

const DEVICE_LAPTOP: &str = "7ZSUPCU-MIU3GEY-RKFNTSV-LN2G6Y4-QEHRT7P-4MRWEY7-UNMY3TG-YKFZEQX";
const DEVICE_PHONE: &str = "FZPTIO7-2SEHRTD-BIQMJM4-3SJGFHY-6RRULGN-Z4STOOQ-NUXYDXE-AIGNRAI";

struct Dirs {
    root: tempfile::TempDir,
}

impl Dirs {
    fn new() -> Self {
        Self { root: tempfile::tempdir().unwrap() }
    }
    fn state(&self) -> PathBuf {
        self.root.path().join("etat")
    }
    /// Le faux `%LOCALAPPDATA%`.
    fn lad(&self) -> PathBuf {
        self.root.path().join("lad")
    }
    fn notes(&self) -> PathBuf {
        self.root.path().join("Neo Calendar")
    }
    fn controller(&self, exe: PathBuf) -> Arc<Controller> {
        fs::create_dir_all(self.lad()).unwrap();
        fs::create_dir_all(self.notes()).unwrap();
        Controller::new(self.state(), self.lad(), exe)
    }
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn write_installed_config(lad: &Path, xml: &str) {
    fs::create_dir_all(lad.join("Syncthing")).unwrap();
    fs::write(lad.join("Syncthing").join("config.xml"), xml).unwrap();
}

fn installed_config_sharing(path: &Path) -> String {
    format!(
        r#"<configuration version="52"><folder id="neo-old" label="Neo" path="{}"><device id="OLD"></device></folder><gui tls="false"><address>127.0.0.1:1</address><apikey>k</apikey></gui></configuration>"#,
        path.display()
    )
}

#[test]
fn a_disabled_sync_never_starts_the_engine() {
    let dirs = Dirs::new();
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    controller.start_if_enabled(Some(&path_text(&dirs.notes()))).unwrap();
    assert_eq!(controller.status().state, EngineState::Stopped);
    assert!(!controller.status().enabled);
}

#[test]
fn enabling_is_remembered_for_the_next_launch() {
    let dirs = Dirs::new();
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    let _ = controller.enable(&path_text(&dirs.notes()));
    let saved = SyncSettings::load(&dirs.state());
    assert!(saved.enabled);
    assert_eq!(saved.folder_path.as_deref(), Some(path_text(&dirs.notes()).as_str()));
    assert!(saved.gui_password_hash.is_some());
    controller.disable().unwrap();
    assert!(!SyncSettings::load(&dirs.state()).enabled);
}

#[test]
fn an_installed_syncthing_that_shares_the_folder_blocks_the_engine() {
    let dirs = Dirs::new();
    write_installed_config(&dirs.lad(), &installed_config_sharing(&dirs.notes()));
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    controller.enable(&path_text(&dirs.notes())).unwrap();
    assert_eq!(controller.status().state, EngineState::BlockedByInstalled);
    assert!(controller.log_text().contains("partage ce dossier"));
}

#[test]
fn an_unreadable_installed_config_blocks_by_prudence() {
    let dirs = Dirs::new();
    write_installed_config(&dirs.lad(), "pas du xml <<<");
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    controller.enable(&path_text(&dirs.notes())).unwrap();
    assert_eq!(controller.status().state, EngineState::BlockedByInstalled);
}

#[test]
fn an_orphan_stfolder_marker_does_not_block_the_engine() {
    // Le partage a été retiré du Syncthing installé : `.stfolder` reste, la configuration ne partage plus ce dossier.
    let dirs = Dirs::new();
    fs::create_dir_all(dirs.notes().join(".stfolder")).unwrap();
    write_installed_config(&dirs.lad(), &installed_config_sharing(&dirs.root.path().join("Ailleurs")));
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    // Le moteur est introuvable (fichier absent) : c'est la preuve qu'il a été DEMANDÉ, donc pas bloqué.
    assert!(controller.enable(&path_text(&dirs.notes())).is_err());
    assert_eq!(controller.status().state, EngineState::Missing);
    assert!(controller.detect(&path_text(&dirs.notes())).is_ok_and(|d| matches!(d, DetectionDto::NotSharing)));
}

#[test]
fn no_installed_syncthing_means_not_installed() {
    let dirs = Dirs::new();
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    assert!(matches!(controller.detect(&path_text(&dirs.notes())).unwrap(), DetectionDto::NotInstalled));
}

#[test]
fn take_over_refuses_when_the_installed_syncthing_does_not_share_the_folder() {
    let dirs = Dirs::new();
    write_installed_config(&dirs.lad(), &installed_config_sharing(&dirs.root.path().join("Ailleurs")));
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    let error = controller.take_over(&path_text(&dirs.notes()), "x").unwrap_err();
    assert!(error.contains("ne partage pas"));
    assert!(!dirs.state().join("sauvegardes").exists(), "rien n'a été sauvegardé ni touché");
}

fn wait_for_file(path: &Path, seconds: u64) -> bool {
    let end = Instant::now() + Duration::from_secs(seconds);
    while Instant::now() < end {
        if path.is_file() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    false
}

#[test]
fn the_folder_is_taken_over_from_a_test_syncthing_then_given_back() {
    let Some(exe) = real_binary() else { return };
    let dirs = Dirs::new();
    let notes = dirs.notes();
    fs::create_dir_all(&notes).unwrap();
    fs::create_dir_all(dirs.lad()).unwrap();
    let vault = dirs.root.path().join("Coffre");
    fs::create_dir_all(vault.join(".stfolder")).unwrap();
    fs::create_dir_all(notes.join(".stfolder")).unwrap();

    // Le « Syncthing installé » : Neo Calendar (partagé avec un laptop et un téléphone) ET un coffre Obsidian.
    let old = OldSyncthing::start(&exe, &dirs.lad());
    let old_id = old.api.my_id().unwrap();
    old.api.put_device(&config::device(DEVICE_LAPTOP, "Laptop")).unwrap();
    old.api.put_device(&config::device(DEVICE_PHONE, "Pixel")).unwrap();
    let neo = config::folder("neo-old", "Neo Calendar", &path_text(&notes), &[old_id.clone(), DEVICE_LAPTOP.into(), DEVICE_PHONE.into()]);
    old.api.put_folder(&neo).unwrap();
    old.api.put_folder(&config::folder("vault", "Coffre", &path_text(&vault), &[old_id.clone(), DEVICE_LAPTOP.into()])).unwrap();
    let config_file = dirs.lad().join("Syncthing").join("config.xml");
    let before = loop {
        let text = fs::read_to_string(&config_file).unwrap();
        if text.contains("neo-old") && text.contains(r#"id="vault""#) {
            break text;
        }
        std::thread::sleep(Duration::from_millis(200));
    };

    let controller = dirs.controller(exe);
    let data = path_text(&notes);
    assert!(matches!(controller.detect(&data).unwrap(), DetectionDto::Shares { running: true, other_folders: 1, .. }));

    // Tant que l'autre Syncthing partage le dossier, le moteur de l'app ne démarre pas dessus.
    controller.enable(&data).unwrap();
    assert_eq!(controller.status().state, EngineState::BlockedByInstalled);

    controller.take_over(&data, "20261002-190000").unwrap();

    let status = controller.status();
    assert_eq!(status.state, EngineState::Running);
    assert!(status.taken_over);
    let engine_folders = controller.api().unwrap().folders().unwrap();
    assert_eq!(engine_folders.len(), 1);
    assert_eq!(engine_folders[0].id, "neo-old", "même identifiant : les autres appareils reconnaissent le dossier");
    for id in [DEVICE_LAPTOP, DEVICE_PHONE] {
        assert!(engine_folders[0].device_ids.iter().any(|d| d == id), "{id} est proposé");
    }
    // Le Syncthing installé ne garde que le coffre, et ses appareils ne sont pas touchés.
    let old_folders = old.api.folders().unwrap();
    assert_eq!(old_folders.iter().map(|f| f.id.as_str()).collect::<Vec<_>>(), vec!["vault"]);
    assert_eq!(old.api.devices().unwrap().len(), 3);
    let backup = dirs.state().join("sauvegardes").join("config.xml.avant-reprise-20261002-190000");
    assert_eq!(fs::read_to_string(backup).unwrap(), before, "sauvegarde identique à la configuration d'origine");

    // Retour en arrière.
    controller.give_back().unwrap();
    assert_eq!(controller.status().state, EngineState::Stopped);
    assert!(!controller.status().taken_over);
    let mut back: Vec<String> = old.api.folders().unwrap().into_iter().map(|f| f.id).collect();
    back.sort();
    assert_eq!(back, vec!["neo-old", "vault"]);
    let restored = old.api.folders().unwrap().into_iter().find(|f| f.id == "neo-old").unwrap();
    assert_eq!(restored.device_ids.len(), 3);
    // Et le moteur de l'app ne redémarre pas dessus tant que l'autre Syncthing le partage.
    controller.enable(&data).unwrap();
    assert_eq!(controller.status().state, EngineState::BlockedByInstalled);
    controller.shutdown();
}

#[test]
fn qr_pairing_accepts_only_the_right_code_and_syncs_both_ways() {
    let Some(exe) = real_binary() else { return };
    let dirs = Dirs::new();
    let controller = dirs.controller(exe.clone());
    let data = path_text(&dirs.notes());
    fs::write(dirs.notes().join("depuis-le-pc.md"), "du PC").unwrap();
    controller.enable(&data).unwrap();
    let pc_api = controller.wait_until_running(Duration::from_secs(90)).unwrap();
    let pc_id = pc_api.my_id().unwrap();
    let folder_id = controller.status().folder.unwrap().id;
    let pc_port = loop {
        if let Some(port) = controller.lock_settings().listen_port {
            break port;
        }
        std::thread::sleep(Duration::from_millis(100));
    };

    let pairing = controller.pairing_start().unwrap();
    assert!(pairing.qr_svg.contains("<svg") && pairing.refresh_in_ms == 2_000 && !pairing.my_id.is_empty());
    let code = controller.pairing.lock().unwrap().current_code().unwrap();

    // Deux « téléphones » : le bon (il a scanné) et un intrus qui présente un mauvais code.
    let phone_engine = |name: &str| -> (Engine, SyncthingApi, String, PathBuf) {
        let base = dirs.root.path().join(name);
        let notes = base.join("notes");
        fs::create_dir_all(&notes).unwrap();
        let engine = Engine::new(Arc::new(RotatingLog::new(base.join("journal"), 100_000)));
        let params = EngineParams {
            exe: exe.clone(),
            version: "2.1.5".into(),
            home: base.join("etat"),
            folder_path: notes.clone(),
            listen_port: None,
            gui_user: "essai".into(),
            gui_password_hash: bcrypt::hash("essai", 4).unwrap(),
            seed: FolderSeed::default(),
        };
        let hooks = Arc::new(Hooks { on_listen_port: Box::new(|_| {}), on_tick: Box::new(|_| true) });
        engine.start(params, hooks, RestartPolicy::default()).unwrap();
        let end = Instant::now() + Duration::from_secs(90);
        let api = loop {
            let snapshot = engine.snapshot();
            if let (EngineState::Running, Some(api)) = (snapshot.state, snapshot.api) {
                break api;
            }
            assert!(Instant::now() < end, "le moteur {name} ne démarre pas");
            std::thread::sleep(Duration::from_millis(200));
        };
        let id = api.my_id().unwrap();
        // Le téléphone neuf n'a pas encore de dossier : celui du moteur de test est retiré.
        let own = api.folders().unwrap().remove(0);
        api.remove_folder(&own.id).unwrap();
        (engine, api, id, notes)
    };
    let (good_engine, good_api, good_id, good_notes) = phone_engine("tel");
    let (bad_engine, bad_api, bad_id, _) = phone_engine("intrus");

    let present = |api: &SyncthingApi, id: &str, name: &str| {
        api.put_device(&config::device(id, name)).unwrap();
        let mut pc = config::device(&pc_id, "PC");
        pc["addresses"] = json!([format!("tcp://127.0.0.1:{pc_port}")]);
        api.put_device(&pc).unwrap();
    };
    present(&bad_api, &bad_id, "Intrus [NC:AAAAAAAAAA]");
    present(&good_api, &good_id, &format!("Pixel 8 [NC:{code}]"));

    // Le bon code est accepté sans question, avec le nom propre (sans code), et le dossier lui est partagé. L'acceptation
    // fait deux appels au moteur (l'appareil, puis le partage du dossier) : on attend les deux, pas seulement le premier.
    let end = Instant::now() + Duration::from_secs(90);
    loop {
        let known = pc_api.devices().unwrap().iter().any(|d| d.id == good_id);
        if known && pc_api.folders().unwrap()[0].device_ids.contains(&good_id) {
            break;
        }
        assert!(Instant::now() < end, "le téléphone n'a pas été accepté");
        std::thread::sleep(Duration::from_millis(500));
    }
    let accepted = pc_api.devices().unwrap().into_iter().find(|d| d.id == good_id).unwrap();
    assert_eq!(accepted.name, "Pixel 8");
    assert!(pc_api.folders().unwrap()[0].device_ids.contains(&good_id));
    assert_eq!(controller.status().pairing_remaining_ms, None, "le code est à usage unique");

    // L'intrus n'est jamais accepté : sa demande reste à accepter à la main, sans son code à l'écran.
    assert!(pc_api.devices().unwrap().iter().all(|d| d.id != bad_id));
    let pending = controller.status().pending;
    if let Some(request) = pending.iter().find(|p| p.id == bad_id) {
        assert_eq!(request.name, "Intrus");
    }

    // Le téléphone adopte le dossier proposé, puis les notes passent dans les deux sens.
    let proposal_path = format!("/rest/cluster/pending/folders?device={}", crate::sync::api::urlencode(&pc_id));
    let end = Instant::now() + Duration::from_secs(90);
    loop {
        let offered = good_api.get(&proposal_path).unwrap();
        if offered.get(&folder_id).is_some() {
            break;
        }
        assert!(Instant::now() < end, "le dossier n'est pas proposé au téléphone");
        std::thread::sleep(Duration::from_millis(500));
    }
    fs::create_dir_all(good_notes.join(".stfolder")).unwrap();
    good_api.put_folder(&config::folder(&folder_id, "Neo Calendar", &path_text(&good_notes), &[good_id.clone(), pc_id.clone()])).unwrap();
    assert!(wait_for_file(&good_notes.join("depuis-le-pc.md"), 120), "PC vers téléphone");
    fs::write(good_notes.join("depuis-le-tel.md"), "du téléphone").unwrap();
    assert!(wait_for_file(&dirs.notes().join("depuis-le-tel.md"), 120), "téléphone vers PC");

    // Le code d'appairage n'est ni dans le journal du moteur ni dans la configuration du moteur ; la clé d'API
    // d'exécution (passée par l'environnement, mais que Syncthing réécrit dans `config.xml` quand il enregistre un
    // changement) ne reste plus dans `config.xml` une fois le moteur arrêté.
    let log = controller.log_text();
    assert!(!log.contains(&code), "le code d'appairage ne doit pas apparaître dans engine.log");
    let runtime_key = pc_api.get("/rest/config/gui").unwrap()["apiKey"].as_str().unwrap_or_default().to_string();
    assert!(runtime_key.len() >= 32, "clé d'exécution lue par l'API");
    good_engine.stop();
    bad_engine.stop();
    controller.shutdown();
    let engine_config = fs::read_to_string(controller.home().join("config.xml")).unwrap();
    assert!(!engine_config.contains(&runtime_key), "la clé d'API d'exécution ne doit pas rester dans config.xml");
    assert!(!engine_config.contains(&code));
    assert!(!controller.log_text().contains(&code));
}

#[test]
fn a_code_consumed_by_a_failed_acceptance_says_to_generate_a_new_one() {
    use crate::sync::testing::FakeTransport;
    let dirs = Dirs::new();
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    controller.lock_settings().folder_path = Some(path_text(&dirs.notes()));
    let code = pairing::new_code();
    controller.pairing.lock().unwrap().start(Instant::now(), code.clone());
    // Le moteur voit la demande portant le bon code, mais refuse l'acceptation (aucune réponse prévue : 404).
    let fake = Arc::new(FakeTransport::default());
    fake.answer("GET /rest/cluster/pending/devices", &format!(r#"{{"{DEVICE_PHONE}":{{"name":"Pixel 8 [NC:{code}]","address":"tcp://1.2.3.4"}}}}"#));
    let api = SyncthingApi::new(fake);
    controller.accept_paired(&api);
    let status = controller.status();
    assert_eq!(status.pairing_remaining_ms, None, "le code est consommé");
    assert!(status.pairing_error.as_deref().is_some_and(|m| m.contains("nouveau code")));
    assert!(!controller.log_text().contains(&code), "le code ne va pas au journal");
    // Un nouveau code efface le message.
    controller.pairing.lock().unwrap().cancel();
    *controller.pairing_error.lock().unwrap() = Some("x".into());
    controller.pairing_cancel();
    assert!(controller.status().pairing_error.is_none());
}

#[test]
fn the_hidden_launch_fallback_never_replays_a_launch_the_interface_already_made() {
    let dirs = Dirs::new();
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    controller.enable(&path_text(&dirs.notes())).unwrap_err();
    assert_eq!(controller.status().state, EngineState::Missing);
    // L'interface a déjà demandé le démarrage : le filet ne refait rien.
    controller.start_if_enabled(None).unwrap_err();
    controller.engine.set_state(EngineState::Failed { error: "abandon".into() });
    controller.start_if_never_launched().unwrap();
    assert_eq!(controller.status().state, EngineState::Failed { error: "abandon".into() });
}

#[test]
fn the_fallback_starts_the_engine_when_the_interface_never_did() {
    let dirs = Dirs::new();
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    let mut saved = SyncSettings::default();
    saved.enabled = true;
    saved.folder_path = Some(path_text(&dirs.notes()));
    saved.save(&dirs.state()).unwrap();
    let controller_again = Controller::new(dirs.state(), dirs.lad(), dirs.root.path().join("absent.exe"));
    drop(controller);
    assert!(controller_again.start_if_never_launched().is_err(), "le moteur introuvable prouve qu'il a été demandé");
    assert_eq!(controller_again.status().state, EngineState::Missing);
}

fn sample_takeover(backup: &str) -> installed::Takeover {
    installed::Takeover {
        folder_id: "neo-old".into(),
        folder: json!({"id": "neo-old", "path": "C:\\Neo Calendar", "devices": [{"deviceID": "OLD"}, {"deviceID": DEVICE_LAPTOP}]}),
        devices: vec![(DEVICE_LAPTOP.into(), "Laptop".into())],
        old_device_id: "OLD".into(),
        backup_path: backup.into(),
        taken_at: "20261002-190000".into(),
    }
}

#[test]
fn a_rollback_that_works_removes_the_takeover_file() {
    use crate::sync::testing::FakeTransport;
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("reprise.json");
    fs::write(&file, "{}").unwrap();
    let fake = Arc::new(FakeTransport::default());
    fake.answer("PUT /rest/config/folders/neo-old", "");
    let message = Controller::rollback(&SyncthingApi::new(fake), &sample_takeover("C:\\sauvegarde"), &file, "Échec.");
    assert!(message.contains("rendu à votre Syncthing") && !message.contains("pas pu"), "{message}");
    assert!(!file.exists());
}

#[test]
fn a_rollback_that_fails_keeps_the_takeover_file_and_says_where_the_backup_is() {
    use crate::sync::testing::FakeTransport;
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("reprise.json");
    fs::write(&file, "{}").unwrap();
    let fake = Arc::new(FakeTransport::default());
    fake.answer_code("PUT /rest/config/folders/neo-old", 404, "introuvable");
    let message = Controller::rollback(&SyncthingApi::new(fake), &sample_takeover("C:\\sauvegarde\\x"), &file, "Le moteur ne démarre pas.");
    assert!(file.exists(), "reprise.json reste : « Rendre le dossier » reste proposé");
    assert!(message.contains("n'a pas pu être rendu") && message.contains("C:\\sauvegarde\\x") && message.contains("Rendre le dossier"), "{message}");
}

#[test]
fn an_engine_that_cannot_start_during_a_takeover_gives_the_folder_back() {
    let Some(exe) = real_binary() else { return };
    let dirs = Dirs::new();
    let notes = dirs.notes();
    fs::create_dir_all(&notes).unwrap();
    fs::create_dir_all(dirs.lad()).unwrap();
    let old = OldSyncthing::start(&exe, &dirs.lad());
    let old_id = old.api.my_id().unwrap();
    old.api.put_device(&config::device(DEVICE_LAPTOP, "Laptop")).unwrap();
    old.api.put_folder(&config::folder("neo-old", "Neo Calendar", &path_text(&notes), &[old_id.clone(), DEVICE_LAPTOP.into()])).unwrap();
    let config_file = dirs.lad().join("Syncthing").join("config.xml");
    while !fs::read_to_string(&config_file).unwrap().contains("neo-old") {
        std::thread::sleep(Duration::from_millis(200));
    }
    // Le moteur de l'app est introuvable : la reprise échoue après le retrait.
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    let error = controller.take_over(&path_text(&notes), "20261002-190000").unwrap_err();
    assert!(error.contains("rendu à votre Syncthing"), "{error}");
    assert!(!dirs.state().join("reprise.json").exists());
    let back = old.api.folders().unwrap();
    assert_eq!(back.iter().map(|f| f.id.as_str()).collect::<Vec<_>>(), vec!["neo-old"]);
    assert_eq!(back[0].device_ids.len(), 2);
    assert!(dirs.state().join("sauvegardes").join("config.xml.avant-reprise-20261002-190000").is_file());
}

#[test]
fn an_interrupted_takeover_restarts_with_the_same_folder_id_and_devices() {
    let dirs = Dirs::new();
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    assert_eq!(controller.seed_for_start(FolderSeed::default()), FolderSeed::default(), "sans reprise : rien d'imposé");
    fs::create_dir_all(dirs.state()).unwrap();
    fs::write(dirs.state().join("reprise.json"), serde_json::to_vec(&sample_takeover("C:\\x")).unwrap()).unwrap();
    let seed = controller.seed_for_start(FolderSeed::default());
    assert_eq!(seed.folder_id.as_deref(), Some("neo-old"));
    assert_eq!(seed.devices, vec![(DEVICE_LAPTOP.to_string(), "Laptop".to_string())]);
    let explicit = FolderSeed { folder_id: Some("autre".into()), devices: vec![] };
    assert_eq!(controller.seed_for_start(explicit.clone()), explicit, "une graine explicite l'emporte");
}

#[test]
fn an_installed_gui_that_is_not_local_or_is_https_is_explained() {
    let dirs = Dirs::new();
    let xml = installed_config_sharing(&dirs.notes()).replace("127.0.0.1:1", "192.168.1.5:8384");
    write_installed_config(&dirs.lad(), &xml);
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    let data = path_text(&dirs.notes());
    match controller.detect(&data).unwrap() {
        DetectionDto::Shares { running: false, reason: Some(reason), .. } => assert!(reason.contains("machine locale"), "{reason}"),
        other => panic!("{other:?}"),
    }
    let error = controller.take_over(&data, "x").unwrap_err();
    assert!(error.contains("machine locale"), "{error}");

    let tls = installed_config_sharing(&dirs.notes()).replace(r#"tls="false""#, r#"tls="true""#);
    write_installed_config(&dirs.lad(), &tls);
    let error = controller.take_over(&data, "x").unwrap_err();
    assert!(error.contains("HTTPS"), "HTTPS annoncé avant toute santé : {error}");
    assert!(!dirs.state().join("sauvegardes").exists());
}

#[test]
fn an_unreachable_installed_syncthing_leaves_the_apps_engine_running() {
    let Some(exe) = real_binary() else { return };
    let dirs = Dirs::new();
    let controller = dirs.controller(exe);
    let data = path_text(&dirs.notes());
    controller.enable(&data).unwrap();
    controller.wait_until_running(Duration::from_secs(90)).unwrap();
    // Un Syncthing installé (arrêté) apparaît dans la configuration : la reprise est refusée sans toucher au moteur.
    write_installed_config(&dirs.lad(), &installed_config_sharing(&dirs.root.path().join("Ailleurs")));
    let xml = installed_config_sharing(&dirs.notes());
    write_installed_config(&dirs.lad(), &xml);
    let error = controller.take_over(&data, "x").unwrap_err();
    assert!(error.contains("Lancez votre Syncthing"), "{error}");
    assert_eq!(controller.status().state, EngineState::Running, "le moteur de l'app n'a pas été arrêté pour rien");
    controller.shutdown();
}

#[test]
fn one_unreadable_read_of_the_installed_config_is_tolerated_two_in_a_row_are_not() {
    use crate::sync::testing::FakeTransport;
    let dirs = Dirs::new();
    let controller = dirs.controller(dirs.root.path().join("absent.exe"));
    controller.lock_settings().folder_path = Some(path_text(&dirs.notes()));
    let api = SyncthingApi::new(Arc::new(FakeTransport::default()));
    let at_check = || controller.ticks.store(EXCLUSIVITY_EVERY_TICKS - 1, Ordering::SeqCst);

    write_installed_config(&dirs.lad(), "pas du xml <<<");
    at_check();
    assert!(controller.tick(&api), "une première lecture illisible est tolérée");
    assert!(controller.log_text().contains("nouvel essai"));
    // Une lecture saine remet le compte à zéro.
    write_installed_config(&dirs.lad(), &installed_config_sharing(&dirs.root.path().join("Ailleurs")));
    at_check();
    assert!(controller.tick(&api));
    write_installed_config(&dirs.lad(), "pas du xml <<<");
    at_check();
    assert!(controller.tick(&api), "illisible de nouveau, mais pas deux fois de suite");
    at_check();
    assert!(!controller.tick(&api), "deux lectures illisibles de suite bloquent");
    assert!(controller.log_text().contains("illisible deux fois de suite"));
    // Un Syncthing qui partage vraiment le dossier bloque tout de suite.
    write_installed_config(&dirs.lad(), &installed_config_sharing(&dirs.notes()));
    at_check();
    assert!(!controller.tick(&api));
}

#[test]
fn a_remote_change_is_reported_only_for_a_file_received_into_our_folder() {
    let finished = |folder: &str, kind: &str, action: &str, error: serde_json::Value| {
        json!({ "id": 1, "type": "ItemFinished", "data": { "folder": folder, "type": kind, "action": action, "error": error } })
    };
    assert!(is_remote_change(&finished("neo", "file", "update", json!(null)), Some("neo")));
    assert!(is_remote_change(&finished("neo", "file", "delete", json!(null)), Some("neo")));
    assert!(!is_remote_change(&finished("autre", "file", "update", json!(null)), Some("neo")));
    assert!(!is_remote_change(&finished("neo", "dir", "update", json!(null)), Some("neo")));
    assert!(!is_remote_change(&finished("neo", "file", "update", json!("refusé")), Some("neo")));
    let state = |from: &str, to: &str| json!({ "id": 2, "type": "StateChanged", "data": { "folder": "neo", "from": from, "to": to } });
    assert!(is_remote_change(&state("syncing", "idle"), Some("neo")));
    assert!(!is_remote_change(&state("scanning", "idle"), Some("neo")), "un scan local n'apporte rien à relire");
    assert!(is_folder_idle(&state("sync-preparing", "idle"), Some("neo")), "la fin d'un lot reçu");
    assert!(!is_folder_idle(&state("idle", "syncing"), Some("neo")));
    assert!(!is_folder_idle(&finished("neo", "file", "update", json!(null)), Some("neo")));
}

/// Deux vrais moteurs reliés en local : ce que l'app écrit part sans attendre le surveillant de fichiers, une
/// suppression aussi, et l'interface est prévenue de chaque fichier reçu.
#[test]
fn changes_cross_within_seconds_and_the_interface_hears_of_each_received_file() {
    let Some(exe) = real_binary() else { return };
    let dirs = Dirs::new();
    let controller = dirs.controller(exe.clone());
    let heard = Arc::new(AtomicU32::new(0));
    let counter = heard.clone();
    // Pendant un renommage : ce que le disque montre au moment où l'interface est prévenue (ancien nom présent ?, nouveau ?).
    let watched_rename: Arc<Mutex<Option<(PathBuf, PathBuf)>>> = Arc::new(Mutex::new(None));
    let seen_at_notice: Arc<Mutex<Vec<(bool, bool)>>> = Arc::new(Mutex::new(Vec::new()));
    let (rename_paths, notices) = (watched_rename.clone(), seen_at_notice.clone());
    controller.set_on_remote_change(Box::new(move || {
        counter.fetch_add(1, Ordering::SeqCst);
        if let Some((old, new)) = rename_paths.lock().unwrap().as_ref() {
            notices.lock().unwrap().push((old.exists(), new.exists()));
        }
    }));
    controller.enable(&path_text(&dirs.notes())).unwrap();
    let pc_api = controller.wait_until_running(Duration::from_secs(90)).unwrap();
    let pc_id = pc_api.my_id().unwrap();
    let folder_id = controller.status().folder.unwrap().id;
    assert_eq!(pc_api.folder_config(&folder_id).unwrap()["fsWatcherDelayS"].as_f64(), Some(1.0));
    let pc_port = loop {
        if let Some(port) = controller.lock_settings().listen_port {
            break port;
        }
        std::thread::sleep(Duration::from_millis(100));
    };

    let base = dirs.root.path().join("tel");
    let phone_notes = base.join("notes");
    fs::create_dir_all(&phone_notes).unwrap();
    let phone_port = Arc::new(Mutex::new(None));
    let port_slot = phone_port.clone();
    let phone = Engine::new(Arc::new(RotatingLog::new(base.join("journal"), 100_000)));
    let params = EngineParams {
        exe,
        version: "2.1.5".into(),
        home: base.join("etat"),
        folder_path: phone_notes.clone(),
        listen_port: None,
        gui_user: "essai".into(),
        gui_password_hash: bcrypt::hash("essai", 4).unwrap(),
        seed: FolderSeed { folder_id: Some(folder_id.clone()), devices: Vec::new() },
    };
    let hooks = Arc::new(Hooks { on_listen_port: Box::new(move |p| *port_slot.lock().unwrap() = Some(p)), on_tick: Box::new(|_| true) });
    phone.start(params, hooks, RestartPolicy::default()).unwrap();
    let end = Instant::now() + Duration::from_secs(90);
    let phone_api = loop {
        let snapshot = phone.snapshot();
        if let (EngineState::Running, Some(api)) = (snapshot.state, snapshot.api) {
            break api;
        }
        assert!(Instant::now() < end, "le moteur du téléphone ne démarre pas");
        std::thread::sleep(Duration::from_millis(200));
    };
    let phone_id = phone_api.my_id().unwrap();
    let phone_port = phone_port.lock().unwrap().unwrap();

    let mut pc = config::device(&pc_id, "PC");
    pc["addresses"] = json!([format!("tcp://127.0.0.1:{pc_port}")]);
    phone_api.put_device(&pc).unwrap();
    phone_api.set_folder_devices(&folder_id, &[phone_id.clone(), pc_id.clone()]).unwrap();
    let mut tel = config::device(&phone_id, "Téléphone");
    tel["addresses"] = json!([format!("tcp://127.0.0.1:{phone_port}")]);
    pc_api.put_device(&tel).unwrap();
    pc_api.set_folder_devices(&folder_id, &[pc_id.clone(), phone_id.clone()]).unwrap();
    let end = Instant::now() + Duration::from_secs(90);
    while !pc_api.connections().unwrap().get(&phone_id).copied().unwrap_or(false) {
        assert!(Instant::now() < end, "les deux moteurs ne se connectent pas");
        std::thread::sleep(Duration::from_millis(200));
    }
    // Les deux index échangés : la première note part de deux moteurs au repos.
    fs::write(dirs.notes().join("amorce.md"), "amorce").unwrap();
    controller.request_scan();
    assert!(wait_for_file(&phone_notes.join("amorce.md"), 60), "amorce");

    let timed = |what: &str, done: &dyn Fn() -> bool| -> Duration {
        let start = Instant::now();
        while !done() {
            assert!(start.elapsed() < Duration::from_secs(90), "{what} : jamais arrivé");
            std::thread::sleep(Duration::from_millis(20));
        }
        let took = start.elapsed();
        eprintln!("LATENCE {what} : {took:?}");
        took
    };

    // Écrit par l'app du PC (scan demandé), puis supprimé par elle.
    fs::write(dirs.notes().join("cree-par-le-pc.md"), "PC").unwrap();
    controller.request_scan();
    let created = timed("création PC (app) -> téléphone", &|| phone_notes.join("cree-par-le-pc.md").is_file());
    fs::remove_file(dirs.notes().join("cree-par-le-pc.md")).unwrap();
    controller.request_scan();
    let deleted = timed("suppression PC (app) -> téléphone", &|| !phone_notes.join("cree-par-le-pc.md").exists());

    // Écrit hors de toute app sur le « téléphone » : seul son surveillant de fichiers (1 s) le voit, suppression comprise.
    let before = heard.load(Ordering::SeqCst);
    fs::write(phone_notes.join("cree-par-le-tel.md"), "tel").unwrap();
    let watched = timed("création téléphone (surveillant) -> PC", &|| dirs.notes().join("cree-par-le-tel.md").is_file());
    timed("interface du PC prévenue", &|| heard.load(Ordering::SeqCst) > before);
    fs::remove_file(phone_notes.join("cree-par-le-tel.md")).unwrap();
    let watched_delete = timed("suppression téléphone (surveillant) -> PC", &|| !dirs.notes().join("cree-par-le-tel.md").exists());

    // Une note ancienne supprimée hors de l'app : sans évènement récent sur elle, le surveillant la retient comme un
    // possible renommage (`fsWatcherTimeoutS`), ce que l'app ramène au délai ordinaire.
    fs::write(phone_notes.join("ancienne.md"), "ancienne").unwrap();
    timed("note ancienne arrivée sur le PC", &|| dirs.notes().join("ancienne.md").is_file());
    std::thread::sleep(Duration::from_secs(8));
    fs::remove_file(phone_notes.join("ancienne.md")).unwrap();
    let old_delete = timed("suppression d'une note ancienne (surveillant) -> PC", &|| !dirs.notes().join("ancienne.md").exists());
    // Comme une vraie note : dans le dossier d'un calendrier.
    fs::create_dir_all(dirs.notes().join("Divers")).unwrap();
    fs::write(dirs.notes().join("Divers").join("ancienne-pc.md"), "ancienne").unwrap();
    timed("note ancienne du PC arrivée sur le téléphone", &|| phone_notes.join("Divers").join("ancienne-pc.md").is_file());
    std::thread::sleep(Duration::from_secs(10));
    fs::remove_file(dirs.notes().join("Divers").join("ancienne-pc.md")).unwrap();
    let old_pc_delete = timed("suppression d'une note ancienne du PC (surveillant) -> téléphone", &|| !phone_notes.join("Divers").join("ancienne-pc.md").exists());

    // Un renommage fait sur le « téléphone » : le PC n'est prévenu qu'une fois les deux moitiés arrivées.
    fs::write(phone_notes.join("avant.md"), "renommée").unwrap();
    timed("note à renommer arrivée sur le PC", &|| dirs.notes().join("avant.md").is_file());
    std::thread::sleep(Duration::from_secs(2));
    *watched_rename.lock().unwrap() = Some((dirs.notes().join("avant.md"), dirs.notes().join("après.md")));
    fs::rename(phone_notes.join("avant.md"), phone_notes.join("après.md")).unwrap();
    timed("renommage arrivé sur le PC", &|| dirs.notes().join("après.md").is_file() && !dirs.notes().join("avant.md").exists());
    std::thread::sleep(Duration::from_secs(2));
    let notices = seen_at_notice.lock().unwrap().clone();

    phone.stop();
    controller.shutdown();
    assert!(!notices.is_empty(), "l'interface n'a pas été prévenue du renommage");
    assert!(notices.iter().all(|&(old, new)| !old && new), "relecture entre les deux moitiés du renommage : {notices:?}");
    assert!(created < Duration::from_secs(1), "création par l'app : {created:?}");
    assert!(deleted < Duration::from_secs(1), "suppression par l'app : {deleted:?}");
    assert!(watched < Duration::from_millis(2_500), "création hors de l'app : {watched:?}");
    assert!(watched_delete < Duration::from_millis(2_500), "suppression hors de l'app : {watched_delete:?}");
    assert!(old_delete < Duration::from_millis(2_500), "suppression d'une note ancienne hors de l'app : {old_delete:?}");
    assert!(old_pc_delete < Duration::from_millis(2_500), "suppression d'une note ancienne du PC hors de l'app : {old_pc_delete:?}");
}
