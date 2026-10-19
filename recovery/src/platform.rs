#[cfg(any(windows, target_os = "macos"))]
use crate::model::Kind;
use crate::{
    model::{Control, Installation, Progress, Report},
    safe_io,
};
use anyhow::{ensure, Result};
use semver::Version;
use std::{
    path::Path,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

#[cfg(target_os = "linux")]
#[path = "platform/linux.rs"]
mod linux;
#[cfg(target_os = "macos")]
#[path = "platform/macos.rs"]
mod macos;
#[cfg(windows)]
#[path = "platform/windows.rs"]
mod windows;

pub fn command(executable: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut command = Command::new(executable);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    command
}
/// Cancellation is safe before launch. Do not kill an installer halfway through.
pub fn wait(command: &mut Command, report: &Report) -> Result<()> {
    let mut child = command.spawn()?;
    if let Err(error) = crate::lease::track_installer(child.id()) {
        report(Progress::phase("install",format!("The system installer is running, but its process record could not be updated: {error}")));
    }
    let began = Instant::now();
    let mut warned = false;
    loop {
        if let Some(status) = child.try_wait()? {
            ensure!(status.success(), "The system installer did not complete successfully ({status}). Your backup and recovery helper remain available; retry the operation.");
            return Ok(());
        }
        if began.elapsed() >= Duration::from_secs(20 * 60) && !warned {
            report(Progress::phase("install-wait", "The system installer is still running. Complete any operating-system prompts. Do not interrupt an installation already in progress."));
            warned = true;
        }
        thread::sleep(Duration::from_millis(300));
    }
}
pub fn install(
    installation: &Installation,
    artifact: &Path,
    version: &Version,
    _operation: &Path,
    control: &Control,
    report: &Report,
) -> Result<()> {
    control.check()?;
    safe_io::no_link(artifact)?;
    #[cfg(windows)]
    {
        ensure!(
            installation.kind == Kind::Windows,
            "Unsupported installation type."
        );
        windows::install(installation, artifact, version, report)
    }
    #[cfg(target_os = "macos")]
    {
        ensure!(
            installation.kind == Kind::Macos,
            "Unsupported installation type."
        );
        macos::install(installation, artifact, version, _operation, control, report)
    }
    #[cfg(target_os = "linux")]
    {
        linux::install(installation, artifact, version, _operation, control, report)
    }
}
pub fn launch(installation: &Installation) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        command("/usr/bin/open").arg(&installation.target).spawn()?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let executable = installation.kind.main_executable(&installation.target);
        safe_io::no_link(&executable)?;
        command(executable)
            .arg(format!(
                "--user-data-dir={}",
                installation.profile.display()
            ))
            .spawn()?;
    }
    Ok(())
}
