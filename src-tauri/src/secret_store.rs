//! Provider API-key storage backed by the operating system credential store.
//!
//! macOS uses the Keychain through `keyring`'s SecurityFramework backend;
//! Windows uses Credential Manager through its native backend. Errors never
//! include the secret itself, and missing entries are represented as `None`.

const SERVICE_NAME: &str = "dev.aiden.forgex.providers";

#[cfg(any(target_os = "macos", target_os = "windows"))]
use keyring::Entry;

fn validate_provider_id(provider_id: String) -> Result<String, String> {
    if is_valid_provider_id(&provider_id) {
        Ok(provider_id)
    } else {
        Err("Invalid provider secret identifier".to_string())
    }
}

fn is_valid_provider_id(provider_id: &str) -> bool {
    let mut characters = provider_id.chars();
    matches!(characters.next(), Some(first) if first.is_ascii_alphanumeric())
        && provider_id.len() <= 128
        && characters.all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn credential(provider_id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, provider_id).map_err(|_| "Secure storage is unavailable".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn credential(_: &str) -> Result<(), String> {
    Err("Secure storage is not supported on this platform".to_string())
}

#[tauri::command]
pub(crate) async fn provider_secret_get(provider_id: String) -> Result<Option<String>, String> {
    let provider_id = validate_provider_id(provider_id)?;
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            let entry = credential(&provider_id)?;
            match entry.get_password() {
                Ok(api_key) => Ok(Some(api_key)),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(_) => Err("Unable to read the provider key".to_string()),
            }
        })
        .await
        .map_err(|_| "Secure storage task failed".to_string())?
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = provider_id;
        credential(&provider_id)?;
        Ok(None)
    }
}

#[tauri::command]
pub(crate) async fn provider_secret_set(
    provider_id: String,
    api_key: String,
) -> Result<(), String> {
    let provider_id = validate_provider_id(provider_id)?;
    if api_key.is_empty() {
        return Err("Provider API key cannot be empty".to_string());
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            credential(&provider_id)?
                .set_password(&api_key)
                .map_err(|_| "Unable to save the provider key".to_string())
        })
        .await
        .map_err(|_| "Secure storage task failed".to_string())?
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = api_key;
        credential(&provider_id)?;
        Ok(())
    }
}

#[tauri::command]
pub(crate) async fn provider_secret_delete(provider_id: String) -> Result<(), String> {
    let provider_id = validate_provider_id(provider_id)?;
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            let entry = credential(&provider_id)?;
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
                Err(_) => Err("Unable to delete the provider key".to_string()),
            }
        })
        .await
        .map_err(|_| "Secure storage task failed".to_string())?
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        credential(&provider_id)?;
        Ok(())
    }
}
