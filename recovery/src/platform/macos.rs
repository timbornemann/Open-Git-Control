use crate::{
    installation,
    model::{Control, Installation, Progress, Report},
    safe_io,
};
use anyhow::{ensure, Context, Result};
use semver::Version;
use std::path::Path;

pub fn install(
    target: &Installation,
    artifact: &Path,
    version: &Version,
    operation: &Path,
    control: &Control,
    report: &Report,
) -> Result<()> {
    let extracted = operation.join("extracted");
    safe_io::private_dir(&extracted)?;
    let candidate = crate::archive::bundle(artifact, &extracted, control)?;
    crate::job::verify_runtime(&installation::inspect(
        &candidate,
        Some(&target.profile),
        None,
    )?)?;
    ensure!(
        installation::inspect(&candidate, Some(&target.profile), None)?
            .version
            .as_ref()
            == Some(version),
        "The downloaded bundle does not match the requested app and version."
    );
    let parent = target
        .target
        .parent()
        .context("Invalid app bundle location.")?;
    let incoming = parent.join(format!(
        ".Open-Git-Control-incoming-{}.app",
        uuid::Uuid::new_v4()
    ));
    let prior = parent.join(format!(
        ".Open-Git-Control-previous-{}.app",
        uuid::Uuid::new_v4()
    ));
    safe_io::atomic_json(
        &operation.join("bundle-exchange.json"),
        &serde_json::json!({"schema": 1, "incoming": incoming, "previous": prior, "target": target.target, "version": version}),
    )?;
    report(Progress::phase(
        "install",
        "Replacing the application bundle. macOS may request your permission.",
    ));
    // User-owned bundles can be exchanged without an elevation prompt. A
    // system-owned destination uses the fixed administrator script below.
    use std::os::unix::ffi::OsStrExt;
    let parent_name = std::ffi::CString::new(parent.as_os_str().as_bytes())?;
    if unsafe { libc::access(parent_name.as_ptr(), libc::W_OK) } == 0 {
        crate::platform::wait(
            crate::platform::command("/usr/bin/ditto")
                .arg(&candidate)
                .arg(&incoming),
            report,
        )?;
        control.check()?;
        std::fs::rename(&target.target, &prior)?;
        if let Err(error) = std::fs::rename(&incoming, &target.target) {
            std::fs::rename(&prior, &target.target).context("Bundle exchange failed; restoring the previous bundle also failed. Retry using the recovery journal.")?;
            return Err(error.into());
        }
        ensure!(
            installation::inspect(&target.target, Some(&target.profile), None)?
                .version
                .as_ref()
                == Some(version),
            "The installed macOS bundle version could not be verified."
        );
        return Ok(());
    }
    // ditto preserves framework symlinks and executable modes from the verified ZIP.
    // Pass paths as arguments to the fixed script, rather than interpolating them into AppleScript.
    let script = "on run argv\nset incomingPath to item 1 of argv\nset currentPath to item 2 of argv\nset previousPath to item 3 of argv\nset sourcePath to item 4 of argv\nset c to \"/usr/bin/ditto \" & quoted form of sourcePath & \" \" & quoted form of incomingPath & \" && /bin/mv \" & quoted form of currentPath & \" \" & quoted form of previousPath & \" && (/bin/mv \" & quoted form of incomingPath & \" \" & quoted form of currentPath & \" || { /bin/mv \" & quoted form of previousPath & \" \" & quoted form of currentPath & \"; exit 1; })\"\ndo shell script c with administrator privileges\nend run";
    control.check()?;
    crate::platform::wait(
        crate::platform::command("/usr/bin/osascript")
            .args(["-e", script, "--"])
            .arg(&incoming)
            .arg(&target.target)
            .arg(&prior)
            .arg(&candidate),
        report,
    )?;
    ensure!(
        installation::inspect(&target.target, Some(&target.profile), None)?
            .version
            .as_ref()
            == Some(version),
        "The installed macOS bundle version could not be verified."
    );
    safe_io::atomic_json(
        &operation.join("bundle-backup.json"),
        &serde_json::json!({"previousBundle": prior, "target": target.target}),
    )?;
    Ok(())
}
