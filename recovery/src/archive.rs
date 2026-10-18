//! Extract verified macOS archives without writing through archive-created symlinks.
use crate::{model::Control, safe_io};
use anyhow::{ensure, Context, Result};
use std::{
    collections::BTreeSet,
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

pub fn bundle(archive: &Path, destination: &Path, control: &Control) -> Result<PathBuf> {
    ensure!(
        fs::read_dir(destination)?.next().is_none(),
        "The extraction directory must be empty."
    );
    let mut zip = zip::ZipArchive::new(fs::File::open(archive)?)?;
    ensure!(
        zip.len() <= 100_000,
        "The archive contains too many entries."
    );
    let mut seen = BTreeSet::new();
    let mut total = 0u64;
    for index in 0..zip.len() {
        control.check()?;
        let entry = zip.by_index(index)?;
        let relative = path(entry.name())?;
        ensure!(
            seen.insert(relative),
            "The archive contains duplicate paths."
        );
        total = total
            .checked_add(entry.size())
            .context("Oversized app archive.")?;
        ensure!(total <= 4 * 1024 * 1024 * 1024, "Oversized app archive.");
    }
    safe_io::available(destination, total.saturating_mul(2))?;
    let mut links = Vec::new();
    for index in 0..zip.len() {
        control.check()?;
        let mut entry = zip.by_index(index)?;
        let relative = path(entry.name())?;
        if relative.starts_with("__MACOSX") {
            continue;
        }
        let output = destination.join(&relative);
        safe_io::within(destination, &output)?;
        let mode = entry.unix_mode().unwrap_or(0o644);
        if mode & 0o170000 == 0o120000 {
            let mut target = String::new();
            entry.by_ref().take(4097).read_to_string(&mut target)?;
            symlink_target(&relative, &target)?;
            links.push((output, target));
            continue;
        }
        ensure!(
            [0, 0o100000, 0o040000].contains(&(mode & 0o170000)),
            "Unsupported archive entry type."
        );
        if entry.is_dir() {
            safe_io::private_dir(&output)?;
            continue;
        }
        safe_io::private_dir(output.parent().context("Invalid archive destination.")?)?;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output)?;
        let mut written = 0u64;
        let mut buffer = [0; 65536];
        loop {
            control.check()?;
            let size = entry.read(&mut buffer)?;
            if size == 0 {
                break;
            }
            written += size as u64;
            ensure!(
                written <= entry.size(),
                "Archive entry exceeds its declared size."
            );
            file.write_all(&buffer[..size])?;
        }
        ensure!(written == entry.size(), "Truncated archive entry.");
        file.sync_all()?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&output, fs::Permissions::from_mode(mode & 0o777))?;
        }
    }
    // No further file writes occur after symlinks are created. Every resolved link
    // must remain inside the one app bundle, including chains and directory links.
    #[cfg(unix)]
    for (output, target) in &links {
        control.check()?;
        safe_io::within(destination, output)?;
        safe_io::private_dir(output.parent().context("Invalid link parent.")?)?;
        std::os::unix::fs::symlink(target, output)?;
    }
    #[cfg(not(unix))]
    ensure!(
        links.is_empty(),
        "macOS bundle extraction requires a Unix filesystem."
    );
    let bundle = destination.join("Open-Git-Control.app").canonicalize()?;
    for (link, _) in links {
        ensure!(
            link.canonicalize().is_ok_and(|p| p.starts_with(&bundle)),
            "An app symlink leaves the bundle or cannot be resolved."
        );
    }
    Ok(bundle)
}
pub fn path(name: &str) -> Result<PathBuf> {
    ensure!(
        !name.contains(['\\', '\0']) && !name.starts_with('/'),
        "Unsafe archive path."
    );
    let path = PathBuf::from(name.trim_end_matches('/'));
    ensure!(
        path.components().all(|c| matches!(c, Component::Normal(_)))
            && (path.starts_with("Open-Git-Control.app") || path.starts_with("__MACOSX")),
        "The archive contains an unexpected application or unsafe path."
    );
    Ok(path)
}
pub fn symlink_target(relative: &Path, target: &str) -> Result<()> {
    ensure!(
        target.len() <= 4096
            && !target.contains(['\\', '\0'])
            && !Path::new(target).is_absolute()
            && !target.is_empty(),
        "Unsafe bundle symlink."
    );
    let mut depth = relative
        .parent()
        .context("Invalid link path.")?
        .components()
        .count() as i32;
    for part in Path::new(target).components() {
        match part {
            Component::ParentDir => depth -= 1,
            Component::Normal(_) => depth += 1,
            Component::CurDir => {}
            _ => anyhow::bail!("Unsafe bundle symlink."),
        }
        ensure!(depth >= 1, "A bundle symlink leaves the application.");
    }
    Ok(())
}
