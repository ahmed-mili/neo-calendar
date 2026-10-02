//! Le processus Syncthing : génération de l'identité, lancement, journal, nettoyage d'un moteur resté d'un
//! lancement précédent. Jamais un arrêt « par nom » : d'autres Syncthing tournent sur ce PC (celui de
//! l'utilisateur, ceux d'autres applications). On ne termine que le PID qu'on a lancé, ou celui que notre
//! fichier `engine.pid` désigne ET dont le programme est exactement notre `syncthing.exe`.

use super::log::RotatingLog;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;

/// Le moteur est un programme console : sans ce drapeau, Windows lui ouvre une fenêtre noire.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const PID_FILE: &str = "engine.pid";

/// `syncthing.exe` est posé par Tauri (`bundle.externalBin`) à côté de l'exécutable de l'app.
pub fn engine_exe_beside(current_exe: &Path) -> PathBuf {
    current_exe.with_file_name("syncthing.exe")
}

fn command(exe: &Path) -> Command {
    let mut command = Command::new(exe);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// Le moteur tourne depuis une COPIE dans le dossier d'état de l'app, jamais depuis le dossier d'installation : un
/// moteur resté après un plantage de l'app ne verrouille alors pas `syncthing.exe` pendant une mise à jour ou une
/// réinstallation. La copie est refaite si elle manque ou si sa taille diffère ; les copies d'anciennes versions sont
/// supprimées quand elles ne sont pas en cours d'utilisation.
pub fn ensure_engine_copy(source: &Path, bin_dir: &Path, version: &str) -> Result<PathBuf, String> {
    let destination = bin_dir.join(format!("syncthing-{version}.exe"));
    let expected = fs::metadata(source).map_err(|e| format!("Le moteur est introuvable ({}) : {e}", source.display()))?.len();
    if fs::metadata(&destination).map(|m| m.len()).ok() == Some(expected) {
        return Ok(destination);
    }
    fs::create_dir_all(bin_dir).map_err(|e| format!("Dossier du moteur impossible à créer : {e}"))?;
    let temporary = bin_dir.join(format!("syncthing-{version}.exe.neo-tmp"));
    fs::copy(source, &temporary).map_err(|e| format!("Copie du moteur impossible : {e}"))?;
    fs::rename(&temporary, &destination).map_err(|e| format!("Copie du moteur impossible à finaliser : {e}"))?;
    if let Ok(entries) = fs::read_dir(bin_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with("syncthing-") && name.ends_with(".exe") && entry.path() != destination {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    Ok(destination)
}

/// Crée la clé, le certificat et la configuration du moteur s'ils manquent (`syncthing generate`).
pub fn ensure_generated(exe: &Path, home: &Path) -> Result<(), String> {
    let complete = ["config.xml", "cert.pem", "key.pem"].iter().all(|f| home.join(f).is_file());
    if complete {
        return Ok(());
    }
    fs::create_dir_all(home).map_err(|e| format!("Dossier d'état impossible à créer : {e}"))?;
    let output = command(exe)
        .arg("generate")
        .arg(format!("--home={}", home.display()))
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("Syncthing ne se lance pas : {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!("syncthing generate a échoué : {}", String::from_utf8_lossy(&output.stderr).trim()))
    }
}

/// Lance le moteur. L'adresse et la clé de l'interface passent par l'environnement, jamais par la ligne de
/// commande (que les autres programmes du PC peuvent lire).
pub fn spawn(exe: &Path, home: &Path, gui_address: &str, api_key: &str) -> io::Result<Child> {
    command(exe)
        .arg("serve")
        .arg(format!("--home={}", home.display()))
        .args(["--no-browser", "--no-restart", "--no-upgrade", "--log-file=-"])
        .env("STGUIADDRESS", gui_address)
        .env("STGUIAPIKEY", api_key)
        .env("STNORESTART", "1")
        .env("STNOUPGRADE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
}

/// Vide la sortie du processus dans le journal (un tuyau qui n'est pas lu bloque le moteur).
pub fn pump_output(child: &mut Child, log: &Arc<RotatingLog>) {
    fn pump(mut source: impl Read + Send + 'static, log: Arc<RotatingLog>) {
        std::thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            while let Ok(n) = source.read(&mut buffer) {
                if n == 0 {
                    break;
                }
                log.write(&buffer[..n]);
            }
        });
    }
    if let Some(out) = child.stdout.take() {
        pump(out, log.clone());
    }
    if let Some(err) = child.stderr.take() {
        pump(err, log.clone());
    }
}

pub fn write_pidfile(home: &Path, pid: u32) -> io::Result<()> {
    fs::write(home.join(PID_FILE), pid.to_string())
}

pub fn remove_pidfile(home: &Path) {
    let _ = fs::remove_file(home.join(PID_FILE));
}

/// Le programme du processus est-il exactement notre `syncthing.exe` ? (casse ignorée, comme Windows)
pub fn is_our_engine(image: Option<&str>, exe: &Path) -> bool {
    match image {
        Some(image) => image.eq_ignore_ascii_case(&exe.to_string_lossy()),
        None => false,
    }
}

/// Un moteur resté d'un lancement précédent (l'app a été tuée sans l'arrêter) : le PID de `engine.pid`, s'il
/// désigne toujours NOTRE `syncthing.exe`, est terminé. Un PID réutilisé par un autre programme n'est jamais touché.
/// Rend le PID terminé.
pub fn kill_stale(home: &Path, exe: &Path) -> Option<u32> {
    let text = fs::read_to_string(home.join(PID_FILE)).ok()?;
    remove_pidfile(home);
    let pid: u32 = text.trim().parse().ok()?;
    if pid == std::process::id() || !is_our_engine(sys::image_path(pid).as_deref(), exe) {
        return None;
    }
    sys::terminate(pid).then_some(pid)
}

#[cfg(windows)]
mod sys {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, TerminateProcess, PROCESS_QUERY_LIMITED_INFORMATION,
        PROCESS_TERMINATE,
    };

    /// Le chemin du programme d'un processus, `None` s'il n'existe plus ou n'est pas lisible.
    pub fn image_path(pid: u32) -> Option<String> {
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return None;
            }
            let mut buffer = [0u16; 1024];
            let mut length = buffer.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut length);
            CloseHandle(handle);
            (ok != 0).then(|| String::from_utf16_lossy(&buffer[..length as usize]))
        }
    }

    pub fn terminate(pid: u32) -> bool {
        unsafe {
            let handle = OpenProcess(PROCESS_TERMINATE, 0, pid);
            if handle.is_null() {
                return false;
            }
            let ok = TerminateProcess(handle, 1);
            CloseHandle(handle);
            ok != 0
        }
    }
}

#[cfg(not(windows))]
mod sys {
    pub fn image_path(_pid: u32) -> Option<String> {
        None
    }
    pub fn terminate(_pid: u32) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_our_exact_program_counts_as_our_engine() {
        let exe = Path::new(r"C:\Program Files\Neo Calendar\syncthing.exe");
        assert!(is_our_engine(Some(r"c:\program files\neo calendar\SYNCTHING.EXE"), exe));
        assert!(!is_our_engine(Some(r"C:\Users\Ahmed\AppData\Local\Syncthing\syncthing.exe"), exe));
        assert!(!is_our_engine(Some(r"C:\Program Files\Neo Calendar\syncthing.exe.bak"), exe));
        assert!(!is_our_engine(None, exe));
    }

    #[test]
    fn the_engine_is_copied_once_and_old_versions_are_cleaned() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("syncthing.exe");
        fs::write(&source, b"moteur v2").unwrap();
        let bin = dir.path().join("bin");
        fs::create_dir_all(&bin).unwrap();
        fs::write(bin.join("syncthing-2.1.4.exe"), b"ancien").unwrap();

        let copy = ensure_engine_copy(&source, &bin, "2.1.5").unwrap();
        assert_eq!(copy, bin.join("syncthing-2.1.5.exe"));
        assert_eq!(fs::read(&copy).unwrap(), b"moteur v2");
        assert!(!bin.join("syncthing-2.1.4.exe").exists());
        // Déjà là, même taille : rien n'est recopié.
        fs::write(&copy, b"MOTEUR V2").unwrap();
        ensure_engine_copy(&source, &bin, "2.1.5").unwrap();
        assert_eq!(fs::read(&copy).unwrap(), b"MOTEUR V2");
        // Une taille différente (copie interrompue, mise à jour) : refaite.
        fs::write(&copy, b"court").unwrap();
        ensure_engine_copy(&source, &bin, "2.1.5").unwrap();
        assert_eq!(fs::read(&copy).unwrap(), b"moteur v2");
        assert!(ensure_engine_copy(&dir.path().join("absent.exe"), &bin, "2.1.5").is_err());
    }

    #[test]
    fn the_engine_sits_beside_the_app_executable() {
        assert_eq!(
            engine_exe_beside(Path::new(r"C:\Apps\Neo Calendar\neo-calendar.exe")),
            PathBuf::from(r"C:\Apps\Neo Calendar\syncthing.exe")
        );
    }

    #[test]
    fn the_process_is_started_without_a_console_and_never_killed_by_name() {
        let source = include_str!("process.rs");
        assert!(source.contains("creation_flags(CREATE_NO_WINDOW)"));
        // Les motifs sont assemblés : écrits en clair, ce test se compterait lui-même.
        for forbidden in [["task", "kill"].concat(), ["Stop-Process", " -Name"].concat(), ["pk", "ill"].concat(), ["/", "IM"].concat()] {
            assert_eq!(source.matches(&forbidden).count(), 0, "{forbidden}");
        }
    }

    #[test]
    fn a_missing_or_garbled_pid_file_kills_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("syncthing.exe");
        assert_eq!(kill_stale(dir.path(), &exe), None);
        fs::write(dir.path().join(PID_FILE), "pas un nombre").unwrap();
        assert_eq!(kill_stale(dir.path(), &exe), None);
        assert!(!dir.path().join(PID_FILE).exists(), "le fichier est consommé");
    }

    /// Un vrai processus, lancé depuis une copie de `ping.exe` renommée `syncthing.exe` : c'est NOTRE moteur.
    #[cfg(windows)]
    fn fake_engine(dir: &Path) -> (PathBuf, Child) {
        let system = std::env::var("SystemRoot").unwrap();
        let exe = dir.join("syncthing.exe");
        fs::copy(Path::new(&system).join("System32").join("PING.EXE"), &exe).unwrap();
        let child = command(&exe).args(["-n", "60", "127.0.0.1"]).stdout(Stdio::null()).spawn().unwrap();
        (exe, child)
    }

    #[cfg(windows)]
    #[test]
    fn a_stale_engine_of_ours_is_terminated_by_pid() {
        let dir = tempfile::tempdir().unwrap();
        let (exe, mut child) = fake_engine(dir.path());
        write_pidfile(dir.path(), child.id()).unwrap();
        assert_eq!(kill_stale(dir.path(), &exe), Some(child.id()));
        assert!(child.wait().is_ok(), "le processus est bien terminé");
    }

    #[cfg(windows)]
    #[test]
    fn a_pid_reused_by_another_program_is_never_touched() {
        let dir = tempfile::tempdir().unwrap();
        let (_ours, mut ours) = fake_engine(dir.path());
        let _ = ours.kill();
        let _ = ours.wait();
        // Un autre programme (un Syncthing d'un autre dossier, par exemple) : même nom de fichier, autre chemin.
        let other_dir = tempfile::tempdir().unwrap();
        let (_other_exe, mut other) = fake_engine(other_dir.path());
        write_pidfile(dir.path(), other.id()).unwrap();
        assert_eq!(kill_stale(dir.path(), &dir.path().join("syncthing.exe")), None);
        assert!(other.try_wait().unwrap().is_none(), "l'autre processus tourne toujours");
        other.kill().unwrap();
        other.wait().unwrap();
    }
}
