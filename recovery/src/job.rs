use crate::{
    catalog, download, installation, lease,
    model::{Action, Control, Installation, Kind, Progress, Report},
    platform, policy, profile, safe_io, shortcuts,
};
use anyhow::{ensure, Context, Result};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Journal {
    pub schema: u32,
    pub id: String,
    pub target: PathBuf,
    pub profile: PathBuf,
    pub from_version: Option<Version>,
    pub to_version: Version,
    pub action: String,
    pub phase: String,
    pub updated_at: u64,
    pub artifact: Option<PathBuf>,
    pub backup: Option<PathBuf>,
    pub error: Option<String>,
}
impl Journal {
    fn save(&mut self, operation: &Path, phase: &str) -> Result<()> {
        self.phase = phase.into();
        self.updated_at = lease::now();
        safe_io::atomic_json(&operation.join("operation.json"), self)
    }
}
pub fn previous(root: &Path, app: &Installation) -> Option<Journal> {
    let directory = safe_io::installation_dir(root, &app.target).join("operations");
    fs::read_dir(directory)
        .ok()?
        .flatten()
        .filter_map(|e| {
            safe_io::read_json::<Journal>(&e.path().join("operation.json"), 32 * 1024).ok()
        })
        .filter(|j| {
            j.schema == 1
                && safe_io::key(&j.target) == safe_io::key(&app.target)
                && j.profile == app.profile
                && uuid::Uuid::parse_str(&j.id).is_ok()
        })
        .max_by_key(|j| j.updated_at)
}
pub fn run(
    root: &Path,
    app: &Installation,
    action: Action,
    version: &Version,
    control: &Control,
    report: &Report,
) -> Result<Installation> {
    action.validate(app.version.as_ref(), version)?;
    let _lease = lease::Lease::acquire(root, &app.target)?;
    // Preserve the verified identity before an installer can replace or damage
    // its on-disk metadata. A later retry must not require a working app archive.
    installation::register(root, app)?;
    #[cfg(target_os = "macos")]
    crate::exchange::restore_interrupted(root, app, control, report)?;
    let id = uuid::Uuid::new_v4().to_string();
    let operation = safe_io::installation_dir(root, &app.target)
        .join("operations")
        .join(&id);
    safe_io::private_dir(&operation)?;
    let mut journal = Journal {
        schema: 1,
        id,
        target: app.target.clone(),
        profile: app.profile.clone(),
        from_version: app.version.clone(),
        to_version: version.clone(),
        action: format!("{action:?}"),
        phase: "prepare".into(),
        updated_at: lease::now(),
        artifact: None,
        backup: None,
        error: None,
    };
    journal.save(&operation, "prepare")?;
    let result = perform(
        root,
        app,
        action,
        version,
        control,
        report,
        &operation,
        &mut journal,
    );
    if let Err(error) = &result {
        journal.error = Some(format!("{error:#}"));
        let _ = journal.save(
            &operation,
            if error.to_string().contains("Operation cancelled.") {
                "cancelled"
            } else {
                "failed"
            },
        );
    }
    result
}
#[allow(clippy::too_many_arguments)]
fn perform(
    root: &Path,
    app: &Installation,
    action: Action,
    version: &Version,
    control: &Control,
    report: &Report,
    operation: &Path,
    journal: &mut Journal,
) -> Result<Installation> {
    report(Progress::phase(
        "prepare",
        "Checking the official release and installation.",
    ));
    let current = installation::resolve(root, &app.target, Some(&app.profile), Some(app.kind))?;
    crate::destination::protect(app)?;
    crate::processes::assert_installer_scope(app)?;
    ensure!(
        current.version.is_none() || current.version == app.version,
        "The installed version changed. Refresh the installation before continuing."
    );
    let network = catalog::client()?;
    let release = catalog::release(&network, version, control)?;
    let manifest = catalog::manifest(&network, &release, app.kind.platform(), control)?;
    let expected = policy::name(version, app.kind.suffix());
    let artifact = manifest
        .files
        .iter()
        .find(|f| f.url == expected)
        .context("The release has no installer for this installation.")?;
    journal.save(operation, "download")?;
    let downloads = safe_io::installation_dir(root, &app.target)
        .join("downloads")
        .join(version.to_string());
    let file = download::fetch(&network, version, artifact, &downloads, control, report)?;
    journal.artifact = Some(file.clone());
    journal.save(operation, "verified")?;
    // A complete, checked package exists before any running app or profile is changed.
    crate::processes::close(app, control, report)?;
    journal.save(operation, "backup")?;
    report(Progress::phase(
        "backup",
        "Backing up app data; repositories are not modified.",
    ));
    journal.backup = profile::backup(
        &app.profile,
        &operation.join("profile-backup"),
        control,
        report,
    )?;
    if action == Action::Downgrade || app.version.is_none() {
        profile::pause_automatic_updates(&app.profile)?;
        journal.save(operation, "updates-paused")?;
    }
    control.check()?;
    download::verify(&file, artifact, control)?;
    journal.save(operation, "install")?;
    report(Progress::phase(
        "install",
        "Installing the verified package. Complete the operating-system prompts.",
    ));
    platform::install(app, &file, version, operation, control, report)?;
    journal.save(operation, "verify-installation")?;
    report(Progress::phase(
        "verify-installation",
        "Verifying the installed version and program files.",
    ));
    let mut installed = if app.kind == Kind::Appimage {
        download::verify(&app.target, artifact, &Control::default())?;
        installation::inspect(&app.target, Some(&app.profile), Some(app.kind))?
    } else {
        let result = installation::inspect(&app.target, Some(&app.profile), Some(app.kind))?;
        ensure!(
            result.version.as_ref() == Some(version),
            "The installed version differs from the selected version."
        );
        verify_runtime(&result)?;
        result
    };
    installed.version = Some(version.clone());
    installation::register(root, &installed)?;
    // Retain this helper even when the selected old version does not contain one.
    let helper = shortcuts::stage(root)?;
    if let Err(error) = shortcuts::register(root, &installed, &helper) {
        report(Progress::phase(
            "shortcut-warning",
            format!(
                "The app was installed, but its recovery shortcut could not be refreshed: {error}"
            ),
        ));
    }
    journal.save(operation, "complete")?;
    report(Progress::phase(
        "complete",
        "Installation completed and verified.",
    ));
    Ok(installed)
}
pub fn verify_runtime(app: &Installation) -> Result<()> {
    let mut required = vec![app.kind.main_executable(&app.target)];
    match app.kind {
        Kind::Windows => {
            for file in [
                "icudtl.dat",
                "libEGL.dll",
                "libGLESv2.dll",
                "resources.pak",
                "resources/app.asar",
            ] {
                required.push(app.target.join(file));
            }
        }
        Kind::Deb => {
            required.push(app.target.join("icudtl.dat"));
            required.push(app.target.join("resources/app.asar"));
        }
        Kind::Macos => {
            required.push(app.target.join("Contents/Resources/app.asar"));
            required.push(app.target.join(
                "Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/icudtl.dat",
            ));
        }
        Kind::Appimage => {}
    }
    for file in required {
        let real = file
            .canonicalize()
            .with_context(|| format!("A required program file is missing: {}", file.display()))?;
        ensure!(
            real.starts_with(&app.target) && fs::metadata(real)?.len() > 0,
            "A required program file is missing or redirected: {}",
            file.display()
        );
    }
    Ok(())
}
