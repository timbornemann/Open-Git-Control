//! Recovery of the narrow interruption window during a macOS bundle exchange.
#![cfg(target_os = "macos")]
use crate::{
    installation, job,
    model::{Control, Installation, Progress, Report},
    platform, safe_io,
};
use anyhow::{ensure, Context, Result};
use semver::Version;
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Deserialize)]
struct Exchange {
    schema: u32,
    target: PathBuf,
    incoming: PathBuf,
    previous: PathBuf,
    version: Version,
}
fn owned_sibling(target: &Path, path: &Path, prefix: &str) -> bool {
    path.parent() == target.parent()
        && path
            .file_name()
            .and_then(|v| v.to_str())
            .and_then(|name| name.strip_prefix(prefix))
            .and_then(|v| v.strip_suffix(".app"))
            .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
}
pub fn previous_bundle(root: &Path, app: &Installation) -> Result<Installation> {
    let journal =
        job::previous(root, app).context("No interrupted bundle exchange is recorded.")?;
    ensure!(
        journal.phase != "complete",
        "The last installation was completed."
    );
    let file = safe_io::installation_dir(root, &app.target)
        .join("operations")
        .join(&journal.id)
        .join("bundle-exchange.json");
    safe_io::within(root, &file)?;
    let exchange: Exchange = safe_io::read_json(&file, 32768)?;
    ensure!(
        exchange.schema == 1
            && exchange.target == app.target
            && exchange.version == journal.to_version
            && owned_sibling(
                &app.target,
                &exchange.previous,
                ".Open-Git-Control-previous-"
            )
            && owned_sibling(
                &app.target,
                &exchange.incoming,
                ".Open-Git-Control-incoming-"
            ),
        "The saved bundle exchange is invalid and was left untouched."
    );
    let previous = installation::inspect(&exchange.previous, Some(&app.profile), None)?;
    ensure!(
        previous.version == journal.from_version,
        "The saved previous bundle has another version."
    );
    job::verify_runtime(&previous)?;
    Ok(previous)
}
pub fn restore_interrupted(
    root: &Path,
    app: &Installation,
    control: &Control,
    report: &Report,
) -> Result<()> {
    if app.target.exists() {
        return Ok(());
    }
    let previous = previous_bundle(root, app)?;
    control.check()?;
    report(Progress::phase("install", "Restoring the preserved app bundle after an interrupted installation. Complete the macOS permission prompt."));
    let script = "on run argv\nset c to \"/bin/test ! -e \" & quoted form of (item 2 of argv) & \" && /bin/mv \" & quoted form of (item 1 of argv) & \" \" & quoted form of (item 2 of argv)\ndo shell script c with administrator privileges\nend run";
    platform::wait(
        platform::command("/usr/bin/osascript")
            .args(["-e", script, "--"])
            .arg(previous.target)
            .arg(&app.target),
        report,
    )
}
