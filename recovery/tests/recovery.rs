use base64::{engine::general_purpose::STANDARD, Engine};
use ogc_recovery::{
    archive, download, installation, job,
    lease::{Lease, Owner},
    model::{Action, Control, Installation, Kind, APP_ID},
    policy, profile, safe_io,
};
use sha2::{Digest, Sha512};
use std::{fs, io::Write, path::Path, sync::atomic::Ordering};

fn fixture() -> tempfile::TempDir {
    tempfile::tempdir_in(std::env::temp_dir().canonicalize().unwrap()).unwrap()
}
fn descriptor(target: &Path, version: &str) {
    fs::create_dir_all(target).unwrap();
    fs::write(target.join("recovery-install.json"), serde_json::to_vec(&serde_json::json!({"schema":1,"appId":APP_ID,"kind":if cfg!(windows) {"windows"} else {"deb"},"version":version})).unwrap()).unwrap();
}
#[test]
fn repair_and_downgrade_are_explicit() {
    let current = policy::stable("3.0.5").unwrap();
    let old = policy::stable("2.2.1").unwrap();
    let new = policy::stable("3.0.6").unwrap();
    assert!(Action::Repair.validate(Some(&current), &current).is_ok());
    assert!(Action::Update.validate(Some(&current), &new).is_ok());
    assert!(Action::Update.validate(Some(&current), &old).is_err());
    assert!(Action::Downgrade.validate(Some(&current), &old).is_ok());
    assert!(Action::Downgrade.validate(Some(&current), &new).is_err());
    assert!(Action::Repair.validate(Some(&current), &new).is_err());
    assert!(Action::Downgrade.validate(None, &old).is_err());
}
#[test]
fn backup_preserves_opaque_data_and_omits_regenerable_caches() {
    let root = fixture();
    let data = root.path().join("profile");
    let backup = root.path().join("backup");
    fs::create_dir_all(data.join("Cache")).unwrap();
    fs::create_dir_all(data.join("userdata")).unwrap();
    let settings = b"damaged settings kept exactly";
    fs::write(data.join("settings.json"), settings).unwrap();
    fs::write(data.join("userdata/secret.bin"), [0, 128, 255]).unwrap();
    fs::write(data.join("Cache/junk"), "generated").unwrap();
    profile::backup(&data, &backup, &Control::default(), &|_| {}).unwrap();
    assert_eq!(
        fs::read(backup.join("data/settings.json")).unwrap(),
        settings
    );
    assert_eq!(
        fs::read(backup.join("data/userdata/secret.bin")).unwrap(),
        [0, 128, 255]
    );
    assert!(!backup.join("data/Cache").exists());
    assert!(backup.join("backup.json").is_file());
    assert!(profile::pause_automatic_updates(&data).is_err());
    assert_eq!(fs::read(data.join("settings.json")).unwrap(), settings);
}
#[test]
fn downgrade_only_pauses_automatic_downloads_and_keeps_settings() {
    let root = fixture();
    let data = root.path().join("profile");
    fs::create_dir(&data).unwrap();
    fs::write(
        data.join("settings.json"),
        r#"{"autoUpdateEnabled":true,"repositories":["D:/my/repo"],"extra":{"keep":1}}"#,
    )
    .unwrap();
    profile::pause_automatic_updates(&data).unwrap();
    let settings: serde_json::Value =
        safe_io::read_json(&data.join("settings.json"), 4096).unwrap();
    assert_eq!(settings["autoUpdateEnabled"], false);
    assert_eq!(settings["repositories"][0], "D:/my/repo");
    assert_eq!(settings["extra"]["keep"], 1);
    // Reopening reads false; no automatic reset is performed by discovery or repair.
    assert_eq!(
        safe_io::read_json::<serde_json::Value>(&data.join("settings.json"), 4096).unwrap(),
        settings
    );
}
#[test]
fn cancelled_backup_is_not_marked_complete() {
    let root = fixture();
    let data = root.path().join("profile");
    let backup = root.path().join("backup");
    fs::create_dir(&data).unwrap();
    fs::write(data.join("settings.json"), "{}").unwrap();
    let control = Control::default();
    control.cancel.store(true, Ordering::SeqCst);
    assert!(profile::backup(&data, &backup, &control, &|_| {}).is_err());
    assert!(!backup.join("backup.json").exists());
}

#[test]
fn cancellation_during_copy_retains_partial_backup_without_a_completion_marker() {
    let root = fixture();
    let data = root.path().join("profile");
    let backup = root.path().join("backup");
    fs::create_dir(&data).unwrap();
    fs::write(data.join("first"), "one").unwrap();
    fs::write(data.join("second"), "two").unwrap();
    let control = Control::default();
    let cancelled = control.clone();
    assert!(profile::backup(&data, &backup, &control, &move |_| {
        cancelled.cancel.store(true, Ordering::SeqCst);
    })
    .is_err());
    assert!(backup.join("data").is_dir());
    assert!(!backup.join("backup.json").exists());
    assert_eq!(fs::read_to_string(data.join("first")).unwrap(), "one");
    assert_eq!(fs::read_to_string(data.join("second")).unwrap(), "two");
}

#[test]
fn old_app_archive_metadata_is_read_without_executing_electron() {
    let root = fixture();
    let archive = root.path().join("app.asar");
    let package = br#"{"name":"open-git-control","version":"2.2.1"}"#;
    let header = serde_json::to_vec(
        &serde_json::json!({"files":{"package.json":{"size":package.len(),"offset":"0"}}}),
    )
    .unwrap();
    let header_size = (header.len() + 8 + 3) & !3;
    let mut bytes = vec![0u8; 8 + header_size];
    bytes[0..4].copy_from_slice(&4u32.to_le_bytes());
    bytes[4..8].copy_from_slice(&(header_size as u32).to_le_bytes());
    bytes[8..12].copy_from_slice(&((header_size - 4) as u32).to_le_bytes());
    bytes[12..16].copy_from_slice(&(header.len() as u32).to_le_bytes());
    bytes[16..16 + header.len()].copy_from_slice(&header);
    bytes.extend_from_slice(package);
    fs::write(&archive, &bytes).unwrap();
    assert_eq!(
        installation::asar_version(&archive).unwrap().to_string(),
        "2.2.1"
    );
    bytes[4..8].copy_from_slice(&u32::MAX.to_le_bytes());
    fs::write(&archive, &bytes).unwrap();
    assert!(installation::asar_version(&archive).is_err());
}

#[test]
fn working_helper_survives_replacing_an_app_with_a_version_without_recovery() {
    let root = fixture();
    let helper = ogc_recovery::shortcuts::stage(root.path()).unwrap();
    assert!(helper.is_file());
    assert_eq!(ogc_recovery::shortcuts::stage(root.path()).unwrap(), helper);
    let target = root.path().join("app");
    descriptor(&target, "2.2.1");
    assert!(!target.join("Open-Git-Control-Recovery.exe").exists());
    assert!(helper.is_file());
}
#[test]
fn checked_bytes_are_required_before_using_an_installer() {
    let root = fixture();
    let file = root.path().join("installer.exe");
    let bytes = vec![42; 150_000];
    fs::write(&file, &bytes).unwrap();
    let info = policy::File {
        url: "installer.exe".into(),
        sha512: STANDARD.encode(Sha512::digest(&bytes)),
        size: bytes.len() as u64,
        block_map_size: None,
    };
    download::verify(&file, &info, &Control::default()).unwrap();
    fs::OpenOptions::new()
        .append(true)
        .open(&file)
        .unwrap()
        .write_all(b"extra")
        .unwrap();
    assert!(download::verify(&file, &info, &Control::default()).is_err());
    fs::write(&file, vec![41; bytes.len()]).unwrap();
    assert!(download::verify(&file, &info, &Control::default()).is_err());
    assert!(safe_io::available(root.path(), u64::MAX).is_err());
}
#[test]
fn one_recovery_per_installation_and_stale_process_locks_are_recoverable() {
    let root = fixture();
    let target = root.path().join("app");
    let first = Lease::acquire(root.path(), &target).unwrap();
    assert!(Lease::acquire(root.path(), &target).is_err());
    let other = Lease::acquire(root.path(), &root.path().join("other"));
    if cfg!(windows) {
        assert!(
            other.is_err(),
            "NSIS recovery also needs the shared product installer lock"
        );
    } else {
        drop(other.unwrap());
    }
    drop(first);
    let directory = safe_io::installation_dir(root.path(), &target).join("install.lock");
    fs::create_dir(&directory).unwrap();
    let owner = Owner {
        schema: 1,
        app_id: APP_ID.into(),
        pid: std::process::id(),
        process_start: 1,
        nonce: uuid::Uuid::new_v4().to_string(),
        target: target.clone(),
        heartbeat: 0,
        installer_pid: None,
        installer_start: None,
    };
    safe_io::atomic_json(&directory.join("owner.json"), &owner).unwrap();
    let recovered = Lease::acquire(root.path(), &target).unwrap();
    assert!(directory.join("owner.json").is_file());
    drop(recovered);
    assert!(!directory.exists());
}
#[test]
fn damaged_lock_is_explained_and_not_deleted() {
    let root = fixture();
    let target = root.path().join("app");
    let directory = safe_io::installation_dir(root.path(), &target).join("install.lock");
    fs::create_dir_all(&directory).unwrap();
    fs::write(directory.join("owner.json"), "broken").unwrap();
    assert!(Lease::acquire(root.path(), &target).is_err());
    assert_eq!(
        fs::read_to_string(directory.join("owner.json")).unwrap(),
        "broken"
    );
}
#[test]
fn installer_process_is_recorded_durably_for_a_helper_restart() {
    let root = fixture();
    let target = root.path().join("app");
    let lease = Lease::acquire(root.path(), &target).unwrap();
    ogc_recovery::lease::track_installer(std::process::id()).unwrap();
    let owner: Owner = safe_io::read_json(
        &safe_io::installation_dir(root.path(), &target).join("install.lock/owner.json"),
        32768,
    )
    .unwrap();
    assert_eq!(owner.installer_pid, Some(std::process::id()));
    assert!(owner.installer_start.is_some());
    drop(lease);
}
#[test]
fn missing_electron_executable_and_icu_do_not_prevent_identification() {
    if cfg!(target_os = "macos") {
        return;
    }
    let root = fixture();
    let target = root.path().join("app");
    descriptor(&target, "3.0.5");
    let app = installation::inspect(&target, Some(&root.path().join("profile")), None).unwrap();
    assert_eq!(app.version.unwrap().to_string(), "3.0.5");
    let app = installation::inspect(&target, Some(&root.path().join("profile")), None).unwrap();
    assert!(job::verify_runtime(&app).is_err());
}
#[test]
fn interrupted_journal_is_retained_across_restart() {
    let root = fixture();
    let target = root.path().join("app");
    let app = Installation {
        schema: 1,
        app_id: APP_ID.into(),
        target: target.clone(),
        profile: root.path().join("profile"),
        kind: Kind::Windows,
        version: Some(policy::stable("3.0.5").unwrap()),
        image_identity: None,
    };
    let id = uuid::Uuid::new_v4().to_string();
    let operation = safe_io::installation_dir(root.path(), &target)
        .join("operations")
        .join(&id);
    safe_io::atomic_json(&operation.join("operation.json"),&serde_json::json!({"schema":1,"id":id,"target":target,"profile":app.profile,"fromVersion":"3.0.5","toVersion":"3.0.6","action":"Update","phase":"install","updatedAt":123,"artifact":null,"backup":null,"error":null})).unwrap();
    assert_eq!(job::previous(root.path(), &app).unwrap().phase, "install");
}
#[test]
fn unsafe_archive_paths_and_link_escapes_are_rejected() {
    for name in [
        "../outside",
        "/Open-Git-Control.app/file",
        "Open-Git-Control.app/../../outside",
        "Open-Git-Control.app\\..\\outside",
        "Other.app/file",
    ] {
        assert!(archive::path(name).is_err(), "{name}");
    }
    assert!(archive::path("Open-Git-Control.app/Contents/MacOS/Open-Git-Control").is_ok());
    assert!(archive::symlink_target(
        Path::new("Open-Git-Control.app/Contents/link"),
        "../../outside"
    )
    .is_err());
    assert!(archive::symlink_target(
        Path::new("Open-Git-Control.app/Contents/Framework/Versions/Current"),
        "A"
    )
    .is_ok());
}

#[test]
fn repositories_inside_program_folders_are_never_passed_to_an_installer() {
    let root = fixture();
    let target = root.path().join("app");
    fs::create_dir_all(target.join("my-project/.git")).unwrap();
    fs::write(target.join("my-project/keep.txt"), "my work").unwrap();
    let app = Installation {
        schema: 1,
        app_id: APP_ID.into(),
        target: target.clone(),
        profile: root.path().join("profile"),
        kind: Kind::Windows,
        version: Some(policy::stable("3.0.5").unwrap()),
        image_identity: None,
    };
    assert!(ogc_recovery::destination::protect(&app).is_err());
    assert_eq!(
        fs::read_to_string(target.join("my-project/keep.txt")).unwrap(),
        "my work"
    );
}
#[test]
fn bare_repositories_and_embedded_profiles_are_protected_too() {
    let root = fixture();
    let target = root.path().join("app");
    fs::create_dir_all(target.join("bare/objects")).unwrap();
    fs::create_dir_all(target.join("bare/refs")).unwrap();
    fs::write(target.join("bare/HEAD"), "ref: refs/heads/main").unwrap();
    let app = Installation {
        schema: 1,
        app_id: APP_ID.into(),
        target: target.clone(),
        profile: root.path().join("profile"),
        kind: Kind::Windows,
        version: None,
        image_identity: None,
    };
    assert!(ogc_recovery::destination::protect(&app).is_err());
    let second = root.path().join("another-app");
    fs::create_dir_all(second.join("user-data")).unwrap();
    fs::write(second.join("user-data/settings.json"), "{}").unwrap();
    let app = Installation {
        target: second,
        ..app
    };
    assert!(ogc_recovery::destination::protect(&app).is_err());
}

// This same compiled test executable is copied to a private fake installation.
// No user's actual app processes participate in the shutdown tests.
#[test]
fn hanging_app_fixture() {
    if std::env::var_os("OGC_RECOVERY_HANGING_FIXTURE").is_none() {
        return;
    }
    #[cfg(unix)]
    unsafe {
        libc::signal(libc::SIGTERM, libc::SIG_IGN);
    }
    println!("FIXTURE_READY");
    loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
}
struct FixtureChild(std::process::Child);
impl Drop for FixtureChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
fn hanging_child(root: &Path) -> (Installation, FixtureChild) {
    let kind = if cfg!(windows) {
        Kind::Windows
    } else if cfg!(target_os = "macos") {
        Kind::Macos
    } else {
        Kind::Deb
    };
    let target = if cfg!(target_os = "macos") {
        root.join("Open-Git-Control.app")
    } else {
        root.join("app")
    };
    let executable = kind.main_executable(&target);
    fs::create_dir_all(executable.parent().unwrap()).unwrap();
    fs::copy(std::env::current_exe().unwrap(), &executable).unwrap();
    let mut child = ogc_recovery::platform::command(&executable)
        .args(["--exact", "hanging_app_fixture", "--nocapture"])
        .env("OGC_RECOVERY_HANGING_FIXTURE", "1")
        .stdout(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    use std::io::BufRead;
    let mut output = std::io::BufReader::new(child.stdout.take().unwrap());
    let mut line = String::new();
    loop {
        line.clear();
        assert_ne!(
            output.read_line(&mut line).unwrap(),
            0,
            "The fixture did not start"
        );
        if line.contains("FIXTURE_READY") {
            break;
        }
    }
    (
        Installation {
            schema: 1,
            app_id: APP_ID.into(),
            target: target.canonicalize().unwrap(),
            profile: root.join("profile"),
            kind,
            version: Some(policy::stable("3.0.5").unwrap()),
            image_identity: None,
        },
        FixtureChild(child),
    )
}
#[test]
fn force_close_stops_only_the_selected_installation_after_explicit_consent() {
    let root = fixture();
    let foreign = fixture();
    let (app, mut child) = hanging_child(root.path());
    let (_, mut other) = hanging_child(foreign.path());
    let control = Control::default();
    let consent = control.clone();
    #[cfg(windows)]
    assert!(
        ogc_recovery::processes::assert_installer_scope(&app).is_err(),
        "An old NSIS installer must not close the unrelated fixture"
    );
    ogc_recovery::processes::close(&app, &control, &move |p| {
        if p.phase == "waiting-for-app" {
            consent.force_close.store(true, Ordering::SeqCst);
        }
    })
    .unwrap();
    assert!(child.0.try_wait().unwrap().is_some());
    assert!(other.0.try_wait().unwrap().is_none());
}
#[test]
fn cancelling_shutdown_does_not_kill_a_hanging_app() {
    let root = fixture();
    let (app, mut child) = hanging_child(root.path());
    let control = Control::default();
    control.cancel.store(true, Ordering::SeqCst);
    assert!(ogc_recovery::processes::close(&app, &control, &|_| {}).is_err());
    assert!(child.0.try_wait().unwrap().is_none());
}
#[cfg(unix)]
#[test]
fn profiles_and_managed_paths_reject_symlinks() {
    let root = fixture();
    let data = root.path().join("profile");
    fs::create_dir(&data).unwrap();
    fs::write(root.path().join("outside"), "untouched").unwrap();
    std::os::unix::fs::symlink(root.path().join("outside"), data.join("settings.json")).unwrap();
    assert!(profile::pause_automatic_updates(&data).is_err());
    assert!(profile::backup(
        &data,
        &root.path().join("backup"),
        &Control::default(),
        &|_| {}
    )
    .is_err());
    assert_eq!(
        fs::read_to_string(root.path().join("outside")).unwrap(),
        "untouched"
    );
}
