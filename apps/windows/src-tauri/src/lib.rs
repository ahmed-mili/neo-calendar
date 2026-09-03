use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::env;
use std::ffi::OsStr;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use tauri::Manager;
#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt;
#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    Foundation::GlobalFree,
    System::{
        DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData},
        Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE},
        Ole::CF_UNICODETEXT,
    },
    UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
};

const PREFERENCES_FILE_NAME: &str = ".neo-calendar.json";
const LEGACY_PREFERENCES_FILE_NAME: &str = ".neo-calendar-desktop.json";
const DEFAULT_CALENDAR_NAME: &str = "Default";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopCalendarFolderDto {
    relative_path: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopEventFileDto {
    relative_path: String,
    calendar_path: String,
    file_name: String,
    contents: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopWorkspaceSnapshotDto {
    calendars: Vec<DesktopCalendarFolderDto>,
    event_files: Vec<DesktopEventFileDto>,
    preferences: Value,
    /// False when no preference file was there to read. The data folder is
    /// synced, so a missing file means "not right now" at least as often as it
    /// means "never had any", and the two must not be confused: adopting empty
    /// defaults over real preferences is what wiped the calendar colours.
    preferences_found: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopDetectedVaultDto {
    path: String,
    name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopVaultNoteDto {
    vault_path: String,
    vault_name: String,
    relative_path: String,
    file_name: String,
    title: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAttachmentDto {
    file_name: String,
    relative_path: String,
    markdown_path: String,
}

#[tauri::command]
fn has_obsidian_config(path: String) -> bool {
    Path::new(&path).join(".obsidian").is_dir()
}

fn root_path(data_folder: &str) -> Result<PathBuf, String> {
    if data_folder.trim().is_empty() {
        return Err("The Neo Calendar data folder is empty.".to_string());
    }

    let root = PathBuf::from(data_folder);
    fs::create_dir_all(&root).map_err(|error| {
        format!(
            "Unable to create the Neo Calendar data folder '{}': {error}",
            root.display()
        )
    })?;
    Ok(root)
}

fn normalized_relative(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn safe_join(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    let mut result = root.to_path_buf();

    for component in relative.components() {
        match component {
            Component::Normal(value) => result.push(value),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("Invalid relative path: {relative_path}"));
            }
        }
    }

    Ok(result)
}

fn validate_single_name(name: &str, kind: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(format!("The {kind} name cannot be empty."));
    }

    let path = Path::new(trimmed);
    if path.components().count() != 1
        || trimmed == "."
        || trimmed == ".."
        || trimmed.contains('/')
        || trimmed.contains('\\')
    {
        return Err(format!("Invalid {kind} name: {trimmed}"));
    }

    Ok(trimmed.to_string())
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .map(|extension| extension.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

/// Reads the preference file, falling back to the pre-Android file name.
///
/// A missing file is fine (first run), but a file that exists and cannot be
/// read or parsed must fail loudly: reporting it as empty would let the app
/// save its defaults over a healthy configuration.
#[cfg(test)]
fn read_preferences(root: &Path) -> Result<Value, String> {
    Ok(read_preferences_found(root)?.0)
}

/// Reads the preference file, and reports whether there was one to read.
fn read_preferences_found(root: &Path) -> Result<(Value, bool), String> {
    let path = root.join(PREFERENCES_FILE_NAME);
    let legacy_path = root.join(LEGACY_PREFERENCES_FILE_NAME);
    let source = if path.exists() {
        path
    } else if legacy_path.exists() {
        legacy_path
    } else {
        return Ok((Value::Object(Default::default()), false));
    };

    let contents = fs::read_to_string(&source)
        .map_err(|error| format!("Unable to read '{}': {error}", source.display()))?;
    // An empty file is a file caught mid-replacement, not a blank slate.
    if contents.trim().is_empty() {
        return Ok((Value::Object(Default::default()), false));
    }
    serde_json::from_str(&contents)
        .map(|value| (value, true))
        .map_err(|error| format!("'{}' is not valid JSON: {error}", source.display()))
}

/// Union of the colour maps, the incoming value winning on shared keys.
///
/// The last barrier before the disk, and the only one that also covers what
/// another device wrote between this app reading the file and writing it back.
/// A colour is never removed by a write: an entry left behind for a calendar
/// that no longer exists costs nothing, losing one costs an evening of redoing
/// them by hand.
fn merge_preserving_colors(stored: &Value, incoming: &Value) -> Value {
    let mut merged = incoming.clone();

    let (Some(stored_colors), Some(merged_object)) =
        (stored.get("colors").and_then(Value::as_object), merged.as_object_mut())
    else {
        return merged;
    };

    let mut colors = merged_object
        .get("colors")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    for (key, value) in stored_colors {
        colors.entry(key.clone()).or_insert_with(|| value.clone());
    }

    merged_object.insert("colors".to_string(), Value::Object(colors));
    merged
}

fn write_preferences(root: &Path, preferences: &Value) -> Result<(), String> {
    let path = root.join(PREFERENCES_FILE_NAME);

    // Re-read rather than trust the caller's snapshot: the file is in a synced
    // folder, so it may have gained colours from another device since it was
    // loaded. A failed read here must not block saving.
    let preferences = match read_preferences_found(root) {
        Ok((stored, true)) => merge_preserving_colors(&stored, preferences),
        _ => preferences.clone(),
    };
    let preferences = &preferences;

    let json = serde_json::to_string_pretty(preferences)
        .map_err(|error| format!("Unable to serialize calendar preferences: {error}"))?;

    // Write through a temporary file so an interrupted save can never leave a
    // truncated preference file behind.
    let temporary = root.join(format!("{PREFERENCES_FILE_NAME}.tmp"));
    fs::write(&temporary, format!("{json}\n"))
        .map_err(|error| format!("Unable to write '{}': {error}", temporary.display()))?;
    fs::rename(&temporary, &path)
        .map_err(|error| format!("Unable to write '{}': {error}", path.display()))?;

    let legacy_path = root.join(LEGACY_PREFERENCES_FILE_NAME);
    if legacy_path.exists() {
        let _ = fs::remove_file(&legacy_path);
    }
    Ok(())
}

fn discover_calendar_directories(root: &Path) -> Result<Vec<(String, String, PathBuf)>, String> {
    let mut directories: Vec<(String, String, PathBuf)> = Vec::new();

    for entry in fs::read_dir(root)
        .map_err(|error| format!("Unable to read '{}': {error}", root.display()))?
    {
        let entry = entry.map_err(|error| format!("Unable to read a folder entry: {error}"))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Unable to inspect '{}': {error}", path.display()))?;

        if file_type.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            directories.push((name.clone(), name, path));
        }
    }

    if directories.is_empty() {
        let default_path = root.join(DEFAULT_CALENDAR_NAME);
        fs::create_dir_all(&default_path).map_err(|error| {
            format!(
                "Unable to create the default calendar folder '{}': {error}",
                default_path.display()
            )
        })?;
        directories.push((
            DEFAULT_CALENDAR_NAME.to_string(),
            DEFAULT_CALENDAR_NAME.to_string(),
            default_path,
        ));
    }

    directories.sort_by(|left, right| left.1.to_lowercase().cmp(&right.1.to_lowercase()));
    Ok(directories)
}

/// Recurses into subfolders (an ICS link's own directory, say) so their notes
/// still count toward the calendar whose top-level folder this call started
/// from — every file found gets the SAME `calendar_path`, regardless of how
/// deep it actually sits, which is what keeps a nested ICS folder part of its
/// parent calendar rather than becoming a calendar of its own.
fn read_event_files(
    root: &Path,
    calendar_path: &str,
    absolute_calendar_path: &Path,
) -> Result<Vec<DesktopEventFileDto>, String> {
    let mut files = Vec::new();
    let mut directories = vec![absolute_calendar_path.to_path_buf()];

    while let Some(directory) = directories.pop() {
        for entry in fs::read_dir(&directory).map_err(|error| {
            format!("Unable to read calendar folder '{}': {error}", directory.display())
        })? {
            let entry =
                entry.map_err(|error| format!("Unable to read a calendar entry: {error}"))?;
            let path = entry.path();
            let file_type = entry
                .file_type()
                .map_err(|error| format!("Unable to inspect '{}': {error}", path.display()))?;

            if file_type.is_dir() {
                directories.push(path);
                continue;
            }
            if !file_type.is_file() || !is_markdown_file(&path) {
                continue;
            }

            let bytes = fs::read(&path)
                .map_err(|error| format!("Unable to read '{}': {error}", path.display()))?;
            let contents = String::from_utf8_lossy(&bytes).into_owned();
            let relative_path = path
                .strip_prefix(root)
                .map(normalized_relative)
                .map_err(|_| format!("'{}' is outside the data folder.", path.display()))?;
            let file_name = path
                .file_name()
                .and_then(OsStr::to_str)
                .unwrap_or("event.md")
                .to_string();

            files.push(DesktopEventFileDto {
                relative_path,
                calendar_path: calendar_path.to_string(),
                file_name,
                contents,
            });
        }
    }

    files.sort_by(|left, right| left.file_name.to_lowercase().cmp(&right.file_name.to_lowercase()));
    Ok(files)
}

#[tauri::command(rename_all = "camelCase", async)]
fn load_desktop_workspace(data_folder: String) -> Result<DesktopWorkspaceSnapshotDto, String> {
    let root = root_path(&data_folder)?;
    let discovered = discover_calendar_directories(&root)?;
    let mut calendars = Vec::new();
    let mut event_files = Vec::new();

    for (relative_path, name, absolute_path) in discovered {
        event_files.extend(read_event_files(&root, &relative_path, &absolute_path)?);
        calendars.push(DesktopCalendarFolderDto {
            relative_path,
            name,
        });
    }

    let (preferences, preferences_found) = read_preferences_found(&root)?;

    Ok(DesktopWorkspaceSnapshotDto {
        calendars,
        event_files,
        preferences,
        preferences_found,
    })
}

#[tauri::command(rename_all = "camelCase", async)]
fn save_desktop_preferences(data_folder: String, preferences: Value) -> Result<(), String> {
    let root = root_path(&data_folder)?;
    write_preferences(&root, &preferences)
}

fn unique_markdown_path(directory: &Path, requested_name: &str, current: Option<&Path>) -> PathBuf {
    let requested = directory.join(requested_name);
    if !requested.exists() || current.map(|path| path == requested).unwrap_or(false) {
        return requested;
    }

    let stem = Path::new(requested_name)
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("Event");
    let extension = Path::new(requested_name)
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or("md");

    for suffix in 1_u32.. {
        let candidate = directory.join(format!("{stem} ({suffix}).{extension}"));
        if !candidate.exists() || current.map(|path| path == candidate).unwrap_or(false) {
            return candidate;
        }
    }

    unreachable!()
}

#[tauri::command(rename_all = "camelCase", async)]
fn write_desktop_event_file(
    data_folder: String,
    calendar_path: String,
    previous_relative_path: Option<String>,
    file_name: String,
    contents: String,
) -> Result<String, String> {
    let root = root_path(&data_folder)?;
    let directory = safe_join(&root, &calendar_path)?;
    if !directory.is_dir() {
        return Err(format!("Calendar folder '{}' does not exist.", directory.display()));
    }

    let validated_file_name = validate_single_name(&file_name, "event file")?;
    if !validated_file_name.to_lowercase().ends_with(".md") {
        return Err("Event files must use the .md extension.".to_string());
    }

    let previous_path = match previous_relative_path {
        Some(relative) if !relative.trim().is_empty() => Some(safe_join(&root, &relative)?),
        _ => None,
    };
    if let Some(previous) = &previous_path {
        if !is_markdown_file(previous) {
            return Err("Only Markdown event files can be updated.".to_string());
        }
    }

    let target = unique_markdown_path(&directory, &validated_file_name, previous_path.as_deref());

    if let Some(previous) = &previous_path {
        if previous.exists() && previous != &target {
            fs::rename(previous, &target).map_err(|error| {
                format!(
                    "Unable to move event file '{}' to '{}': {error}",
                    previous.display(),
                    target.display()
                )
            })?;
        }
    }

    fs::write(&target, contents)
        .map_err(|error| format!("Unable to write '{}': {error}", target.display()))?;

    target
        .strip_prefix(&root)
        .map(normalized_relative)
        .map_err(|_| format!("'{}' is outside the data folder.", target.display()))
}

#[tauri::command(rename_all = "camelCase", async)]
fn delete_desktop_event_file(data_folder: String, relative_path: String) -> Result<(), String> {
    let root = root_path(&data_folder)?;
    let path = safe_join(&root, &relative_path)?;
    if !is_markdown_file(&path) {
        return Err("Only Markdown event files can be deleted.".to_string());
    }
    if !path.exists() {
        return Ok(());
    }
    fs::remove_file(&path)
        .map_err(|error| format!("Unable to delete '{}': {error}", path.display()))
}

/// Gives an ICS link its own folder directly under its Full Note calendar's
/// folder. Idempotent for that same name — calling it again for a link whose
/// folder already exists is a no-op rather than an error, since a sync cycle
/// needs to be able to ensure the folder is there without first checking
/// whether some earlier cycle already made it — but a name already taken by
/// something that ISN'T a folder still fails loudly rather than writing into
/// whatever that is.
#[tauri::command(rename_all = "camelCase", async)]
fn ensure_desktop_ics_folder(
    data_folder: String,
    calendar_path: String,
    name: String,
) -> Result<String, String> {
    let root = root_path(&data_folder)?;
    let calendar_directory = safe_join(&root, &calendar_path)?;
    if !calendar_directory.is_dir() {
        return Err(format!(
            "Calendar folder '{}' does not exist.",
            calendar_directory.display()
        ));
    }

    let validated_name = validate_single_name(&name, "ICS link")?;
    let directory = calendar_directory.join(&validated_name);
    if !directory.exists() {
        fs::create_dir(&directory)
            .map_err(|error| format!("Unable to create '{}': {error}", directory.display()))?;
    } else if !directory.is_dir() {
        return Err(format!("'{}' already exists and is not a folder.", directory.display()));
    }

    let relative = directory
        .strip_prefix(&root)
        .map(normalized_relative)
        .map_err(|_| format!("'{}' is outside the data folder.", directory.display()))?;
    Ok(relative)
}

#[tauri::command(rename_all = "camelCase", async)]
fn create_desktop_calendar_folder(data_folder: String, name: String) -> Result<String, String> {
    let root = root_path(&data_folder)?;
    let validated_name = validate_single_name(&name, "calendar")?;
    let path = root.join(&validated_name);
    if path.exists() {
        return Err(format!("A folder named '{validated_name}' already exists."));
    }
    fs::create_dir(&path)
        .map_err(|error| format!("Unable to create '{}': {error}", path.display()))?;
    Ok(validated_name)
}

#[tauri::command(rename_all = "camelCase", async)]
fn rename_desktop_calendar_folder(
    data_folder: String,
    relative_path: String,
    new_name: String,
) -> Result<String, String> {
    if relative_path.trim().is_empty() {
        return Err("The data-folder calendar itself cannot be renamed here.".to_string());
    }

    let root = root_path(&data_folder)?;
    let old_path = safe_join(&root, &relative_path)?;
    if old_path.parent() != Some(root.as_path()) {
        return Err("Only direct calendar subfolders can be renamed.".to_string());
    }
    if !old_path.is_dir() {
        return Err(format!("Calendar folder '{}' does not exist.", old_path.display()));
    }

    let validated_name = validate_single_name(&new_name, "calendar")?;
    let new_path = root.join(&validated_name);
    if new_path.exists() && new_path != old_path {
        return Err(format!("A folder named '{validated_name}' already exists."));
    }

    if new_path != old_path {
        fs::rename(&old_path, &new_path).map_err(|error| {
            format!(
                "Unable to rename '{}' to '{}': {error}",
                old_path.display(),
                new_path.display()
            )
        })?;
    }

    Ok(validated_name)
}

#[tauri::command(rename_all = "camelCase", async)]
fn delete_desktop_calendar_folder(data_folder: String, relative_path: String) -> Result<(), String> {
    if relative_path.trim().is_empty() {
        return Err("The data folder itself cannot be removed as a calendar.".to_string());
    }

    let root = root_path(&data_folder)?;
    let path = safe_join(&root, &relative_path)?;
    if path.parent() != Some(root.as_path()) {
        return Err("Only direct calendar subfolders can be removed.".to_string());
    }
    if !path.exists() {
        return Ok(());
    }

    let mut entries = fs::read_dir(&path)
        .map_err(|error| format!("Unable to inspect '{}': {error}", path.display()))?;
    if entries.next().is_some() {
        return Err(
            "This calendar folder is not empty. Move or delete its files before removing it."
                .to_string(),
        );
    }

    fs::remove_dir(&path)
        .map_err(|error| format!("Unable to remove '{}': {error}", path.display()))
}

#[tauri::command(rename_all = "camelCase")]
fn open_desktop_path(data_folder: String, relative_path: String) -> Result<(), String> {
    let root = root_path(&data_folder)?;
    let path = safe_join(&root, &relative_path)?;
    if !path.exists() {
        return Err(format!("Path '{}' does not exist.", path.display()));
    }

    #[cfg(target_os = "windows")]
    {
        hidden_command("explorer")
            .arg(&path)
            .spawn()
            .map_err(|error| format!("Unable to open '{}': {error}", path.display()))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        return Err("Opening folders is only supported by this Windows build.".to_string());
    }

    Ok(())
}




#[cfg(target_os = "windows")]
fn split_windows_command_line(value: &str) -> Vec<String> {
    let mut arguments = Vec::new();
    let mut current = String::new();
    let mut quoted = false;

    for character in value.chars() {
        match character {
            '"' => quoted = !quoted,
            character if character.is_whitespace() && !quoted => {
                if !current.is_empty() {
                    arguments.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(character),
        }
    }

    if !current.is_empty() {
        arguments.push(current);
    }

    arguments
}

#[cfg(target_os = "windows")]
fn expand_windows_environment(value: &str) -> String {
    let mut output = String::new();
    let characters: Vec<char> = value.chars().collect();
    let mut index = 0;

    while index < characters.len() {
        if characters[index] != '%' {
            output.push(characters[index]);
            index += 1;
            continue;
        }

        let Some(relative_end) = characters[index + 1..]
            .iter()
            .position(|character| *character == '%')
        else {
            output.push('%');
            index += 1;
            continue;
        };

        let end = index + 1 + relative_end;
        let name: String = characters[index + 1..end].iter().collect();
        if let Ok(replacement) = env::var(&name) {
            output.push_str(&replacement);
        } else {
            output.push('%');
            output.push_str(&name);
            output.push('%');
        }
        index = end + 1;
    }

    output
}

/// Une commande qui ne montre pas de console.
///
/// Une application graphique qui lance un programme console s'en voit allouer
/// une, et Windows la montre : une fenetre noire s'ouvre et se referme
/// aussitot. `curl.exe` part des le demarrage avec la premiere synchro des
/// liens ICS, ce qui la faisait clignoter a chaque lancement.
///
/// `CREATE_NO_WINDOW` (0x0800_0000) est le drapeau qui separe un programme
/// lance d'un programme lance visiblement. Il est pose ici pour toutes les
/// commandes, y compris celles qui ouvrent une fenetre a elles : ce drapeau ne
/// concerne que la console, et une regle sans exception est une regle qu'un
/// test peut garder.
fn hidden_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    command
}

#[cfg(target_os = "windows")]
fn registry_protocol_command(scheme: &str) -> Option<String> {
    let keys = [
        format!(r"HKCU\Software\Classes\{scheme}\shell\open\command"),
        format!(r"HKCR\{scheme}\shell\open\command"),
    ];

    for key in keys {
        let output = hidden_command("reg.exe")
            .args(["query", key.as_str(), "/ve"])
            .output()
            .ok()?;
        if !output.status.success() {
            continue;
        }

        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            for marker in ["REG_EXPAND_SZ", "REG_SZ"] {
                let Some(index) = line.find(marker) else {
                    continue;
                };
                let command = line[index + marker.len()..].trim();
                if !command.is_empty() {
                    return Some(command.to_string());
                }
            }
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn launch_registered_protocol(target: &str, scheme: &str) -> Result<bool, String> {
    let Some(command_template) = registry_protocol_command(scheme) else {
        return Ok(false);
    };
    let mut arguments = split_windows_command_line(&command_template);
    if arguments.is_empty() {
        return Ok(false);
    }

    let executable = PathBuf::from(expand_windows_environment(&arguments.remove(0)));
    if !executable.is_file() {
        return Ok(false);
    }

    let mut command = hidden_command(&executable);
    let mut inserted_target = false;
    for argument in arguments {
        let replaced = argument
            .replace("%1", target)
            .replace("%L", target)
            .replace("%l", target);
        if replaced != argument {
            inserted_target = true;
        }
        command.arg(expand_windows_environment(&replaced));
    }
    if !inserted_target {
        command.arg(target);
    }

    command.spawn().map_err(|error| {
        format!(
            "Unable to launch the registered {scheme} protocol handler '{}': {error}",
            executable.display()
        )
    })?;
    Ok(true)
}

#[cfg(target_os = "windows")]
fn find_obsidian_executable() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        let root = PathBuf::from(local_app_data);
        candidates.push(root.join("Obsidian").join("Obsidian.exe"));
        candidates.push(root.join("Programs").join("Obsidian").join("Obsidian.exe"));
    }
    if let Some(program_files) = env::var_os("PROGRAMFILES") {
        candidates.push(PathBuf::from(program_files).join("Obsidian").join("Obsidian.exe"));
    }

    candidates.into_iter().find(|candidate| candidate.is_file())
}

#[cfg(target_os = "windows")]
fn launch_with_windows_shell(target: &str) -> Result<(), String> {
    let wide_target = nul_terminated_utf16(target);
    // ShellExecuteW hands the URL to the registered browser without asking a
    // command-line parser to interpret it. The old PowerShell bridge parsed
    // `&` in an ordinary query string as source code and rejected the link.
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            std::ptr::null(),
            wide_target.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    } as isize;

    if shell_execute_succeeded(result) {
        Ok(())
    } else {
        Err(format!(
            "Windows could not open the linked item (ShellExecute error {result})."
        ))
    }
}

#[cfg(target_os = "windows")]
fn shell_execute_succeeded(result: isize) -> bool {
    result > 32
}

#[cfg(target_os = "windows")]
fn nul_terminated_utf16(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn write_windows_clipboard_text(value: &str) -> Result<(), String> {
    let wide = nul_terminated_utf16(value);

    // The clipboard can briefly be held by another process. A few short
    // retries make a click deterministic without blocking the UI noticeably.
    let opened = (0..5).any(|attempt| {
        if attempt > 0 {
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        unsafe { OpenClipboard(std::ptr::null_mut()) != 0 }
    });
    if !opened {
        return Err("Windows could not access the clipboard.".to_string());
    }

    let result = unsafe {
        if EmptyClipboard() == 0 {
            Err("Windows could not clear the clipboard.".to_string())
        } else {
            let byte_len = wide.len() * std::mem::size_of::<u16>();
            let memory = GlobalAlloc(GMEM_MOVEABLE, byte_len);
            if memory.is_null() {
                Err("Windows could not allocate clipboard memory.".to_string())
            } else {
                let destination = GlobalLock(memory) as *mut u16;
                if destination.is_null() {
                    GlobalFree(memory);
                    Err("Windows could not lock clipboard memory.".to_string())
                } else {
                    std::ptr::copy_nonoverlapping(wide.as_ptr(), destination, wide.len());
                    GlobalUnlock(memory);
                    if SetClipboardData(CF_UNICODETEXT as u32, memory).is_null() {
                        GlobalFree(memory);
                        Err("Windows could not write to the clipboard.".to_string())
                    } else {
                        // Ownership of `memory` belongs to the system after a
                        // successful SetClipboardData call.
                        Ok(())
                    }
                }
            }
        }
    };
    unsafe {
        CloseClipboard();
    }
    result
}

#[tauri::command]
fn write_desktop_clipboard_text(value: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return write_windows_clipboard_text(&value);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = value;
        Err("Writing to the clipboard is only supported by this Windows build.".to_string())
    }
}

#[tauri::command(rename_all = "camelCase")]
fn copy_desktop_path(data_folder: String, relative_path: String) -> Result<(), String> {
    let root = root_path(&data_folder)?;
    let path = safe_join(&root, &relative_path)?;
    if !path.is_file() {
        return Err(format!("File '{}' does not exist.", path.display()));
    }

    #[cfg(target_os = "windows")]
    {
        return write_windows_clipboard_text(&path.to_string_lossy());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err("Copying file paths is only supported by this Windows build.".to_string())
    }
}

#[tauri::command(rename_all = "camelCase")]
fn open_desktop_external_target(target: String) -> Result<(), String> {
    let trimmed = target.trim();
    let lower = trimmed.to_ascii_lowercase();
    let is_obsidian = lower.starts_with("obsidian://");
    let allowed = lower.starts_with("https://") || lower.starts_with("http://") || is_obsidian;

    if !allowed {
        return Err("Only HTTP, HTTPS and Obsidian links can be opened.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        if is_obsidian {
            // Use the exact command registered by Obsidian instead of explorer.exe
            // or rundll32.exe. Those generic launchers can misinterpret a custom
            // URI as a filesystem path and open Documents instead of the note.
            if launch_registered_protocol(trimmed, "obsidian")? {
                return Ok(());
            }

            // Portable/non-standard installations may not expose the registry key.
            // Launching Obsidian.exe with the URI is equivalent to its registered
            // protocol command and is handled by Obsidian's single-instance logic.
            if let Some(executable) = find_obsidian_executable() {
                hidden_command(&executable)
                    .arg(trimmed)
                    .spawn()
                    .map_err(|error| {
                        format!("Unable to open Obsidian '{}': {error}", executable.display())
                    })?;
                return Ok(());
            }
        }

        launch_with_windows_shell(trimmed)?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = trimmed;
        return Err("Opening linked items is only supported by this Windows build.".to_string());
    }

    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
fn open_desktop_linked_path(
    data_folder: String,
    event_relative_path: String,
    target: String,
) -> Result<(), String> {
    let root = root_path(&data_folder)?;
    let event_path = safe_join(&root, &event_relative_path)?;
    let event_parent = event_path
        .parent()
        .ok_or_else(|| "The event file has no parent folder.".to_string())?;

    let target_path = Path::new(target.trim());
    if target_path.is_absolute() {
        return Err("Attachment links must use a relative path.".to_string());
    }

    let candidate = event_parent.join(target_path);
    if !candidate.exists() {
        return Err(format!("Linked file '{}' does not exist.", candidate.display()));
    }

    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Unable to resolve '{}': {error}", root.display()))?;
    let canonical_candidate = candidate
        .canonicalize()
        .map_err(|error| format!("Unable to resolve '{}': {error}", candidate.display()))?;

    if !canonical_candidate.starts_with(&canonical_root) {
        return Err("The linked file is outside the Neo Calendar data folder.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        hidden_command("explorer.exe")
            .arg(&canonical_candidate)
            .spawn()
            .map_err(|error| {
                format!("Unable to open '{}': {error}", canonical_candidate.display())
            })?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = canonical_candidate;
        return Err("Opening linked files is only supported by this Windows build.".to_string());
    }

    Ok(())
}

fn add_detected_vault(
    path: &Path,
    seen: &mut HashSet<String>,
    output: &mut Vec<DesktopDetectedVaultDto>,
) {
    if !path.join(".obsidian").is_dir() {
        return;
    }

    let normalized = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let display_path = normalized.to_string_lossy().to_string();
    let key = display_path.replace('\\', "/").to_lowercase();
    if !seen.insert(key) {
        return;
    }

    let name = normalized
        .file_name()
        .and_then(OsStr::to_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Obsidian")
        .to_string();

    output.push(DesktopDetectedVaultDto {
        path: display_path,
        name,
    });
}

#[tauri::command(rename_all = "camelCase", async)]
fn discover_desktop_obsidian_vaults(
    root_paths: Vec<String>,
) -> Result<Vec<DesktopDetectedVaultDto>, String> {
    let mut seen = HashSet::new();
    let mut output = Vec::new();

    for root_path in root_paths {
        let root_path = root_path.trim();
        if root_path.is_empty() {
            continue;
        }

        let root = PathBuf::from(root_path);
        if !root.is_dir() {
            continue;
        }

        // Also accept selecting a vault itself, while the normal case is a
        // parent folder whose direct children are vaults.
        add_detected_vault(&root, &mut seen, &mut output);

        let entries = fs::read_dir(&root).map_err(|error| {
            format!(
                "Unable to scan the Obsidian vault folder '{}': {error}",
                root.display()
            )
        })?;

        for entry in entries {
            let entry = entry.map_err(|error| {
                format!(
                    "Unable to read an entry in '{}': {error}",
                    root.display()
                )
            })?;
            let file_type = entry.file_type().map_err(|error| {
                format!(
                    "Unable to inspect '{}': {error}",
                    entry.path().display()
                )
            })?;
            if file_type.is_symlink() || !file_type.is_dir() {
                continue;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }

            add_detected_vault(&entry.path(), &mut seen, &mut output);
        }
    }

    output.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.path.to_lowercase().cmp(&right.path.to_lowercase()))
    });
    Ok(output)
}

fn collect_vault_notes(
    vault_root: &Path,
    directory: &Path,
    vault_path: &str,
    vault_name: &str,
    query: &str,
    output: &mut Vec<(u8, DesktopVaultNoteDto)>,
    limit: usize,
) -> Result<(), String> {
    if output.len() >= limit.saturating_mul(4).max(limit) {
        return Ok(());
    }

    let entries = fs::read_dir(directory)
        .map_err(|error| format!("Unable to search '{}': {error}", directory.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("Unable to read a vault entry: {error}"))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Unable to inspect '{}': {error}", path.display()))?;

        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name.eq_ignore_ascii_case("node_modules") {
                continue;
            }
            collect_vault_notes(
                vault_root,
                &path,
                vault_path,
                vault_name,
                query,
                output,
                limit,
            )?;
            continue;
        }
        if !file_type.is_file() || !is_markdown_file(&path) {
            continue;
        }

        let relative = path
            .strip_prefix(vault_root)
            .map(normalized_relative)
            .map_err(|_| format!("'{}' is outside its vault.", path.display()))?;
        let file_name = path
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("Note.md")
            .to_string();
        let title = path
            .file_stem()
            .and_then(OsStr::to_str)
            .unwrap_or("Note")
            .to_string();
        let title_lower = title.to_lowercase();
        let relative_lower = relative.to_lowercase();
        let score = if query.is_empty() {
            3
        } else if title_lower == query {
            0
        } else if title_lower.starts_with(query) {
            1
        } else if title_lower.contains(query) {
            2
        } else if relative_lower.contains(query) {
            3
        } else {
            continue;
        };

        output.push((
            score,
            DesktopVaultNoteDto {
                vault_path: vault_path.to_string(),
                vault_name: vault_name.to_string(),
                relative_path: relative,
                file_name,
                title,
            },
        ));
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase", async)]
fn search_desktop_vault_notes(
    vault_paths: Vec<String>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<DesktopVaultNoteDto>, String> {
    let query = query.trim().to_lowercase();
    let limit = limit.unwrap_or(40).clamp(1, 100);
    let mut matches: Vec<(u8, DesktopVaultNoteDto)> = Vec::new();

    for vault_path in vault_paths {
        let root = PathBuf::from(vault_path.trim());
        if !root.join(".obsidian").is_dir() {
            continue;
        }
        let vault_name = root
            .file_name()
            .and_then(OsStr::to_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("Obsidian")
            .to_string();
        let normalized_vault_path = root.to_string_lossy().to_string();
        collect_vault_notes(
            &root,
            &root,
            &normalized_vault_path,
            &vault_name,
            &query,
            &mut matches,
            limit,
        )?;
    }

    matches.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| left.1.title.to_lowercase().cmp(&right.1.title.to_lowercase()))
            .then_with(|| {
                left.1
                    .relative_path
                    .to_lowercase()
                    .cmp(&right.1.relative_path.to_lowercase())
            })
    });
    matches.truncate(limit);
    Ok(matches.into_iter().map(|(_, note)| note).collect())
}

fn unique_attachment_path(directory: &Path, file_name: &str) -> PathBuf {
    let requested = directory.join(file_name);
    if !requested.exists() {
        return requested;
    }

    let stem = Path::new(file_name)
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("Attachment");
    let extension = Path::new(file_name).extension().and_then(OsStr::to_str);
    for suffix in 1_u32.. {
        let candidate_name = match extension {
            Some(extension) => format!("{stem} ({suffix}).{extension}"),
            None => format!("{stem} ({suffix})"),
        };
        let candidate = directory.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

#[tauri::command(rename_all = "camelCase", async)]
fn copy_desktop_attachment(
    data_folder: String,
    event_relative_path: String,
    source_path: String,
) -> Result<DesktopAttachmentDto, String> {
    let root = root_path(&data_folder)?;
    let event_path = safe_join(&root, &event_relative_path)?;
    if !is_markdown_file(&event_path) || !event_path.is_file() {
        return Err("The event note does not exist.".to_string());
    }

    let source = PathBuf::from(source_path);
    if !source.is_file() {
        return Err(format!("Attachment '{}' does not exist.", source.display()));
    }
    let file_name = source
        .file_name()
        .and_then(OsStr::to_str)
        .ok_or_else(|| "The attachment file name is invalid.".to_string())?;
    let validated_name = validate_single_name(file_name, "attachment")?;

    let event_directory = event_path
        .parent()
        .ok_or_else(|| "The event note has no parent folder.".to_string())?;
    let attachment_directory = event_directory.join(".attachments");
    fs::create_dir_all(&attachment_directory).map_err(|error| {
        format!(
            "Unable to create attachment folder '{}': {error}",
            attachment_directory.display()
        )
    })?;
    let target = unique_attachment_path(&attachment_directory, &validated_name);
    fs::copy(&source, &target).map_err(|error| {
        format!(
            "Unable to copy attachment '{}' to '{}': {error}",
            source.display(),
            target.display()
        )
    })?;

    let copied_name = target
        .file_name()
        .and_then(OsStr::to_str)
        .map(str::to_string)
        .unwrap_or_else(|| validated_name.clone());
    let relative_path = target
        .strip_prefix(&root)
        .map(normalized_relative)
        .map_err(|_| format!("'{}' is outside the data folder.", target.display()))?;
    let markdown_path = target
        .strip_prefix(event_directory)
        .map(normalized_relative)
        .map_err(|_| format!("'{}' is outside the event folder.", target.display()))?;

    Ok(DesktopAttachmentDto {
        file_name: copied_name,
        relative_path,
        markdown_path,
    })
}

/// Ce qu'une pièce jointe peut peser avant qu'on refuse de la porter en mémoire.
///
/// La vignette voyage encodée en texte à travers le pont : une image de dix
/// mégaoctets en ferait treize à traverser d'un coup, pour un carré de cent
/// pixels. Au-delà, la ligne montre son nom et son icône, ce qu'elle a toujours
/// fait.
const ATTACHMENT_PREVIEW_LIMIT: u64 = 8 * 1024 * 1024;

/// Là où vit le dossier des pièces jointes d'un événement, créé au besoin.
fn attachment_directory(root: &Path, event_relative_path: &str) -> Result<PathBuf, String> {
    let event_path = safe_join(root, event_relative_path)?;
    if !is_markdown_file(&event_path) || !event_path.is_file() {
        return Err("The event note does not exist.".to_string());
    }
    let event_directory = event_path
        .parent()
        .ok_or_else(|| "The event note has no parent folder.".to_string())?;
    let directory = event_directory.join(".attachments");
    fs::create_dir_all(&directory).map_err(|error| {
        format!(
            "Unable to create attachment folder '{}': {error}",
            directory.display()
        )
    })?;
    Ok(directory)
}

/// La pièce jointe telle que la note devra la nommer, une fois écrite.
fn attachment_dto(
    root: &Path,
    event_relative_path: &str,
    target: &Path,
    fallback_name: &str,
) -> Result<DesktopAttachmentDto, String> {
    let event_path = safe_join(root, event_relative_path)?;
    let event_directory = event_path
        .parent()
        .ok_or_else(|| "The event note has no parent folder.".to_string())?;
    let file_name = target
        .file_name()
        .and_then(OsStr::to_str)
        .map(str::to_string)
        .unwrap_or_else(|| fallback_name.to_string());
    let relative_path = target
        .strip_prefix(root)
        .map(normalized_relative)
        .map_err(|_| format!("'{}' is outside the data folder.", target.display()))?;
    let markdown_path = target
        .strip_prefix(event_directory)
        .map(normalized_relative)
        .map_err(|_| format!("'{}' is outside the event folder.", target.display()))?;
    Ok(DesktopAttachmentDto {
        file_name,
        relative_path,
        markdown_path,
    })
}

/// Écrit une pièce jointe à partir de son contenu, et non d'un fichier existant.
///
/// C'est ce que colle le presse-papiers : une capture d'écran n'est nulle part
/// sur le disque, elle n'a que des octets. Le reste — dossier `.attachments`,
/// nom validé, nom rendu unique — est celui de `copy_desktop_attachment`, parce
/// qu'une pièce jointe collée est une pièce jointe comme une autre.
#[tauri::command(rename_all = "camelCase", async)]
fn write_desktop_attachment(
    data_folder: String,
    event_relative_path: String,
    file_name: String,
    contents: Vec<u8>,
) -> Result<DesktopAttachmentDto, String> {
    if contents.is_empty() {
        return Err("The pasted attachment is empty.".to_string());
    }
    let root = root_path(&data_folder)?;
    let validated_name = validate_single_name(&file_name, "attachment")?;
    let directory = attachment_directory(&root, &event_relative_path)?;
    let target = unique_attachment_path(&directory, &validated_name);
    fs::write(&target, &contents).map_err(|error| {
        format!(
            "Unable to write attachment '{}': {error}",
            target.display()
        )
    })?;
    attachment_dto(&root, &event_relative_path, &target, &validated_name)
}

/// Le contenu d'une pièce jointe, encodé pour traverser le pont.
///
/// La WebView ne peut pas ouvrir un `file://` : c'est tout l'intérêt de son
/// isolement. Plutôt qu'ouvrir un protocole d'accès aux fichiers pour toute
/// l'application, ce qu'elle demande arrive ici, un fichier à la fois, et
/// seulement s'il se trouve bien sous le dossier de données.
#[tauri::command(rename_all = "camelCase", async)]
fn read_desktop_attachment(data_folder: String, relative_path: String) -> Result<String, String> {
    let root = root_path(&data_folder)?;
    let path = safe_join(&root, &relative_path)?;
    if !path.is_file() {
        return Err(format!("'{}' does not exist.", path.display()));
    }
    let size = fs::metadata(&path)
        .map(|meta| meta.len())
        .map_err(|error| format!("Unable to read '{}': {error}", path.display()))?;
    if size > ATTACHMENT_PREVIEW_LIMIT {
        return Err("The attachment is too large to preview.".to_string());
    }
    let bytes =
        fs::read(&path).map_err(|error| format!("Unable to read '{}': {error}", path.display()))?;
    Ok(base64_encode(&bytes))
}

/// Base64, écrit ici plutôt qu'ajouté en dépendance.
///
/// Une caisse entière pour soixante-quatre caractères et trois lignes de
/// décalage, dans un binaire qui n'en a aucun autre besoin, coûte plus cher à
/// suivre qu'à écrire.
fn base64_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(ALPHABET[(triple >> 18 & 63) as usize] as char);
        out.push(ALPHABET[(triple >> 12 & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[(triple >> 6 & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[(triple & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

#[tauri::command(rename_all = "camelCase", async)]
fn fetch_desktop_ics(url: String) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("The calendar URL is empty.".to_string());
    }

    let normalized = if let Some(rest) = trimmed.strip_prefix("webcal://") {
        format!("https://{rest}")
    } else {
        trimmed.to_string()
    };

    if !(normalized.starts_with("https://") || normalized.starts_with("http://")) {
        return Err("Remote calendars must use webcal://, https:// or http://.".to_string());
    }

    let output = hidden_command("curl.exe")
        .args([
            "--location",
            "--fail",
            "--silent",
            "--show-error",
            "--connect-timeout",
            "15",
            "--max-time",
            "45",
            "--user-agent",
            "NeoCalendar/1.0",
            normalized.as_str(),
        ])
        .output()
        .map_err(|error| format!("Unable to start the Windows HTTP client: {error}"))?;

    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            format!("Unable to download the remote calendar ({}).", output.status)
        } else {
            detail
        });
    }

    let text = String::from_utf8(output.stdout)
        .map_err(|_| "The remote calendar is not valid UTF-8 text.".to_string())?;
    if text.trim().is_empty() {
        return Err("The remote calendar returned an empty response.".to_string());
    }
    Ok(text)
}

/// Ce qui a ete telecharge et attend qu'on le pose.
///
/// Les octets sont gardes en memoire plutot qu'ecrits quelque part : ils ne
/// survivent pas a la fermeture de l'application, et c'est voulu — au prochain
/// lancement la verification recommence, et une mise a jour encore plus recente
/// aura peut-etre paru entre-temps.
#[cfg(desktop)]
#[derive(Default)]
struct PendingUpdate(std::sync::Mutex<Option<(tauri_plugin_updater::Update, Vec<u8>)>>);

/// L'etat de la surveillance : une recherche a la fois, et pas deux a la
/// minute.
///
/// Une application de bureau reste ouverte des jours. Cherchee au seul
/// demarrage, une version publiee dans l'apres-midi n'etait vue qu'au prochain
/// lancement — c'est-a-dire le lendemain, et c'est ce qui rendait un bouton
/// « rechercher » indispensable. Elle se cherche maintenant toute seule, a
/// intervalle et au retour sur la fenetre.
#[cfg(desktop)]
#[derive(Default)]
struct UpdateWatch {
    busy: std::sync::atomic::AtomicBool,
    last: std::sync::Mutex<Option<std::time::Instant>>,
}

/// L'intervalle entre deux recherches pendant que l'application tourne. Une
/// requete de 240 octets ; ce qui compte est de ne pas la refaire a chaque
/// aller-retour sur la fenetre.
#[cfg(desktop)]
const UPDATE_POLL: std::time::Duration = std::time::Duration::from_secs(30 * 60);

/// Le repos minimal entre deux recherches. Reprendre le focus dix fois en une
/// minute ne doit pas faire dix requetes.
#[cfg(desktop)]
const UPDATE_QUIET: std::time::Duration = std::time::Duration::from_secs(5 * 60);

/// Le pourcentage descendu, dit a la fenetre. -1 quand personne n'a annonce la
/// taille du fichier : il n'y a alors rien d'honnete a compter.
#[cfg(desktop)]
const UPDATE_PROGRESS_EVENT: &str = "neo-update-progress";

/// La version telechargee et prete a poser.
#[cfg(desktop)]
const UPDATE_READY_EVENT: &str = "neo-update-ready";

/// Descend un installateur en publiant le meme avancement, que le transfert
/// ait commence en arriere-plan ou juste avant l'installation.
#[cfg(desktop)]
async fn download_update(
    app: &tauri::AppHandle,
    update: &tauri_plugin_updater::Update,
) -> tauri_plugin_updater::Result<Vec<u8>> {
    use tauri::Emitter;

    let mut received: u64 = 0;
    let reporter = app.clone();
    update
        .download(
            move |chunk, total| {
                received += chunk as u64;
                let percent = match total {
                    Some(size) if size > 0 => {
                        ((received as f64 / size as f64) * 100.0).round().min(100.0) as i64
                    }
                    _ => -1,
                };
                let _ = reporter.emit(UPDATE_PROGRESS_EVENT, percent);
            },
            || {},
        )
        .await
}

/// Va chercher la mise a jour, et s'arrete la.
///
/// Elle s'installait toute seule au demarrage, puis redemarrait l'application
/// sous les doigts de qui s'en servait. Le telechargement reste automatique —
/// c'est la partie qui prend du temps et qu'on n'a aucune raison de demander —
/// mais poser la nouvelle version est un geste, et il appartient a la personne
/// devant l'ecran.
#[cfg(desktop)]
async fn fetch_available_update(app: tauri::AppHandle) -> tauri_plugin_updater::Result<()> {
    use tauri::Emitter;

    let Some(update) = app.updater()?.check().await? else {
        return Ok(());
    };

    let version = update.version.clone();
    let bytes = download_update(&app, &update).await?;

    app.state::<PendingUpdate>()
        .0
        .lock()
        .map(|mut held| *held = Some((update, bytes)))
        .ok();
    let _ = app.emit(UPDATE_READY_EVENT, version);
    Ok(())
}

/// Chercher, si cela a un sens maintenant.
///
/// Trois raisons de ne rien faire : une version attend deja qu'on la pose (la
/// suivante se cherchera apres l'installation), une recherche est en cours, ou
/// la derniere est trop recente pour qu'une autre apprenne quoi que ce soit.
#[cfg(desktop)]
async fn fetch_if_due(app: tauri::AppHandle, force: bool) {
    use std::sync::atomic::Ordering;

    let held = app
        .state::<PendingUpdate>()
        .0
        .lock()
        .map(|held| held.is_some())
        .unwrap_or(true);
    if held {
        return;
    }

    let watch = app.state::<UpdateWatch>();
    if !force {
        let recent = watch
            .last
            .lock()
            .map(|last| last.map_or(false, |at| at.elapsed() < UPDATE_QUIET))
            .unwrap_or(true);
        if recent {
            return;
        }
    }
    if watch.busy.swap(true, Ordering::SeqCst) {
        return;
    }

    if let Ok(mut last) = watch.last.lock() {
        *last = Some(std::time::Instant::now());
    }
    if let Err(error) = fetch_available_update(app.clone()).await {
        eprintln!("Automatic update check failed: {error}");
    }
    app.state::<UpdateWatch>().busy.store(false, Ordering::SeqCst);
}

fn latest_replaces_pending(pending_version: Option<&str>, latest_version: &str) -> bool {
    let Some(pending_version) = pending_version else {
        return true;
    };
    match (
        semver::Version::parse(pending_version),
        semver::Version::parse(latest_version),
    ) {
        (Ok(pending), Ok(latest)) => latest > pending,
        _ => pending_version != latest_version,
    }
}

/// Pose la version la plus recente, puis redemarre.
///
/// L'installateur garde normalement les octets descendus en arriere-plan. Mais
/// une nouvelle release peut paraitre entre ce telechargement et le clic : poser
/// aveuglement l'ancien paquet imposait alors un premier redemarrage, puis un
/// second pour la vraie derniere version. Le clic relit donc les metadonnees et,
/// si elles ont change, descend ce dernier paquet puis l'installe dans le meme
/// geste. Sans reseau, le paquet deja verifie reste utilisable.
#[cfg(desktop)]
#[tauri::command]
async fn install_pending_update(app: tauri::AppHandle) -> Result<(), String> {
    let pending = app
        .state::<PendingUpdate>()
        .0
        .lock()
        .map_err(|_| "The pending update is unreadable.".to_string())?
        .take();

    let latest = match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(update) => update,
            Err(error) if pending.is_some() => {
                eprintln!("Unable to refresh the update before installation: {error}");
                None
            }
            Err(error) => {
                return Err(format!(
                    "Unable to refresh the update before installation: {error}"
                ));
            }
        },
        Err(error) if pending.is_some() => {
            eprintln!("Unable to prepare the updater before installation: {error}");
            None
        }
        Err(error) => {
            return Err(format!(
                "Unable to prepare the updater before installation: {error}"
            ));
        }
    };

    let replace_pending = latest.as_ref().is_some_and(|update| {
        latest_replaces_pending(
            pending.as_ref().map(|(held, _)| held.version.as_str()),
            &update.version,
        )
    });

    let selected = if replace_pending {
        let update = latest.expect("a replacement update was just checked");
        match download_update(&app, &update).await {
            Ok(bytes) => (update, bytes),
            Err(error) => {
                if let Some(pending) = pending {
                    if let Ok(mut held) = app.state::<PendingUpdate>().0.lock() {
                        *held = Some(pending);
                    }
                }
                return Err(format!("Unable to download the latest update: {error}"));
            }
        }
    } else {
        pending.ok_or_else(|| "No update has been downloaded.".to_string())?
    };

    let (update, bytes) = selected;
    if let Err(error) = update.install(&bytes) {
        if let Ok(mut held) = app.state::<PendingUpdate>().0.lock() {
            *held = Some((update, bytes));
        }
        return Err(format!("Unable to install the update: {error}"));
    }
    app.restart();
}

/// Sur telephone, la coque Android fait tout cela elle-meme : la commande
/// existe pour que le meme code de fenetre puisse l'appeler sans savoir ou il
/// tourne, et repond qu'il n'y a rien a poser.
#[cfg(not(desktop))]
#[tauri::command]
fn install_pending_update() -> Result<(), String> {
    Err("No update has been downloaded.".to_string())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.manage(PendingUpdate::default());
                app.manage(UpdateWatch::default());

                // Au demarrage, sans attendre le premier battement.
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    fetch_if_due(handle, true).await;
                });

                // Puis toutes les demi-heures, tant que l'application tourne.
                // Un fil a lui, plutot qu'un minuteur asynchrone : il n'y a
                // rien a annuler et rien a attendre, et le sommeil d'un fil
                // ne demande aucune dependance de plus.
                let ticking = app.handle().clone();
                std::thread::spawn(move || loop {
                    std::thread::sleep(UPDATE_POLL);
                    let handle = ticking.clone();
                    tauri::async_runtime::block_on(fetch_if_due(handle, false));
                });

                // Et au retour sur la fenetre : revenir apres une heure
                // ailleurs est le moment ou l'on s'attend a ce que
                // l'application se soit tenue au courant.
                if let Some(window) = app.get_webview_window("main") {
                    let focused = app.handle().clone();
                    window.on_window_event(move |event| {
                        if !matches!(event, tauri::WindowEvent::Focused(true)) {
                            return;
                        }
                        let handle = focused.clone();
                        tauri::async_runtime::spawn(async move {
                            fetch_if_due(handle, false).await;
                        });
                    });
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            has_obsidian_config,
            load_desktop_workspace,
            save_desktop_preferences,
            write_desktop_event_file,
            delete_desktop_event_file,
            create_desktop_calendar_folder,
            ensure_desktop_ics_folder,
            rename_desktop_calendar_folder,
            delete_desktop_calendar_folder,
            open_desktop_path,
            open_desktop_external_target,
            open_desktop_linked_path,
            write_desktop_clipboard_text,
            copy_desktop_path,
            discover_desktop_obsidian_vaults,
            search_desktop_vault_notes,
            copy_desktop_attachment,
            write_desktop_attachment,
            read_desktop_attachment,
            install_pending_update,
            fetch_desktop_ics
        ])
        .run(tauri::generate_context!())
        .expect("error while running Neo Calendar");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Une commande Tauri synchrone s'execute sur le thread principal, celui
    /// qui fait tourner la fenetre : tout ce qu'elle attend, la fenetre
    /// l'attend avec elle. `fetch_desktop_ics` attend `curl.exe` jusqu'a
    /// quarante-cinq secondes, et chaque note ecrite sonde le disque pour
    /// trouver un nom libre. Mesure a l'appui : pendant le chargement d'un
    /// calendrier distant, l'application ne repondait plus du tout.
    ///
    /// `async` sur l'attribut ne rend pas la fonction asynchrone : il dit a
    /// Tauri de la porter sur le pool de threads de son runtime au lieu de la
    /// fenetre. C'est la seule chose qui separe une attente d'un gel.
    /// Une application graphique qui lance un programme console lui alloue une
    /// console, et Windows la montre : une fenetre noire s'ouvre et se referme
    /// aussitot. `curl.exe` part des le demarrage, avec la premiere synchro des
    /// liens ICS, et `reg.exe` des qu'un lieu ouvre un protocole — signale a
    /// l'ecran le 2026-09-03, sur l'application installee.
    ///
    /// `CREATE_NO_WINDOW` est ce qui separe un programme lance d'un programme
    /// lance visiblement. Il est pose une fois pour toutes dans
    /// `hidden_command`, et ce test garde la porte : un `Command::new` ecrit
    /// directement echapperait au drapeau sans que rien ne le dise.
    #[test]
    fn console_programs_are_started_without_a_console() {
        let source = include_str!("lib.rs");
        // Le motif est assemble plutot qu'ecrit : ecrit, ce test se compterait
        // lui-meme et resterait rouge apres le dernier appel corrige.
        let needle = format!("{}::new(", "Command");
        let allowed = format!("let mut command = {needle}program);");

        assert_eq!(
            source.matches(&needle).count() - source.matches(&allowed).count(),
            0,
            "toute commande passe par hidden_command, qui pose CREATE_NO_WINDOW"
        );
    }

    #[test]
    fn blocking_commands_are_kept_off_the_window_thread() {
        let source = include_str!("lib.rs");
        for name in [
            // Le reseau, d'abord : c'est la plus longue des attentes.
            "fn fetch_desktop_ics",
            // Les notes d'un lien, ecrites par paquets.
            "fn write_desktop_event_file",
            "fn delete_desktop_event_file",
            "fn ensure_desktop_ics_folder",
            // Le dossier de donnees entier, lu au demarrage et a chaque
            // retour sur la fenetre : la plus lourde lecture de toutes.
            "fn load_desktop_workspace",
            "fn save_desktop_preferences",
            // Les dossiers de calendrier.
            "fn create_desktop_calendar_folder",
            "fn rename_desktop_calendar_folder",
            "fn delete_desktop_calendar_folder",
            // Les coffres Obsidian : une recherche qui parcourt des milliers
            // de notes pendant que l'on tape.
            "fn discover_desktop_obsidian_vaults",
            "fn search_desktop_vault_notes",
            // Les pieces jointes, qui se comptent en megaoctets.
            "fn copy_desktop_attachment",
            "fn write_desktop_attachment",
            "fn read_desktop_attachment",
        ] {
            let at = source
                .find(name)
                .unwrap_or_else(|| panic!("{name} est introuvable"));
            let attribute_start = source[..at]
                .rfind("#[tauri::command")
                .unwrap_or_else(|| panic!("{name} n'est pas une commande Tauri"));
            let attribute = &source[attribute_start..at];
            assert!(
                attribute.contains("async"),
                "{name} bloquerait le thread de la fenetre : {attribute}"
            );
        }
    }

    /// L'inverse, et il compte autant.
    ///
    /// Le presse-papier Windows appartient a la fenetre qui l'ouvre, et
    /// `ShellExecute` a besoin du COM initialise par le thread principal.
    /// Porter ces commandes sur le pool ne les rendrait pas plus rapides — il
    /// n'y a rien a y attendre — mais casserait « copier le chemin » et
    /// « ouvrir dans l'explorateur », sans rien dire a l'ecran.
    ///
    /// Ce test existe pour la personne qui, voyant la liste ci-dessus,
    /// voudrait finir le travail.
    #[test]
    fn window_bound_commands_stay_on_the_window_thread() {
        let source = include_str!("lib.rs");
        for name in [
            "fn write_desktop_clipboard_text",
            "fn copy_desktop_path",
            "fn open_desktop_path",
            "fn open_desktop_external_target",
            "fn open_desktop_linked_path",
        ] {
            let at = source
                .find(name)
                .unwrap_or_else(|| panic!("{name} est introuvable"));
            let attribute_start = source[..at]
                .rfind("#[tauri::command")
                .unwrap_or_else(|| panic!("{name} n'est pas une commande Tauri"));
            let attribute = &source[attribute_start..at];
            assert!(
                !attribute.contains("async"),
                "{name} a besoin du thread de la fenetre : {attribute}"
            );
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_shell_accepts_only_success_codes_above_thirty_two() {
        assert!(!shell_execute_succeeded(2));
        assert!(!shell_execute_succeeded(32));
        assert!(shell_execute_succeeded(33));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn native_text_keeps_query_strings_and_unicode_intact() {
        let value = "https://example.com/recherche?q=été&lang=fr";
        let encoded = nul_terminated_utf16(value);

        assert_eq!(encoded.last(), Some(&0));
        assert_eq!(
            String::from_utf16(&encoded[..encoded.len() - 1]).unwrap(),
            value
        );
    }

    #[test]
    fn a_new_release_replaces_an_older_download_before_installation() {
        assert!(latest_replaces_pending(Some("1.51.2"), "1.51.3"));
        assert!(!latest_replaces_pending(Some("1.51.3"), "1.51.3"));
        assert!(!latest_replaces_pending(Some("1.51.3"), "1.51.2"));
        assert!(latest_replaces_pending(None, "1.51.3"));
    }

    fn temporary_root(name: &str) -> PathBuf {
        let root = env::temp_dir().join(format!("neo-calendar-tests-{name}"));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("temporary folder");
        root
    }

    #[test]
    fn a_save_never_drops_a_colour_another_device_added() {
        // The data folder is synced: between this app loading the file and
        // saving it back, the phone can have added a calendar colour. Writing
        // the loaded snapshot verbatim would erase it.
        let root = temporary_root("merge-colors");
        write_preferences(&root, &json!({"colors": {"Work": "#ff0000"}})).unwrap();

        write_preferences(&root, &json!({"colors": {"Sport": "#00ff00"}})).unwrap();

        let stored = read_preferences(&root).unwrap();
        assert_eq!(stored["colors"]["Work"], "#ff0000");
        assert_eq!(stored["colors"]["Sport"], "#00ff00");
    }

    #[test]
    fn a_save_still_recolours_a_calendar_on_purpose() {
        let root = temporary_root("recolour");
        write_preferences(&root, &json!({"colors": {"Work": "#ff0000"}})).unwrap();

        write_preferences(&root, &json!({"colors": {"Work": "#0000ff"}})).unwrap();

        assert_eq!(read_preferences(&root).unwrap()["colors"]["Work"], "#0000ff");
    }

    #[test]
    fn an_absent_file_is_reported_as_absent() {
        let root = temporary_root("absent");

        let (_, found) = read_preferences_found(&root).unwrap();

        assert!(!found);
    }

    #[test]
    fn a_file_caught_empty_mid_replacement_is_not_a_blank_slate() {
        // Syncthing replaces files rather than editing them, so a reader can
        // land on a zero-length file. Reporting that as "no preferences" is
        // what let the defaults be written over real ones.
        let root = temporary_root("empty");
        fs::write(root.join(PREFERENCES_FILE_NAME), "").unwrap();

        let (_, found) = read_preferences_found(&root).unwrap();

        assert!(!found);
    }

    #[test]
    fn a_real_file_is_reported_as_found() {
        let root = temporary_root("present");
        write_preferences(&root, &json!({"colors": {"Work": "#ff0000"}})).unwrap();

        let (_, found) = read_preferences_found(&root).unwrap();

        assert!(found);
    }

    #[test]
    fn reads_the_legacy_file_until_the_new_one_exists() {
        let root = temporary_root("legacy");
        fs::write(
            root.join(LEGACY_PREFERENCES_FILE_NAME),
            r##"{"colors":{"Work":"#ff0000"}}"##,
        )
        .unwrap();

        let preferences = read_preferences(&root).expect("legacy preferences");

        assert_eq!(preferences["colors"]["Work"], json!("#ff0000"));
    }

    #[test]
    fn saving_migrates_the_legacy_file_to_the_new_name() {
        let root = temporary_root("migrate");
        fs::write(root.join(LEGACY_PREFERENCES_FILE_NAME), "{}").unwrap();

        write_preferences(&root, &json!({"colors": {"Work": "#00ff00"}})).unwrap();

        assert!(root.join(PREFERENCES_FILE_NAME).exists());
        assert!(!root.join(LEGACY_PREFERENCES_FILE_NAME).exists());
        assert_eq!(
            read_preferences(&root).unwrap()["colors"]["Work"],
            json!("#00ff00")
        );
    }

    #[test]
    fn missing_file_reads_as_empty_but_broken_json_fails_loudly() {
        let root = temporary_root("broken");
        assert_eq!(read_preferences(&root).unwrap(), json!({}));

        fs::write(root.join(PREFERENCES_FILE_NAME), "{ not json").unwrap();

        assert!(read_preferences(&root).is_err());
    }

    #[test]
    fn writing_leaves_no_temporary_file_behind() {
        let root = temporary_root("atomic");

        write_preferences(&root, &json!({"a": 1})).unwrap();

        assert!(!root.join(format!("{PREFERENCES_FILE_NAME}.tmp")).exists());
    }
}
