// ForgeX desktop entry. The library crate holds the real setup so the binary
// stays a thin wrapper (this matches the official Tauri 2 template shape).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    forgex_lib::run()
}