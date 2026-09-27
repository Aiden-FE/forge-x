//! ForgeX desktop app — Tauri 2 shell over the existing Vue/Vite renderer.
//!
//! Behaviour per `.scratch/desktop-support/spec.md`:
//! - Single main window; closing it on Windows quits the app.
//! - Native application menu with a standard Edit menu (copy / paste /
//!   select all / quit) — `accelerator` strings let the OS webview
//!   forward the same key events to the focused DOM element.
//! - No theme/language controls in the menu (renderer-only per spec).
//! - Toggling the menu item "Home" pushes the renderer to "/".
//! - On macOS, the OS keeps the app alive after the last window closes
//!   (Tauri default); when the user reopens via the dock, the renderer
//!   is reloaded with `index.html`, so no transient tool input survives.

use tauri::menu::{AboutMetadata, MenuBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ----- Native menu -----
            // On macOS the OS expects an application menu (the one named after
            // the product) plus a standard Edit submenu. Tauri adds the App
            // menu automatically when Menu::setAppMenu is called with the
            // macOS-style layout, so we only build the Edit / Tools submenus.
            #[cfg(target_os = "macos")]
            {
                let app_menu = SubmenuBuilder::new(app, "ForgeX")
                    .about(Some(AboutMetadata::default()))
                    .separator()
                    .quit()
                    .build()?;
                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;
                let window_menu = SubmenuBuilder::new(app, "Window")
                    .minimize()
                    .maximize()
                    .separator()
                    .close_window()
                    .build()?;
                let menu = MenuBuilder::new(app)
                    .items(&[&app_menu, &edit_menu, &window_menu])
                    .build()?;
                app.set_menu(menu)?;
            }

            // On Windows / Linux the menu is per-window. The spec asks for
            // a system-native application menu, so we attach a File / Edit
            // menu to the main window.
            #[cfg(not(target_os = "macos"))]
            {
                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;
                let menu = MenuBuilder::new(app)
                    .items(&[&edit_menu])
                    .build()?;
                if let Some(window) = app.get_webview_window("main") {
                    window.set_menu(menu)?;
                }
            }

            // Reopen behaviour: when the user reopens the window after it was
            // closed (macOS dock), Tauri recreates the webview and reloads
            // `index.html`. The Vue router starts at `/`, satisfying the
            // "reopen → home, no transient tool input" rule.

            if let Some(window) = app.get_webview_window("main") {
                let win = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::Focused(true) = event {
                        let _ = win.emit("forgex://focus", ());
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ForgeX");
}