//! Le processus Syncthing : génération de l'identité, lancement, journal, nettoyage d'un moteur resté d'un
//! lancement précédent. Jamais un arrêt « par nom » : d'autres Syncthing tournent sur ce PC (celui de
//! l'utilisateur, ceux d'autres applications). On ne termine que le PID qu'on a lancé, ou celui que notre
//! fichier `engine.pid` désigne ET dont le programme est exactement notre `syncthing.exe`.

use super::log::RotatingLog;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Le moteur est un programme console : sans ce drapeau, Windows lui ouvre une fenêtre noire.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const PID_FILE: &str = "engine.pid";
const GENERATE_TIMEOUT: Duration = Duration::from_secs(60);

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

/// Crée la clé, le certificat et la configuration du moteur s'ils manquent (`syncthing generate`). Borné à 60 s et
/// interrompu par `stop` : une génération qui se fige ne bloque jamais l'arrêt de l'app.
pub fn ensure_generated(exe: &Path, home: &Path, stop: &AtomicBool) -> Result<(), String> {
    let complete = ["config.xml", "cert.pem", "key.pem"].iter().all(|f| home.join(f).is_file());
    if complete {
        return Ok(());
    }
    fs::create_dir_all(home).map_err(|e| format!("Dossier d'état impossible à créer : {e}"))?;
    let mut child = command(exe)
        .arg("generate")
        .arg(format!("--home={}", home.display()))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Syncthing ne se lance pas : {e}"))?;
    let deadline = Instant::now() + GENERATE_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut error = String::new();
                if let Some(mut pipe) = child.stderr.take() {
                    let _ = pipe.read_to_string(&mut error);
                }
                return if status.success() {
                    Ok(())
                } else {
                    Err(format!("syncthing generate a échoué : {}", error.trim()))
                };
            }
            Ok(None) => {}
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("syncthing generate illisible : {e}"));
            }
        }
        let interrupted = stop.load(Ordering::SeqCst);
        if interrupted || Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(if interrupted { "Génération interrompue".to_string() } else { "syncthing generate ne répond pas".to_string() });
        }
        std::thread::sleep(Duration::from_millis(50));
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

/// Copie une sortie dans le journal, coupée sur les fins de ligne : un code d'appairage coupé en deux par deux
/// lectures ne se glisse jamais dans le journal (la rédaction du journal voit le code en entier).
pub fn pump_lines(mut source: impl Read, log: &RotatingLog) {
    const KEEP: usize = 32;
    let mut buffer = [0u8; 4096];
    let mut pending: Vec<u8> = Vec::new();
    while let Ok(n) = source.read(&mut buffer) {
        if n == 0 {
            break;
        }
        pending.extend_from_slice(&buffer[..n]);
        // Jusqu'à la dernière fin de ligne ; sans fin de ligne, tout sauf la queue (plus longue qu'un marqueur de code).
        let cut = match pending.iter().rposition(|b| *b == b'\n') {
            Some(last) => last + 1,
            None if pending.len() > 8192 => pending.len() - KEEP,
            None => 0,
        };
        if cut > 0 {
            log.write(&pending[..cut]);
            pending.drain(..cut);
        }
    }
    if !pending.is_empty() {
        log.write(&pending);
    }
}

/// Vide la sortie du processus dans le journal (un tuyau qui n'est pas lu bloque le moteur).
pub fn pump_output(child: &mut Child, log: &Arc<RotatingLog>) {
    fn pump(source: impl Read + Send + 'static, log: Arc<RotatingLog>) {
        std::thread::spawn(move || pump_lines(source, &log));
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

/// Un chemin comparable : résolu s'il existe (nom 8.3, liens), sans préfixe `\\?\`, barres obliques ramenées, casse ignorée.
fn normal(path: &Path) -> String {
    let resolved = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let text = resolved.to_string_lossy().replace('/', "\\");
    let text = text.strip_prefix(r"\\?\").map(str::to_string).unwrap_or(text);
    text.trim_end_matches('\\').to_lowercase()
}

/// Le programme du processus est-il un de NOS moteurs ? Un `syncthing*.exe` posé directement dans notre dossier
/// `bin` (la copie de n'importe quelle version : un orphelin d'avant une mise à jour compte), jamais un
/// `syncthing.exe` d'un autre dossier.
pub fn is_our_engine(image: Option<&str>, bin_dir: &Path) -> bool {
    let Some(image) = image else { return false };
    let image = Path::new(image);
    let Some(name) = image.file_name().map(|n| n.to_string_lossy().to_lowercase()) else { return false };
    if !(name.starts_with("syncthing") && name.ends_with(".exe")) {
        return false;
    }
    image.parent().is_some_and(|parent| normal(parent) == normal(bin_dir))
}

/// Un moteur resté d'un lancement précédent (l'app a été tuée sans l'arrêter) : le PID de `engine.pid`, s'il
/// désigne toujours un de NOS moteurs (voir `is_our_engine`), est terminé. Un PID réutilisé par un autre programme
/// n'est jamais touché. `Ok(Some(pid))` : terminé ; `Err` : c'est bien le nôtre mais il refuse de mourir (le
/// fichier de PID est gardé, l'appelant ne doit pas lancer un second moteur sur le même dossier).
pub fn kill_stale(home: &Path, bin_dir: &Path) -> Result<Option<u32>, String> {
    let Ok(text) = fs::read_to_string(home.join(PID_FILE)) else { return Ok(None) };
    let Ok(pid) = text.trim().parse::<u32>() else {
        remove_pidfile(home);
        return Ok(None);
    };
    if pid == std::process::id() || !is_our_engine(sys::image_path(pid).as_deref(), bin_dir) {
        remove_pidfile(home);
        return Ok(None);
    }
    if sys::terminate(pid) {
        remove_pidfile(home);
        return Ok(Some(pid));
    }
    if sys::image_path(pid).is_none() {
        // Mort entre-temps.
        remove_pidfile(home);
        return Ok(None);
    }
    Err(format!("Un moteur resté d'un lancement précédent (PID {pid}) n'a pas pu être terminé."))
}

pub fn image_path(pid: u32) -> Option<String> {
    sys::image_path(pid)
}

/// Un Job Object Windows qui termine ses processus quand son dernier handle se ferme : si l'app meurt (plantage,
/// fin forcée), Windows ferme le handle et emporte le moteur avec elle. Aucun orphelin.
#[cfg(windows)]
pub struct EngineJob(#[allow(dead_code)] sys::JobHandle);
#[cfg(not(windows))]
pub struct EngineJob;

pub fn bind_to_job(child: &Child) -> Result<EngineJob, String> {
    #[cfg(windows)]
    {
        sys::bind_to_job(child).map(EngineJob)
    }
    #[cfg(not(windows))]
    {
        let _ = child;
        Ok(EngineJob)
    }
}

#[cfg(windows)]
mod sys {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
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

    pub struct JobHandle(HANDLE);

    // Un handle de Job Object n'est lié à aucun fil.
    unsafe impl Send for JobHandle {}

    impl Drop for JobHandle {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }

    pub fn bind_to_job(child: &std::process::Child) -> Result<JobHandle, String> {
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err("Job Object impossible à créer".to_string());
            }
            let job = JobHandle(job);
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let set = SetInformationJobObject(
                job.0,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            if set == 0 {
                return Err("Job Object impossible à régler".to_string());
            }
            if AssignProcessToJobObject(job.0, child.as_raw_handle() as HANDLE) == 0 {
                return Err("Le moteur n'a pas pu être rattaché au Job Object".to_string());
            }
            Ok(job)
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
    fn only_a_syncthing_in_our_bin_dir_counts_as_our_engine() {
        let bin = Path::new(r"C:\Etat\Neo Calendar\syncthing\bin");
        // N'importe quelle version de notre copie : un orphelin d'avant une mise à jour compte.
        assert!(is_our_engine(Some(r"C:\Etat\Neo Calendar\syncthing\bin\syncthing-2.1.5.exe"), bin));
        assert!(is_our_engine(Some(r"c:\etat\neo calendar\SYNCTHING\BIN\SYNCTHING-2.1.4.EXE"), bin));
        // Chemin non normalisé : préfixe \\?\, barres obliques.
        assert!(is_our_engine(Some(r"\\?\C:\Etat\Neo Calendar\syncthing\bin\syncthing-2.1.6.exe"), bin));
        assert!(is_our_engine(Some("C:/Etat/Neo Calendar/syncthing/bin/syncthing-2.1.6.exe"), bin));
        // Jamais un autre dossier, un sous-dossier, un autre programme ou une autre extension.
        assert!(!is_our_engine(Some(r"C:\Users\Ahmed\AppData\Local\Syncthing\syncthing.exe"), bin));
        assert!(!is_our_engine(Some(r"C:\Etat\Neo Calendar\syncthing\bin\sous\syncthing.exe"), bin));
        assert!(!is_our_engine(Some(r"C:\Etat\Neo Calendar\syncthing\bin\notepad.exe"), bin));
        assert!(!is_our_engine(Some(r"C:\Etat\Neo Calendar\syncthing\bin\syncthing-2.1.5.exe.bak"), bin));
        assert!(!is_our_engine(Some(r"C:\Etat\Neo Calendar\syncthing\bin2\syncthing.exe"), bin));
        assert!(!is_our_engine(None, bin));
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
        assert_eq!(kill_stale(dir.path(), dir.path()), Ok(None));
        fs::write(dir.path().join(PID_FILE), "pas un nombre").unwrap();
        assert_eq!(kill_stale(dir.path(), dir.path()), Ok(None));
        assert!(!dir.path().join(PID_FILE).exists(), "le fichier est consommé");
    }

    /// Un vrai processus, lancé depuis une copie de `ping.exe` nommée `name` dans `dir` : c'est NOTRE moteur
    /// quand `dir` est le dossier `bin`.
    #[cfg(windows)]
    fn fake_engine(dir: &Path, name: &str) -> (PathBuf, Child) {
        let system = std::env::var("SystemRoot").unwrap();
        let exe = dir.join(name);
        fs::copy(Path::new(&system).join("System32").join("PING.EXE"), &exe).unwrap();
        let child = command(&exe).args(["-n", "60", "127.0.0.1"]).stdout(Stdio::null()).spawn().unwrap();
        (exe, child)
    }

    #[cfg(windows)]
    #[test]
    fn a_stale_engine_of_ours_is_terminated_by_pid() {
        let dir = tempfile::tempdir().unwrap();
        let (_exe, mut child) = fake_engine(dir.path(), "syncthing-2.1.5.exe");
        write_pidfile(dir.path(), child.id()).unwrap();
        assert_eq!(kill_stale(dir.path(), dir.path()), Ok(Some(child.id())));
        assert!(child.wait().is_ok(), "le processus est bien terminé");
        assert!(!dir.path().join(PID_FILE).exists());
    }

    #[cfg(windows)]
    #[test]
    fn an_orphan_of_another_version_is_cleaned_even_through_an_unnormalised_bin_path() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("bin");
        fs::create_dir_all(&bin).unwrap();
        // Resté d'avant une mise à jour : une AUTRE version que celle qui démarre maintenant.
        let (_exe, mut orphan) = fake_engine(&bin, "syncthing-2.1.5.exe");
        write_pidfile(dir.path(), orphan.id()).unwrap();
        let unnormalised = PathBuf::from(format!("{}/./BIN/", dir.path().to_string_lossy().replace('\\', "/")));
        assert_eq!(kill_stale(dir.path(), &unnormalised), Ok(Some(orphan.id())));
        assert!(orphan.wait().is_ok());
    }

    #[cfg(windows)]
    #[test]
    fn a_pid_reused_by_another_program_is_never_touched() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("bin");
        fs::create_dir_all(&bin).unwrap();
        // Un autre programme (un Syncthing d'un autre dossier, par exemple) : même nom de fichier, autre chemin.
        let other_dir = tempfile::tempdir().unwrap();
        let (_other_exe, mut other) = fake_engine(other_dir.path(), "syncthing.exe");
        write_pidfile(dir.path(), other.id()).unwrap();
        assert_eq!(kill_stale(dir.path(), &bin), Ok(None));
        assert!(other.try_wait().unwrap().is_none(), "l'autre processus tourne toujours");
        other.kill().unwrap();
        other.wait().unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn closing_the_job_takes_the_engine_down_with_it() {
        let dir = tempfile::tempdir().unwrap();
        let (_exe, mut child) = fake_engine(dir.path(), "syncthing-2.1.5.exe");
        let job = bind_to_job(&child).unwrap();
        assert!(child.try_wait().unwrap().is_none(), "il tourne tant que le Job est ouvert");
        drop(job);
        let end = Instant::now() + Duration::from_secs(5);
        while Instant::now() < end && child.try_wait().unwrap().is_none() {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(child.try_wait().unwrap().is_some(), "le moteur meurt avec le Job (donc avec l'app)");
    }

    #[cfg(windows)]
    #[test]
    fn generate_is_interrupted_by_the_stop_flag() {
        let dir = tempfile::tempdir().unwrap();
        // `ping -n 60` ne rend pas la main avant une minute : `generate` factice qui se fige.
        let system = std::env::var("SystemRoot").unwrap();
        let exe = dir.path().join("syncthing.exe");
        fs::copy(Path::new(&system).join("System32").join("PING.EXE"), &exe).unwrap();
        let stop = AtomicBool::new(true);
        let started = Instant::now();
        let error = ensure_generated(&exe, &dir.path().join("etat"), &stop).unwrap_err();
        assert!(started.elapsed() < Duration::from_secs(5), "{error}");
    }

    #[test]
    fn output_is_cut_on_lines_so_a_pairing_code_split_across_reads_is_still_hidden() {
        struct Chunks(Vec<&'static [u8]>);
        impl Read for Chunks {
            fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
                if self.0.is_empty() {
                    return Ok(0);
                }
                let chunk = self.0.remove(0);
                buffer[..chunk.len()].copy_from_slice(chunk);
                Ok(chunk.len())
            }
        }
        let dir = tempfile::tempdir().unwrap();
        let log = Arc::new(RotatingLog::new(dir.path().to_path_buf(), 10_000));
        pump_lines(Chunks(vec![b"remote.name=\"Pixel [NC:Q67", b"C64KRPE]\" ok\n", b"derniere ligne"]), &log);
        let text = log.read_all();
        assert!(!text.contains("Q67") && !text.contains("C64KRPE"), "{text}");
        assert!(text.contains("[NC:**********]\" ok\n") && text.ends_with("derniere ligne"), "{text}");
    }
}
