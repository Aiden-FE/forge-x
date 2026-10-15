fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "provider_secret_delete",
            "provider_secret_get",
            "provider_secret_set",
        ]),
    ))
    .expect("failed to run tauri-build");
}
