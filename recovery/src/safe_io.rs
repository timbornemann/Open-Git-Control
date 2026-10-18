use anyhow::{ensure, Context, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

pub fn root() -> Result<PathBuf> {
    let base = directories::BaseDirs::new()
        .context("Cannot locate the user's application data directory.")?
        .config_dir()
        .to_owned();
    fs::create_dir_all(&base)?;
    Ok(base.canonicalize()?.join("Open-Git-Control-Recovery"))
}
pub fn normalized(target: &Path, windows: bool) -> String {
    let value = target.to_string_lossy();
    if windows {
        value
            .trim_start_matches(r"\\?\")
            .replace('\\', "/")
            .trim_end_matches('/')
            .to_lowercase()
    } else {
        value.trim_end_matches('/').to_owned()
    }
}
pub fn key(target: &Path) -> String {
    hex::encode(Sha256::digest(normalized(target, cfg!(windows)).as_bytes()))
}
pub fn installation_dir(root: &Path, target: &Path) -> PathBuf {
    root.join("installations").join(key(target))
}
pub fn overlaps(left: &Path, right: &Path) -> bool {
    let left = normalized(left, cfg!(windows));
    let right = normalized(right, cfg!(windows));
    left == right || left.starts_with(&(right.clone() + "/")) || right.starts_with(&(left + "/"))
}
pub fn no_link(path: &Path) -> Result<fs::Metadata> {
    let metadata =
        fs::symlink_metadata(path).with_context(|| format!("Cannot inspect {}", path.display()))?;
    ensure!(
        !metadata.file_type().is_symlink(),
        "Redirected filesystem paths are not supported: {}",
        path.display()
    );
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        ensure!(
            metadata.file_attributes() & 0x400 == 0,
            "Reparse points are not supported: {}",
            path.display()
        );
    }
    Ok(metadata)
}
pub fn private_dir(path: &Path) -> Result<()> {
    // Reject redirected managed ancestors as well as the final directory. The
    // OS configuration anchor and chosen installation/profile are canonicalized
    // before entering this layer (important for macOS /var -> /private/var).
    for ancestor in path.ancestors() {
        if fs::symlink_metadata(ancestor).is_ok() {
            no_link(ancestor)?;
        }
    }
    let mut missing = Vec::new();
    let mut current = path;
    while !current.try_exists()? {
        missing.push(current.to_owned());
        current = current.parent().context("Invalid private directory.")?;
    }
    ensure!(no_link(current)?.is_dir(), "Expected a directory.");
    for part in missing.iter().rev() {
        fs::create_dir(part)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(part, fs::Permissions::from_mode(0o700))?;
        }
    }
    no_link(path)?;
    Ok(())
}
pub fn within(root: &Path, path: &Path) -> Result<()> {
    ensure!(
        path.is_absolute() && root.is_absolute(),
        "Absolute paths are required."
    );
    ensure!(
        !path
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir)),
        "Unsafe relative path."
    );
    ensure!(
        path.starts_with(root) && path != root,
        "Path escapes the managed recovery directory."
    );
    let mut at = path;
    while at.starts_with(root) {
        if at.try_exists()? {
            no_link(at)?;
        }
        if at == root {
            break;
        }
        at = at.parent().context("Invalid path.")?;
    }
    Ok(())
}
pub fn atomic_json(path: &Path, value: &impl Serialize) -> Result<()> {
    let parent = path.parent().context("Invalid JSON destination.")?;
    private_dir(parent)?;
    if path.try_exists()? {
        ensure!(no_link(path)?.is_file(), "Expected a regular JSON file.");
    }
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    serde_json::to_writer_pretty(&mut file, value)?;
    file.write_all(b"\n")?;
    file.as_file().sync_all()?;
    file.persist(path).map_err(|e| e.error)?;
    Ok(())
}
pub fn read_json<T: serde::de::DeserializeOwned>(path: &Path, max: u64) -> Result<T> {
    ensure!(
        no_link(path)?.is_file() && fs::metadata(path)?.len() <= max,
        "Invalid or oversized JSON file."
    );
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(max + 1)
        .read_to_end(&mut bytes)?;
    ensure!(bytes.len() as u64 <= max, "JSON file is too large.");
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes);
    Ok(serde_json::from_slice(bytes)?)
}
pub fn available(path: &Path, required: u64) -> Result<()> {
    ensure!(
        fs2::available_space(path)? >= required,
        "Not enough free disk space for a safe recovery. Free some space and try again."
    );
    Ok(())
}
