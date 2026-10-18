use crate::{
    model::{Control, Progress, Report},
    safe_io,
};
use anyhow::{ensure, Context, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

const EXCLUDED: &[&str] = &[
    "Cache",
    "Code Cache",
    "development-code-cache",
    "GPUCache",
    "DawnCache",
    "DawnGraphiteCache",
    "DawnWebGPUCache",
    "preview-cache-v1",
    "repository-analytics",
    "hosting-catalogs",
    "browser-cache-maintenance",
    "Crashpad",
    "Crash Reports",
    "SingletonLock",
    "SingletonCookie",
    "SingletonSocket",
    "lockfile",
    "commit-stats-v1.jsonl",
];
#[derive(Serialize)]
struct Entry {
    path: String,
    bytes: u64,
    sha256: String,
}
pub fn backup(
    profile: &Path,
    destination: &Path,
    control: &Control,
    report: &Report,
) -> Result<Option<PathBuf>> {
    if !profile.try_exists()? {
        return Ok(None);
    }
    ensure!(
        safe_io::no_link(profile)?.is_dir(),
        "The app profile is not a regular directory."
    );
    ensure!(
        !safe_io::overlaps(destination, profile),
        "Backup and app profile must be separate."
    );
    safe_io::private_dir(destination)?;
    let mut pending = vec![profile.to_owned()];
    let mut files = Vec::new();
    let mut bytes = 0u64;
    while let Some(directory) = pending.pop() {
        control.check()?;
        for entry in fs::read_dir(directory)? {
            let path = entry?.path();
            let relative = path.strip_prefix(profile)?;
            if relative
                .components()
                .next()
                .is_some_and(|c| EXCLUDED.iter().any(|name| c.as_os_str() == *name))
            {
                continue;
            }
            let metadata = safe_io::no_link(&path)?;
            if metadata.is_dir() {
                pending.push(path);
            } else if metadata.is_file() {
                bytes = bytes
                    .checked_add(metadata.len())
                    .ok_or_else(|| anyhow::anyhow!("Profile is too large."))?;
                files.push(path);
            }
        }
    }
    safe_io::available(destination, bytes.saturating_add(16 * 1024 * 1024))?;
    let mut entries = Vec::new();
    let mut done = 0;
    for path in files {
        control.check()?;
        let relative = path.strip_prefix(profile)?;
        let to = destination.join("data").join(relative);
        safe_io::within(destination, &to)?;
        safe_io::private_dir(to.parent().unwrap())?;
        let mut input = fs::File::open(&path)?;
        let mut output = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&to)?;
        let mut hash = Sha256::new();
        let mut size = 0;
        let mut buffer = [0; 64 * 1024];
        loop {
            control.check()?;
            let count = input.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            output.write_all(&buffer[..count])?;
            hash.update(&buffer[..count]);
            size += count as u64;
        }
        output.sync_all()?;
        done += size;
        entries.push(Entry {
            path: relative.to_string_lossy().into_owned(),
            bytes: size,
            sha256: hex::encode(hash.finalize()),
        });
        report(Progress {
            phase: "backup",
            completed: done,
            total: bytes,
            message: "App data backup".into(),
        });
    }
    safe_io::atomic_json(
        &destination.join("backup.json"),
        &serde_json::json!({ "schema": 1, "profile": profile, "completed": true, "files": entries }),
    )?;
    Ok(Some(destination.to_owned()))
}
pub fn pause_automatic_updates(profile: &Path) -> Result<()> {
    let settings = profile.join("settings.json");
    let mut value: serde_json::Value = if settings.try_exists()? {
        safe_io::read_json(&settings, 4 * 1024 * 1024).context("Settings could not be read and were not overwritten. Automatic downloads cannot be paused safely; the original data and its completed backup are retained.")?
    } else {
        serde_json::json!({})
    };
    let object = value.as_object_mut().ok_or_else(|| anyhow::anyhow!("Settings are damaged. They were not overwritten; automatic updates could not be paused."))?;
    object.insert("autoUpdateEnabled".into(), false.into());
    safe_io::atomic_json(&settings, &value)
}
