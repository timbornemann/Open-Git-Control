//! Real official-package installations, restricted to disposable CI runners.
//! These tests are ignored by default and cannot be enabled accidentally by
//! running the ordinary native or application test suites on a developer PC.
use ogc_recovery::{
    archive, catalog, download, installation, job,
    model::{Action, Control, Installation, Kind, APP_ID},
    platform, policy, safe_io,
};
use std::{fs, path::Path};

fn ci_only() {
    assert_eq!(
        std::env::var("GITHUB_ACTIONS").as_deref(),
        Ok("true"),
        "Installation tests require a disposable GitHub Actions runner."
    );
    assert_eq!(std::env::var("CI").as_deref(), Ok("true"));
    assert_eq!(std::env::var("OGC_RECOVERY_E2E").as_deref(), Ok("1"));
}
fn package(
    root: &Path,
    target: &Path,
    kind: Kind,
    version: &semver::Version,
) -> std::path::PathBuf {
    let control = Control::default();
    let client = catalog::client().unwrap();
    let release = catalog::release(&client, version, &control).unwrap();
    let manifest = catalog::manifest(&client, &release, kind.platform(), &control).unwrap();
    let expected = policy::name(version, kind.suffix());
    let file = manifest.files.iter().find(|f| f.url == expected).unwrap();
    download::fetch(
        &client,
        version,
        file,
        &safe_io::installation_dir(root, target)
            .join("downloads")
            .join(version.to_string()),
        &control,
        &|p| println!("{} {}/{}", p.phase, p.completed, p.total),
    )
    .unwrap()
}
fn exercise(kind: Kind) {
    ci_only();
    let fixture = tempfile::tempdir().unwrap();
    let base = fixture.path().canonicalize().unwrap();
    let root = base.join("recovery-state");
    let profile = base.join("data");
    fs::create_dir_all(&profile).unwrap();
    fs::write(
        profile.join("settings.json"),
        r#"{"autoUpdateEnabled":true,"sentinel":"preserve-user-data","repositories":[]}"#,
    )
    .unwrap();
    let target = match kind {
        Kind::Windows => base.join("installed/Open-Git-Control"),
        Kind::Macos => base.join("installed/Open-Git-Control.app"),
        Kind::Appimage => base.join("installed/Open-Git-Control.AppImage"),
        Kind::Deb => Path::new("/opt/Open-Git-Control").to_owned(),
    };
    if kind == Kind::Deb {
        assert!(
            !target.exists(),
            "A preexisting DEB installation must never participate in this test."
        );
    }
    fs::create_dir_all(target.parent().unwrap()).unwrap();
    // Fixed, already complete public releases avoid racing the release that is
    // currently being built and has not received its assets yet.
    let old = policy::stable("2.2.1").unwrap();
    let control = Control::default();
    let latest = policy::stable("3.0.5").unwrap();
    assert!(latest > old);
    let seed = package(&root, &target, kind, &old);
    let app = Installation {
        schema: 1,
        app_id: APP_ID.into(),
        target: target.clone(),
        profile: profile.clone(),
        kind,
        version: Some(old.clone()),
        image_identity: None,
    };
    match kind {
        Kind::Macos => {
            let extracted = base.join("seed-bundle");
            fs::create_dir(&extracted).unwrap();
            let bundle = archive::bundle(&seed, &extracted, &control).unwrap();
            fs::rename(bundle, &target).unwrap();
        }
        Kind::Appimage => {
            fs::copy(seed, &target).unwrap();
        }
        _ => {
            fs::create_dir_all(&target).unwrap();
            let operation = base.join("seed-operation");
            fs::create_dir(&operation).unwrap();
            platform::install(&app, &seed, &old, &operation, &control, &|p| {
                println!("seed: {}", p.phase)
            })
            .unwrap();
        }
    }
    let mut app = installation::inspect(&target, Some(&profile), Some(kind)).unwrap();
    app.version = Some(old.clone());
    installation::register(&root, &app).unwrap();
    let report = |p: ogc_recovery::model::Progress| println!("{}: {}", p.phase, p.message);
    let newer = job::run(
        &root,
        &app,
        Action::Update,
        &latest,
        &Control::default(),
        &report,
    )
    .unwrap();
    assert_eq!(newer.version, Some(latest.clone()));
    let repaired = job::run(
        &root,
        &newer,
        Action::Repair,
        &latest,
        &Control::default(),
        &report,
    )
    .unwrap();
    assert_eq!(repaired.version, Some(latest));
    let restored = job::run(
        &root,
        &repaired,
        Action::Downgrade,
        &old,
        &Control::default(),
        &report,
    )
    .unwrap();
    assert_eq!(restored.version, Some(old));
    let settings: serde_json::Value =
        safe_io::read_json(&profile.join("settings.json"), 4096).unwrap();
    assert_eq!(settings["autoUpdateEnabled"], false);
    assert_eq!(settings["sentinel"], "preserve-user-data");
    let saved = installation::discover(&root).unwrap();
    assert!(saved
        .iter()
        .any(|a| safe_io::key(&a.target) == safe_io::key(&target)));
    let helpers = root.join("bin").join(env!("CARGO_PKG_VERSION"));
    assert!(fs::read_dir(helpers).unwrap().flatten().any(|entry| entry
        .path()
        .join(if cfg!(windows) {
            "Open-Git-Control-Recovery.exe"
        } else {
            "open-git-control-recovery"
        })
        .is_file()));
    assert_eq!(job::previous(&root, &restored).unwrap().phase, "complete");
}
#[test]
#[ignore = "installs official packages on a disposable CI runner"]
fn update_repair_and_restore_official_system_packages() {
    exercise(if cfg!(windows) {
        Kind::Windows
    } else if cfg!(target_os = "macos") {
        Kind::Macos
    } else {
        Kind::Deb
    });
}
#[cfg(target_os = "linux")]
#[test]
#[ignore = "replaces official AppImages on a disposable CI runner"]
fn update_repair_and_restore_appimage() {
    exercise(Kind::Appimage);
}
