use serde::Deserialize;
use serde_json::{json, Value};
use tauri::WebviewWindow;
use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
use windows_core::HSTRING;

#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NativeTextCommand {
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    PastePlain,
    Delete,
    SelectAll,
}

impl NativeTextCommand {
    fn blink_command(&self) -> &'static str {
        match self {
            Self::Undo => "Undo",
            Self::Redo => "Redo",
            Self::Cut => "Cut",
            Self::Copy => "Copy",
            Self::Paste => "Paste",
            Self::PastePlain => "PasteAndMatchStyle",
            Self::Delete => "Delete",
            Self::SelectAll => "SelectAll",
        }
    }
}

fn text_command_params(command: NativeTextCommand) -> Value {
    json!({"type": "rawKeyDown", "key": "Unidentified", "commands": [command.blink_command()]})
}

fn hard_reload_params() -> Value {
    json!({"ignoreCache": true})
}

// The completion callback is delivered on the UI thread, so the wait for it
// must not sit anywhere that thread needs. It must not sit on the async pool
// either: that pool also carries the update loop of lib.rs, and a WebView2 call
// that never answers would hold one of its workers for the whole timeout. Hence
// spawn_blocking — the wait happens on a thread whose only job is to wait.
// Protocol failures come back to the caller; nothing reports success before the
// callback actually fires.
async fn call_protocol(
    window: WebviewWindow,
    method: &'static str,
    params: Value,
) -> Result<(), String> {
    let (sender, receiver) = std::sync::mpsc::channel();
    window.with_webview(move |webview| {
        let completed = sender.clone();
        let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |result, _| {
            let _ = completed.send(result.map_err(|error| error.to_string()));
            Ok(())
        }));
        let result = unsafe {
            webview.controller().CoreWebView2().and_then(|core| {
                core.CallDevToolsProtocolMethod(
                    &HSTRING::from(method),
                    &HSTRING::from(params.to_string()),
                    &handler,
                )
            })
        };
        if let Err(error) = result {
            let _ = sender.send(Err(error.to_string()));
        }
    }).map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        receiver
            .recv_timeout(std::time::Duration::from_secs(5))
            .map_err(|error| format!("{method}: {error}"))?
    })
    .await
    .map_err(|error| format!("{method}: {error}"))?
}

#[tauri::command]
pub async fn execute_native_text_command(window: WebviewWindow, command: NativeTextCommand) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Unsupported window".into());
    }
    call_protocol(window, "Input.dispatchKeyEvent", text_command_params(command)).await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn reload_desktop(window: WebviewWindow, ignore_cache: bool) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Unsupported window".into());
    }
    if ignore_cache {
        call_protocol(window, "Page.reload", hard_reload_params()).await
    } else {
        window.reload().map_err(|error| error.to_string())
    }
}

// Tauri cannot detect or close DevTools on Windows; repeated calls focus
// the existing inspector instead of closing it.
#[tauri::command]
pub fn toggle_desktop_devtools(window: WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Unsupported window".into());
    }
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn window_commands_map_every_allowed_text_command() {
        for (serialized, blink) in [
            ("undo", "Undo"),
            ("redo", "Redo"),
            ("cut", "Cut"),
            ("copy", "Copy"),
            ("paste", "Paste"),
            ("paste-plain", "PasteAndMatchStyle"),
            ("delete", "Delete"),
            ("select-all", "SelectAll"),
        ] {
            let command: NativeTextCommand = serde_json::from_value(json!(serialized)).expect("allowed command");
            assert_eq!(command.blink_command(), blink);
            assert_eq!(text_command_params(command), json!({"type":"rawKeyDown","key":"Unidentified","commands":[blink]}));
        }
    }

    #[test]
    fn window_commands_hard_reload_bypasses_cache() {
        assert_eq!(hard_reload_params(), json!({"ignoreCache":true}));
    }

    #[test]
    fn window_commands_reject_unknown_text_commands() {
        assert!(serde_json::from_value::<NativeTextCommand>(json!("ArbitraryCommand")).is_err());
    }
}
