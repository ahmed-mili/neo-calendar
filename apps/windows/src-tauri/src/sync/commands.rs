//! Les commandes Tauri de la synchro : de fines enveloppes autour de `Controller` (qui porte toute la logique et
//! ses tests). Chaque commande est `async` : Tauri la porte alors sur son pool de threads, pas sur celui de la
//! fenêtre (elles attendent le moteur, le disque ou un autre Syncthing).

use super::control::{Controller, DetectionDto, PairingDto, StatusDto};
use super::process::engine_exe_beside;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub struct SyncState(pub Arc<Controller>);

/// Le contrôleur, ou une erreur claire quand `setup` n'a pas pu le poser (jamais de panique dans une commande).
fn controller(app: &AppHandle) -> Result<Arc<Controller>, String> {
    app.try_state::<SyncState>().map(|state| state.0.clone()).ok_or_else(|| "La synchronisation intégrée est indisponible.".to_string())
}

/// Pose le contrôleur (une lecture de petit fichier : rien qui retarde le premier écran) ; ne lance PAS le moteur.
/// Le moteur démarre quand l'interface appelle `sync_start`, une fois la grille affichée. Un lancement masqué (au
/// démarrage de Windows) a un filet : sans appel de l'interface au bout de 15 secondes, le moteur démarre seul.
pub fn setup(app: &AppHandle) -> Result<(), String> {
    let state_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("syncthing");
    let local_app_data = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).ok_or("LOCALAPPDATA est absent")?;
    let exe = engine_exe_beside(&std::env::current_exe().map_err(|e| e.to_string())?);
    app.manage(SyncState(Controller::new(state_dir, local_app_data, exe)));

    let fallback = controller(app)?;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(15));
        let _ = fallback.start_if_never_launched();
    });
    Ok(())
}

/// Arrêt propre du moteur avant « Quitter », une mise à jour ou la fin du processus.
pub fn shutdown(app: &AppHandle) {
    if let Some(state) = app.try_state::<SyncState>() {
        state.0.shutdown();
    }
}

/// Relance le moteur après une mise à jour qui a échoué (il avait été arrêté pour elle).
pub fn resume(app: &AppHandle) {
    if let Some(state) = app.try_state::<SyncState>() {
        let _ = state.0.start_if_enabled(None);
    }
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_start(app: AppHandle, data_folder: Option<String>) -> Result<(), String> {
    controller(&app)?.start_if_enabled(data_folder.as_deref())
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_status(app: AppHandle) -> Result<StatusDto, String> {
    Ok(controller(&app)?.status())
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_enable(app: AppHandle, data_folder: String) -> Result<(), String> {
    controller(&app)?.enable(&data_folder)
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_disable(app: AppHandle) -> Result<(), String> {
    controller(&app)?.disable()
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_retry(app: AppHandle) -> Result<(), String> {
    controller(&app)?.retry()
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_pairing_start(app: AppHandle) -> Result<PairingDto, String> {
    controller(&app)?.pairing_start()
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_pairing_next(app: AppHandle) -> Result<PairingDto, String> {
    controller(&app)?.pairing_next()
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_add_device(app: AppHandle, device_id: String, name: String) -> Result<(), String> {
    controller(&app)?.add_device(&device_id, &name)
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_pairing_cancel(app: AppHandle) -> Result<(), String> {
    controller(&app)?.pairing_cancel();
    Ok(())
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_accept_device(app: AppHandle, device_id: String) -> Result<(), String> {
    controller(&app)?.accept_device(&device_id)
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_reject_device(app: AppHandle, device_id: String) -> Result<(), String> {
    controller(&app)?.reject_device(&device_id)
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_remove_device(app: AppHandle, device_id: String) -> Result<(), String> {
    controller(&app)?.remove_device(&device_id)
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_repoint_folder(app: AppHandle) -> Result<(), String> {
    controller(&app)?.repoint_folder()
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_detect(app: AppHandle, data_folder: String) -> Result<DetectionDto, String> {
    controller(&app)?.detect(&data_folder)
}

/// `stamp` (horodatage choisi par l'interface, `20261002-190000`) ne sert qu'à nommer la sauvegarde : chiffres et
/// tirets seulement, jamais un chemin.
fn valid_stamp(stamp: &str) -> bool {
    !stamp.is_empty() && stamp.len() <= 32 && stamp.bytes().all(|b| b.is_ascii_digit() || b == b'-')
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_take_over(app: AppHandle, data_folder: String, stamp: String) -> Result<(), String> {
    if !valid_stamp(&stamp) {
        return Err("Horodatage de sauvegarde invalide.".to_string());
    }
    controller(&app)?.take_over(&data_folder, &stamp)
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_give_back(app: AppHandle) -> Result<(), String> {
    controller(&app)?.give_back()
}

#[tauri::command(rename_all = "camelCase", async)]
pub fn sync_log(app: AppHandle) -> Result<String, String> {
    Ok(controller(&app)?.log_text())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_sync_command_runs_off_the_window_thread() {
        let source = include_str!("commands.rs");
        let mut checked = 0;
        for (index, _) in source.match_indices("\npub fn sync_") {
            let attribute_start = source[..index].rfind("#[tauri::command").expect("une commande Tauri");
            let attribute = &source[attribute_start..index];
            assert!(attribute.contains("async"), "{}", &source[index..index + 40]);
            checked += 1;
        }
        assert_eq!(checked, 17);
    }

    #[test]
    fn a_stamp_is_digits_and_dashes_only() {
        assert!(valid_stamp("20261002-190000"));
        for bad in ["", "..\\x", "a/b", "2026 10", &"1".repeat(33)] {
            assert!(!valid_stamp(bad), "{bad}");
        }
    }
}
