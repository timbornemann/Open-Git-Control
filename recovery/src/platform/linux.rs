use crate::{
    installation,
    model::{Control, Installation, Kind, Progress, Report},
    platform, safe_io,
};
use anyhow::{ensure, Context, Result};
use semver::Version;
use std::{fs, io::Write, os::unix::fs::PermissionsExt, path::Path};

pub fn install(
    target: &Installation,
    artifact: &Path,
    version: &Version,
    operation: &Path,
    control: &Control,
    report: &Report,
) -> Result<()> {
    if target.kind == Kind::Appimage {
        replace_appimage(&target.target, artifact, operation, control)?;
        report(Progress::phase(
            "installed",
            "The verified AppImage was installed.",
        ));
        return Ok(());
    }
    ensure!(target.kind == Kind::Deb, "Unsupported Linux installation.");
    ensure!(target.target == Path::new("/opt/Open-Git-Control").canonicalize()?, "DEB recovery can only replace the system package at /opt/Open-Git-Control. Choose that installation or use an AppImage.");
    let info = platform::command("/usr/bin/dpkg-deb")
        .args(["--field"])
        .arg(artifact)
        .args(["Package", "Version", "Architecture"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()?;
    ensure!(
        info.status.success(),
        "Cannot inspect the verified Debian package."
    );
    let info = String::from_utf8(info.stdout)?;
    ensure!(
        info.lines().any(|v| v == "Package: open-git-control")
            && info.lines().any(|v| v == format!("Version: {version}"))
            && info.lines().any(|v| v == "Architecture: amd64"),
        "The verified Debian package does not match this application, version and architecture."
    );
    let root_user = unsafe { libc::geteuid() } == 0;
    ensure!((root_user || Path::new("/usr/bin/pkexec").is_file()) && Path::new("/usr/bin/apt-get").is_file(), "The system package installer (pkexec and apt-get) is unavailable. Install the verified .deb with your distribution's package manager; its location is recorded in the operation log.");
    report(Progress::phase(
        "install",
        "Approve the system package installation. Other applications are not removed.",
    ));
    let mut installer = platform::command(if root_user {
        "/usr/bin/apt-get"
    } else {
        "/usr/bin/pkexec"
    });
    if !root_user {
        installer.arg("/usr/bin/apt-get");
    }
    platform::wait(
        installer
            .args([
                "-y",
                "--reinstall",
                "--allow-downgrades",
                "--no-remove",
                "install",
                "--",
            ])
            .arg(artifact),
        report,
    )?;
    let installed = installation::inspect(&target.target, Some(&target.profile), Some(Kind::Deb))?;
    ensure!(
        installed.version.as_ref() == Some(version),
        "The installed Debian package version could not be verified."
    );
    Ok(())
}
pub fn replace_appimage(
    target: &Path,
    artifact: &Path,
    operation: &Path,
    control: &Control,
) -> Result<()> {
    let parent = target.parent().context("Invalid AppImage path.")?;
    safe_io::no_link(target)?;
    safe_io::no_link(parent)?;
    let mut replacement = tempfile::NamedTempFile::new_in(parent)?;
    let mut input = fs::File::open(artifact)?;
    std::io::copy(&mut input, &mut replacement)?;
    replacement.flush()?;
    replacement.as_file().sync_all()?;
    fs::set_permissions(replacement.path(), fs::Permissions::from_mode(0o755))?;
    control.check()?;
    let prior = operation.join("previous.AppImage");
    fs::copy(target, &prior)?;
    replacement.persist(target).map_err(|e| e.error)?;
    Ok(())
}
