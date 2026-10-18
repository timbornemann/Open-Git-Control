use crate::{
    model::{ImageIdentity, Installation, Kind, APP_ID, PRODUCT},
    policy, safe_io,
};
use anyhow::{ensure, Context, Result};
use semver::Version;
use serde::Deserialize;
use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Descriptor {
    schema: u32,
    app_id: String,
    version: String,
    kind: Kind,
}

pub fn default_profile() -> Result<PathBuf> {
    Ok(directories::BaseDirs::new()
        .context("User profile is unavailable.")?
        .config_dir()
        .join(PRODUCT))
}
pub fn inspect(target: &Path, profile: Option<&Path>, hint: Option<Kind>) -> Result<Installation> {
    ensure!(
        target.is_absolute(),
        "Choose an absolute installation path."
    );
    safe_io::no_link(target)?;
    let target = target.canonicalize()?;
    ensure!(
        target.parent().is_some() && target.parent() != Some(target.as_path()),
        "A filesystem root cannot be an installation."
    );
    let kind = if target.is_file() {
        ensure!(
            cfg!(target_os = "linux"),
            "Choose the app folder or its Linux AppImage."
        );
        Kind::Appimage
    } else if target.extension().is_some_and(|e| e == "app") {
        Kind::Macos
    } else if cfg!(windows) {
        Kind::Windows
    } else {
        hint.unwrap_or(Kind::Deb)
    };
    ensure!(
        kind.platform()
            == if cfg!(windows) {
                "windows"
            } else if cfg!(target_os = "macos") {
                "macos"
            } else {
                "linux"
            },
        "This installation belongs to another operating system."
    );
    let descriptor = if kind == Kind::Macos {
        target.join("Contents/Resources/recovery-install.json")
    } else {
        target.join("recovery-install.json")
    };
    let version = if descriptor.is_file() {
        let d: Descriptor = safe_io::read_json(&descriptor, 4096)?;
        ensure!(
            d.schema == 1 && d.app_id == APP_ID && d.kind == kind,
            "The installation descriptor does not belong to this app."
        );
        Some(policy::stable(&d.version)?)
    } else if kind == Kind::Macos {
        let plist = target.join("Contents/Info.plist");
        if plist.is_file() {
            let info = plist::Value::from_file(plist)?;
            ensure!(
                info.as_dictionary()
                    .and_then(|p| p.get("CFBundleIdentifier"))
                    .and_then(|v| v.as_string())
                    == Some(APP_ID),
                "This bundle is not Open-Git-Control."
            );
            let text = info
                .as_dictionary()
                .and_then(|p| p.get("CFBundleShortVersionString"))
                .and_then(|v| v.as_string())
                .context("The app bundle has no version.")?;
            Some(policy::stable(text)?)
        } else {
            Some(asar_version(&target.join("Contents/Resources/app.asar"))?)
        }
    } else if kind == Kind::Appimage {
        let mut header = [0; 64];
        fs::File::open(&target)?.read_exact(&mut header)?;
        ensure!(
            &header[..4] == b"\x7fELF"
                && header[4] == 2
                && header[5] == 1
                && u16::from_le_bytes([header[18], header[19]]) == 62
                && &header[8..11] == b"AI\x02",
            "This is not a supported AppImage."
        );
        None
    } else {
        Some(asar_version(&target.join("resources/app.asar"))?)
    };
    let profile = profile.map(Path::to_path_buf).unwrap_or(default_profile()?);
    let profile = if profile.exists() {
        safe_io::no_link(&profile)?;
        profile.canonicalize()?
    } else {
        profile
    };
    ensure!(
        profile.is_absolute()
            && profile.parent().is_some()
            && !safe_io::overlaps(&profile, &target),
        "The data profile must be separate from the installation."
    );
    let image_identity = if kind == Kind::Appimage {
        Some(image_identity(&target)?)
    } else {
        None
    };
    Ok(Installation {
        schema: 1,
        app_id: APP_ID.into(),
        target,
        profile,
        kind,
        version,
        image_identity,
    })
}
pub fn image_identity(path: &Path) -> Result<ImageIdentity> {
    let metadata = safe_io::no_link(path)?;
    Ok(ImageIdentity {
        size: metadata.len(),
        modified_at_ms: metadata
            .modified()?
            .duration_since(std::time::UNIX_EPOCH)?
            .as_millis() as u64,
    })
}
/// A previously registered app can still be repaired after its executable and
/// archive are lost. Existing but damaged identity files are never ignored.
pub fn resolve(
    root: &Path,
    target: &Path,
    profile: Option<&Path>,
    hint: Option<Kind>,
) -> Result<Installation> {
    let saved = safe_io::read_json::<Installation>(
        &safe_io::installation_dir(root, target).join("installation.json"),
        32768,
    )
    .ok()
    .filter(|s| {
        s.schema == 1 && s.app_id == APP_ID && safe_io::key(&s.target) == safe_io::key(target)
    });
    match inspect(target, profile, hint) {
        Ok(mut app) => {
            if app.kind == Kind::Appimage {
                if let Some(saved) = saved.filter(|s| {
                    s.image_identity.is_some() && s.image_identity == app.image_identity
                }) {
                    app.version = saved.version;
                }
            }
            Ok(app)
        }
        Err(error) => {
            #[cfg(windows)]
            if let Ok(app) = crate::windows_registry::recognized(target, profile) {
                return Ok(app);
            }
            let Some(mut app) = saved else {
                return Err(error);
            };
            if app.kind.platform()
                != if cfg!(windows) {
                    "windows"
                } else if cfg!(target_os = "macos") {
                    "macos"
                } else {
                    "linux"
                }
            {
                return Err(error);
            }
            #[cfg(target_os = "macos")]
            if !target.exists() {
                if crate::exchange::previous_bundle(root, &app).is_ok() {
                    return Ok(app);
                }
            }
            if app.kind == Kind::Appimage || !safe_io::no_link(target)?.is_dir() {
                return Err(error);
            }
            let resources = if app.kind == Kind::Macos {
                target.join("Contents/Resources")
            } else {
                target.join("resources")
            };
            if resources.join("app.asar").exists()
                || target.join("recovery-install.json").exists()
                || resources.join("recovery-install.json").exists()
            {
                return Err(error);
            }
            if let Some(profile) = profile {
                app.profile = profile.to_owned();
            }
            ensure!(
                app.target.is_absolute()
                    && app.target.parent().is_some()
                    && app.profile.is_absolute()
                    && !safe_io::overlaps(&app.profile, &app.target),
                "Invalid registered installation."
            );
            ensure!(
                app.version
                    .as_ref()
                    .is_some_and(|v| policy::stable(&v.to_string()).is_ok()),
                "Unknown registered version."
            );
            Ok(app)
        }
    }
}

/// ASAR's bounded header is enough to read package.json; Electron is never executed.
pub fn asar_version(path: &Path) -> Result<Version> {
    ensure!(
        safe_io::no_link(path)?.is_file(),
        "The app archive is unavailable. Select a registered installation instead."
    );
    let mut file = fs::File::open(path)?;
    let length = file.metadata()?.len();
    let mut prefix = [0; 16];
    file.read_exact(&mut prefix)?;
    let header_size = u32::from_le_bytes(prefix[4..8].try_into()?) as u64;
    let json_size = u32::from_le_bytes(prefix[12..16].try_into()?) as usize;
    ensure!(
        header_size <= 32 * 1024 * 1024
            && json_size as u64 + 8 <= header_size
            && header_size + 8 <= length,
        "Invalid app archive header."
    );
    let mut header = vec![0; json_size];
    file.read_exact(&mut header)?;
    let value: serde_json::Value = serde_json::from_slice(&header)?;
    let package = value
        .get("files")
        .and_then(|v| v.get("package.json"))
        .context("The app archive has no package.json.")?;
    let size = package
        .get("size")
        .and_then(|v| v.as_u64())
        .context("Invalid app package size.")?;
    let offset: u64 = package
        .get("offset")
        .and_then(|v| v.as_str())
        .context("Invalid app package offset.")?
        .parse()?;
    ensure!(
        size <= 1024 * 1024
            && offset
                .checked_add(size)
                .and_then(|n| n.checked_add(header_size + 8))
                .is_some_and(|n| n <= length),
        "Invalid app package bounds."
    );
    file.seek(SeekFrom::Start(header_size + 8 + offset))?;
    let mut bytes = vec![0; size as usize];
    file.read_exact(&mut bytes)?;
    let package: serde_json::Value = serde_json::from_slice(&bytes)?;
    ensure!(
        package.get("name").and_then(|v| v.as_str()) == Some("open-git-control"),
        "The app archive belongs to another application."
    );
    policy::stable(
        package
            .get("version")
            .and_then(|v| v.as_str())
            .context("The app version is unavailable.")?,
    )
}

pub fn discover(root: &Path) -> Result<Vec<Installation>> {
    let mut found = Vec::new();
    if let Ok(entries) = fs::read_dir(root.join("installations")) {
        for entry in entries.flatten() {
            if let Ok(saved) = safe_io::read_json::<Installation>(
                &entry.path().join("installation.json"),
                32 * 1024,
            ) {
                if saved.schema != 1 || saved.app_id != APP_ID {
                    continue;
                }
                if let Ok(verified) =
                    resolve(root, &saved.target, Some(&saved.profile), Some(saved.kind))
                {
                    if !found
                        .iter()
                        .any(|i: &Installation| i.target == verified.target)
                    {
                        found.push(verified);
                    }
                }
            }
        }
    }
    let mut candidates = Vec::new();
    #[cfg(windows)]
    {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            candidates.push(PathBuf::from(local).join("Programs/Open-Git-Control"));
        }
        candidates.extend(
            crate::windows_registry::records()
                .into_iter()
                .map(|r| r.target),
        );
    }
    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/Applications/Open-Git-Control.app"));
        if let Some(home) = directories::BaseDirs::new() {
            candidates.push(home.home_dir().join("Applications/Open-Git-Control.app"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        candidates.push(PathBuf::from("/opt/Open-Git-Control"));
    }
    for path in candidates {
        if let Ok(i) = resolve(root, &path, None, None) {
            if !found.iter().any(|f| f.target == i.target) {
                found.push(i);
            }
        }
    }
    Ok(found)
}

pub fn register(root: &Path, installation: &Installation) -> Result<()> {
    safe_io::atomic_json(
        &safe_io::installation_dir(root, &installation.target).join("installation.json"),
        installation,
    )
}
