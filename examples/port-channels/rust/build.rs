// Generates the plugin's permissions (sense:allow-frames) from its command list
const COMMANDS: &[&str] = &["frames"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
