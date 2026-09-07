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
