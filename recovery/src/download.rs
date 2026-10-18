use crate::catalog::Network;
use crate::{
    catalog,
    model::{Control, Progress, Report},
    policy::{self, File},
    safe_io,
};
use anyhow::{ensure, Result};
use semver::Version;
use sha2::{Digest, Sha512};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::Instant,
};

pub fn fetch(
    client: &Network,
    version: &Version,
    file: &File,
    directory: &Path,
    control: &Control,
    report: &Report,
) -> Result<PathBuf> {
    safe_io::private_dir(directory)?;
    safe_io::available(directory, file.size.saturating_mul(3))?;
    ensure!(
        Path::new(&file.url).file_name().and_then(|p| p.to_str()) == Some(&file.url),
        "Unsafe artifact name."
    );
    let destination = directory.join(&file.url);
    if destination.try_exists()? && verify(&destination, file, control).is_ok() {
        return Ok(destination);
    }
    let mut response =
        catalog::asset_response(client, policy::asset_url(version, &file.url)?, control)?;
    ensure!(
        response.content_length().is_none_or(|n| n == file.size),
        "Download size differs from release metadata."
    );
    let mut temp = tempfile::NamedTempFile::new_in(directory)?;
    let mut digest = Sha512::new();
    let mut bytes = 0u64;
    let mut last = Instant::now();
    while let Some(chunk) = client.chunk(&mut response, control)? {
        bytes = bytes
            .checked_add(chunk.len() as u64)
            .ok_or_else(|| anyhow::anyhow!("Download is too large."))?;
        ensure!(bytes <= file.size, "Download exceeds its verified size.");
        digest.update(&chunk);
        temp.write_all(&chunk)?;
        if last.elapsed().as_millis() >= 100 {
            report(Progress {
                phase: "download",
                completed: bytes,
                total: file.size,
                message: file.url.clone(),
            });
            last = Instant::now();
        }
    }
    ensure!(
        bytes == file.size && digest.finalize().as_slice() == policy::digest(&file.sha512)?,
        "Download checksum or length does not match the official release."
    );
    control.check()?;
    temp.as_file().sync_all()?;
    temp.persist(&destination).map_err(|e| e.error)?;
    report(Progress {
        phase: "verify",
        completed: bytes,
        total: file.size,
        message: file.url.clone(),
    });
    verify(&destination, file, control)?;
    Ok(destination)
}
pub fn verify(path: &Path, file: &File, control: &Control) -> Result<()> {
    ensure!(
        safe_io::no_link(path)?.is_file() && fs::metadata(path)?.len() == file.size,
        "Installer size does not match the release."
    );
    let mut input = fs::File::open(path)?;
    let mut buffer = [0; 64 * 1024];
    let mut hash = Sha512::new();
    loop {
        control.check()?;
        let n = input.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    ensure!(
        hash.finalize().as_slice() == policy::digest(&file.sha512)?,
        "Installer checksum does not match the release."
    );
    Ok(())
}
