use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::env;
use std::ffi::OsStr;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use tauri::Manager;

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

fn read_event_files(
    root: &Path,
    calendar_path: &str,
    absolute_calendar_path: &Path,
) -> Result<Vec<DesktopEventFileDto>, String> {
    let mut files = Vec::new();

    for entry in fs::read_dir(absolute_calendar_path).map_err(|error| {
        format!(
            "Unable to read calendar folder '{}': {error}",
            absolute_calendar_path.display()
        )
    })? {
        let entry = entry.map_err(|error| format!("Unable to read a calendar entry: {error}"))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Unable to inspect '{}': {error}", path.display()))?;
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

    files.sort_by(|left, right| left.file_name.to_lowercase().cmp(&right.file_name.to_lowercase()));
    Ok(files)
}

#[tauri::command(rename_all = "camelCase")]
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

#[tauri::command(rename_all = "camelCase")]
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

#[tauri::command(rename_all = "camelCase")]
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

#[tauri::command(rename_all = "camelCase")]
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

#[tauri::command(rename_all = "camelCase")]
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

#[tauri::command(rename_all = "camelCase")]
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

#[tauri::command(rename_all = "camelCase")]
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
        Command::new("explorer")
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

#[cfg(target_os = "windows")]
fn registry_protocol_command(scheme: &str) -> Option<String> {
    let keys = [
        format!(r"HKCU\Software\Classes\{scheme}\shell\open\command"),
        format!(r"HKCR\{scheme}\shell\open\command"),
    ];

    for key in keys {
        let output = Command::new("reg.exe")
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

    let mut command = Command::new(&executable);
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
    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            "Start-Process -FilePath $args[0]",
        ])
        .arg(target)
        .output()
        .map_err(|error| format!("Unable to start the Windows shell: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if detail.is_empty() {
        "Windows could not open the linked item.".to_string()
    } else {
        detail
    })
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
                Command::new(&executable)
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
        Command::new("explorer.exe")
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

#[tauri::command(rename_all = "camelCase")]
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

#[tauri::command(rename_all = "camelCase")]
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

#[tauri::command(rename_all = "camelCase")]
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

#[tauri::command(rename_all = "camelCase")]
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

    let output = Command::new("curl.exe")
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
        .invoke_handler(tauri::generate_handler![
            has_obsidian_config,
            load_desktop_workspace,
            save_desktop_preferences,
            write_desktop_event_file,
            delete_desktop_event_file,
            create_desktop_calendar_folder,
            rename_desktop_calendar_folder,
            delete_desktop_calendar_folder,
            open_desktop_path,
            open_desktop_external_target,
            open_desktop_linked_path,
            discover_desktop_obsidian_vaults,
            search_desktop_vault_notes,
            copy_desktop_attachment,
            fetch_desktop_ics
        ])
        .run(tauri::generate_context!())
        .expect("error while running Neo Calendar");
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
