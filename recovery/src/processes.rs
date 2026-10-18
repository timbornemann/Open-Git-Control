use crate::{
    model::{Control, Installation, Kind, Progress, Report},
    safe_io,
};
use anyhow::{ensure, Result};
use std::{
    collections::BTreeSet,
    sync::atomic::Ordering,
    thread,
    time::{Duration, Instant},
};
#[cfg(unix)]
use sysinfo::Signal;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

fn inventory() -> System {
    let mut system = System::new();
    let refresh = ProcessRefreshKind::nothing()
        .with_exe(UpdateKind::Always)
        .with_user(UpdateKind::Always);
    #[cfg(target_os = "linux")]
    let refresh = refresh.with_environ(UpdateKind::Always);
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, refresh);
    system
}
fn owned(system: &System, installation: &Installation) -> BTreeSet<Pid> {
    let executable = installation.kind.main_executable(&installation.target);
    let expected = safe_io::normalized(&executable, cfg!(windows));
    let me = system
        .process(Pid::from_u32(std::process::id()))
        .and_then(|p| p.user_id());
    let mut selected = BTreeSet::new();
    let mut directories = BTreeSet::new();
    if installation.kind != Kind::Appimage {
        if let Ok(directory) = installation.target.canonicalize() {
            directories.insert(directory);
        }
    }
    for (pid, process) in system.processes() {
        if recovery_process(*pid, process)
            || me.is_none()
            || process.user_id() != me
            || !running(process)
        {
            continue;
        }
        let exact = process
            .exe()
            .and_then(|p| p.canonicalize().ok())
            .is_some_and(|p| safe_io::normalized(&p, cfg!(windows)) == expected);
        #[cfg(target_os = "linux")]
        let exact = {
            let directory = (installation.kind == Kind::Appimage)
                .then(|| {
                    process.exe().and_then(|exe| {
                        appimage_directory(exe, process.environ(), &installation.target)
                    })
                })
                .flatten();
            let image_main = directory.is_some();
            directories.extend(directory);
            exact || image_main
        };
        if exact {
            selected.insert(*pid);
        }
    }
    // The parent relationship alone does not establish ownership: browsers,
    // editors and build tools launched by the app must not be closed or killed.
    // Electron's own helpers execute within the verified installation/mount.
    loop {
        let before = selected.len();
        for (pid, process) in system.processes() {
            if process.user_id() == me
                && !recovery_process(*pid, process)
                && running(process)
                && process.parent().is_some_and(|p| selected.contains(&p))
                && process
                    .exe()
                    .and_then(|p| p.canonicalize().ok())
                    .is_some_and(|exe| {
                        let path = safe_io::normalized(&exe, cfg!(windows));
                        directories.iter().any(|directory| {
                            path.starts_with(&(safe_io::normalized(directory, cfg!(windows)) + "/"))
                        })
                    })
            {
                selected.insert(*pid);
            }
        }
        if selected.len() == before {
            break;
        }
    }
    selected
}
#[cfg(target_os = "linux")]
fn appimage_directory(
    executable: &std::path::Path,
    environment: &[std::ffi::OsString],
    target: &std::path::Path,
) -> Option<std::path::PathBuf> {
    let value = |prefix: &str| {
        environment.iter().find_map(|entry| {
            entry
                .to_str()
                .and_then(|entry| entry.strip_prefix(prefix))
                .map(std::path::PathBuf::from)
        })
    };
    let image = value("APPIMAGE=")?.canonicalize().ok()?;
    let directory = value("APPDIR=")?.canonicalize().ok()?;
    let executable = executable.canonicalize().ok()?;
    // APPIMAGE is inherited by every subprocess, including external programs.
    // Only the actual Electron executable inside its APPDIR establishes a root.
    (image == target
        && executable.file_name()? == "open-git-control"
        && executable.starts_with(&directory))
    .then_some(directory)
}
fn recovery_process(pid: Pid, process: &sysinfo::Process) -> bool {
    pid.as_u32() == std::process::id()
        || process
            .exe()
            .and_then(|p| p.file_name())
            .is_some_and(|name| {
                let name = name.to_string_lossy();
                name.eq_ignore_ascii_case("Open-Git-Control-Recovery.exe")
                    || name == "open-git-control-recovery"
            })
}

pub fn close(installation: &Installation, control: &Control, report: &Report) -> Result<()> {
    let system = inventory();
    let selected = owned(&system, installation);
    if selected.is_empty() {
        return Ok(());
    }
    report(Progress::phase(
        "close",
        "Closing the application. Save any open editor changes.",
    ));
    #[cfg(windows)]
    graceful_windows(&selected);
    #[cfg(target_os = "macos")]
    {
        let expected = installation.kind.main_executable(&installation.target);
        for pid in &selected {
            if system
                .process(*pid)
                .and_then(|p| p.exe())
                .is_some_and(|p| p == expected)
            {
                if let Some(app) =
                    objc2_app_kit::NSRunningApplication::runningApplicationWithProcessIdentifier(
                        pid.as_u32() as i32,
                    )
                {
                    app.terminate();
                }
            }
        }
    }
    #[cfg(target_os = "linux")]
    graceful_linux(&selected);
    let waiting = Instant::now();
    let mut prompted = false;
    loop {
        control.check()?;
        let current = inventory();
        let current_owned = owned(&current, installation);
        let remaining: Vec<_> = selected
            .iter()
            .filter(|pid| {
                current.process(**pid).is_some_and(|p| {
                    running(p)
                        && system
                            .process(**pid)
                            .is_some_and(|original| p.start_time() == original.start_time())
                })
            })
            .collect();
        if remaining.is_empty() && current_owned.is_empty() {
            return Ok(());
        }
        if waiting.elapsed() >= Duration::from_secs(10) && !prompted {
            report(Progress::phase("waiting-for-app", "The app is still running. Save your changes, close it, or explicitly choose Force close. Unsaved editor changes and running jobs may be lost."));
            prompted = true;
        }
        if control.force_close.load(Ordering::SeqCst) {
            for pid in remaining {
                if let Some(p) = current.process(*pid) {
                    kill(p)?;
                }
            }
            // A restarted app is never killed using stale PIDs. Require a new explicit operation.
            ensure!(
                current_owned.iter().all(|pid| selected.contains(pid)),
                "The app restarted while recovery was waiting. Close it and retry."
            );
        }
        thread::sleep(Duration::from_millis(300));
    }
}

/// NSIS versions already published check application names globally. Recovery
/// must refuse installation while another copy is running, rather than let an
/// older installer close that unrelated copy in silent mode.
pub fn assert_installer_scope(installation: &Installation) -> Result<()> {
    #[cfg(windows)]
    {
        let expected = installation.kind.main_executable(&installation.target);
        let inventory = inventory();
        for process in inventory.processes().values() {
            if !running(process) {
                continue;
            }
            if process
                .name()
                .to_string_lossy()
                .eq_ignore_ascii_case("Open-Git-Control.exe")
            {
                ensure!(process.exe().is_some_and(|p|safe_io::key(p)==safe_io::key(&expected)),"A different Open-Git-Control installation is running. Close that app yourself before continuing; recovery will not stop it.");
            }
        }
        crate::windows_registry::scope(&installation.target)?;
    }
    #[cfg(not(windows))]
    let _ = installation;
    Ok(())
}

#[cfg(target_os = "linux")]
fn graceful_linux(pids: &BTreeSet<Pid>) {
    // X11's close-window request respects Electron's unsaved-editor guard.
    // Wayland does not let another app close arbitrary windows; wait for the
    // user to close it normally instead of sending an unconditional SIGTERM.
    use x11rb::{
        connection::Connection,
        protocol::xproto::{AtomEnum, ClientMessageEvent, ConnectionExt, EventMask},
    };
    let request = (|| -> Result<()> {
        let (connection, screen) = x11rb::connect(None)?;
        let root = connection.setup().roots[screen].root;
        let clients = connection
            .intern_atom(false, b"_NET_CLIENT_LIST")?
            .reply()?
            .atom;
        let pid_atom = connection.intern_atom(false, b"_NET_WM_PID")?.reply()?.atom;
        let close = connection
            .intern_atom(false, b"_NET_CLOSE_WINDOW")?
            .reply()?
            .atom;
        let windows = connection
            .get_property(false, root, clients, AtomEnum::WINDOW, 0, 10000)?
            .reply()?;
        for window in windows.value32().into_iter().flatten() {
            let property = connection
                .get_property(false, window, pid_atom, AtomEnum::CARDINAL, 0, 1)?
                .reply()?;
            if property
                .value32()
                .and_then(|mut v| v.next())
                .is_some_and(|pid| pids.contains(&Pid::from_u32(pid)))
            {
                connection.send_event(
                    false,
                    root,
                    EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
                    ClientMessageEvent::new(32, window, close, [x11rb::CURRENT_TIME, 2, 0, 0, 0]),
                )?;
            }
        }
        connection.flush()?;
        Ok(())
    })();
    let _ = request;
}

pub fn running(process: &sysinfo::Process) -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::{
            Foundation::{CloseHandle, WAIT_OBJECT_0},
            System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE},
        };
        unsafe {
            let handle = OpenProcess(PROCESS_SYNCHRONIZE, 0, process.pid().as_u32());
            if handle.is_null() {
                return std::io::Error::last_os_error().raw_os_error() != Some(87);
            }
            let state = WaitForSingleObject(handle, 0);
            CloseHandle(handle);
            state != WAIT_OBJECT_0
        }
    }
    #[cfg(unix)]
    {
        !matches!(
            process.status(),
            sysinfo::ProcessStatus::Zombie | sysinfo::ProcessStatus::Dead
        )
    }
}
fn kill(process: &sysinfo::Process) -> Result<()> {
    #[cfg(unix)]
    ensure!(
        process.kill_with(Signal::Kill) == Some(true) || !running(process),
        "Cannot stop this app process. Close it using the operating system and retry."
    );
    #[cfg(windows)]
    {
        use windows_sys::Win32::{
            Foundation::{CloseHandle, FILETIME, WAIT_OBJECT_0},
            System::Threading::{
                GetProcessTimes, OpenProcess, TerminateProcess, WaitForSingleObject,
                PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE, PROCESS_TERMINATE,
            },
        };
        unsafe {
            let handle = OpenProcess(
                PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SYNCHRONIZE,
                0,
                process.pid().as_u32(),
            );
            if handle.is_null() {
                ensure!(
                    !running(process),
                    "Cannot open the selected app process. Close it using Windows and retry."
                );
                return Ok(());
            }
            let mut times = [FILETIME::default(); 4];
            let read = GetProcessTimes(
                handle,
                &mut times[0],
                &mut times[1],
                &mut times[2],
                &mut times[3],
            );
            let created = ((times[0].dwHighDateTime as u64) << 32 | times[0].dwLowDateTime as u64)
                / 10_000_000;
            let same =
                read != 0 && created.checked_sub(11_644_473_600) == Some(process.start_time());
            let exited = WaitForSingleObject(handle, 0) == WAIT_OBJECT_0;
            let stopped = exited || (same && TerminateProcess(handle, 1) != 0);
            CloseHandle(handle);
            ensure!(stopped, "The selected process changed or could not be stopped. Close it using Windows and retry.");
        }
    }
    Ok(())
}

#[cfg(windows)]
fn graceful_windows(pids: &BTreeSet<Pid>) {
    use windows_sys::{
        core::BOOL,
        Win32::{
            Foundation::{HWND, LPARAM},
            UI::WindowsAndMessaging::{
                EnumWindows, GetWindowThreadProcessId, PostMessageW, WM_CLOSE,
            },
        },
    };
    unsafe extern "system" fn visit(window: HWND, context: LPARAM) -> BOOL {
        let pids = unsafe { &*(context as *const BTreeSet<Pid>) };
        let mut pid = 0;
        unsafe {
            GetWindowThreadProcessId(window, &mut pid);
        }
        if pids.contains(&Pid::from_u32(pid)) {
            unsafe {
                PostMessageW(window, WM_CLOSE, 0, 0);
            }
        }
        1
    }
    unsafe {
        EnumWindows(Some(visit), pids as *const _ as LPARAM);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct FixtureChild(std::process::Child);
    impl Drop for FixtureChild {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
    fn idle_child(executable: std::ffi::OsString, test: &str) -> FixtureChild {
        use std::io::BufRead;
        let mut child = crate::platform::command(executable)
            .args(["--exact", test, "--nocapture"])
            .env("OGC_RECOVERY_DESCENDANT_FIXTURE", "idle")
            .stdout(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        let mut reader = std::io::BufReader::new(child.stdout.take().unwrap());
        let mut line = String::new();
        loop {
            assert_ne!(reader.read_line(&mut line).unwrap(), 0);
            if line.contains("FIXTURE_READY") {
                break;
            }
            line.clear();
        }
        FixtureChild(child)
    }
    #[cfg(target_os = "linux")]
    #[test]
    fn an_inherited_appimage_environment_does_not_claim_external_programs() {
        let root = tempfile::tempdir().unwrap();
        let image = root.path().join("App.AppImage");
        let directory = root.path().join("mount");
        let executable = directory.join("open-git-control");
        let external = root.path().join("open-git-control");
        std::fs::create_dir(&directory).unwrap();
        for path in [&image, &executable, &external] {
            std::fs::write(path, "fixture").unwrap();
        }
        let env = [
            format!("APPIMAGE={}", image.display()).into(),
            format!("APPDIR={}", directory.display()).into(),
        ];
        let image = image.canonicalize().unwrap();
        assert_eq!(
            appimage_directory(&executable, &env, &image),
            Some(directory.canonicalize().unwrap())
        );
        assert!(appimage_directory(&external, &env, &image).is_none());
        assert!(appimage_directory(&executable, &env, &external).is_none());
    }
    #[test]
    fn the_recovery_child_of_the_main_app_is_excluded_from_shutdown() {
        const TEST: &str =
            "processes::tests::the_recovery_child_of_the_main_app_is_excluded_from_shutdown";
        let role = std::env::var("OGC_RECOVERY_DESCENDANT_FIXTURE").unwrap_or_default();
        if role == "idle" {
            use std::io::Write;
            println!("FIXTURE_READY");
            std::io::stdout().flush().unwrap();
            loop {
                thread::sleep(Duration::from_secs(1));
            }
        }
        if role == "helper" {
            let target =
                std::path::PathBuf::from(std::env::var_os("OGC_RECOVERY_FIXTURE_TARGET").unwrap());
            let app = Installation {
                schema: 1,
                app_id: crate::model::APP_ID.into(),
                target,
                profile: std::env::temp_dir().join("unused-profile"),
                kind: if cfg!(windows) {
                    crate::model::Kind::Windows
                } else if cfg!(target_os = "macos") {
                    crate::model::Kind::Macos
                } else {
                    crate::model::Kind::Deb
                },
                version: None,
                image_identity: None,
            };
            let selected = owned(&inventory(), &app);
            let parent = std::env::var("OGC_RECOVERY_FIXTURE_MAIN_PID")
                .unwrap()
                .parse::<u32>()
                .unwrap();
            assert!(
                selected.contains(&Pid::from_u32(parent)),
                "The fixture main app must really be present"
            );
            assert!(
                !selected.contains(&Pid::from_u32(std::process::id())),
                "Recovery must survive closing the main app that launched it"
            );
            let external = std::env::var("OGC_RECOVERY_FIXTURE_EXTERNAL_PID")
                .unwrap()
                .parse::<u32>()
                .unwrap();
            assert!(
                !selected.contains(&Pid::from_u32(external)),
                "An external editor started by the main app must remain running"
            );
            let renderer = std::env::var("OGC_RECOVERY_FIXTURE_RENDERER_PID")
                .unwrap()
                .parse::<u32>()
                .unwrap();
            assert!(
                selected.contains(&Pid::from_u32(renderer)),
                "The app's own renderer child must be included"
            );
            return;
        }
        if role == "main" {
            let external = idle_child(
                std::env::var_os("OGC_RECOVERY_FIXTURE_EXTERNAL").unwrap(),
                TEST,
            );
            let renderer = idle_child(
                std::env::var_os("OGC_RECOVERY_FIXTURE_RENDERER").unwrap(),
                TEST,
            );
            let executable = std::env::var_os("OGC_RECOVERY_FIXTURE_HELPER").unwrap();
            let status = crate::platform::command(executable)
                .args(["--exact", TEST])
                .env("OGC_RECOVERY_DESCENDANT_FIXTURE", "helper")
                .env(
                    "OGC_RECOVERY_FIXTURE_MAIN_PID",
                    std::process::id().to_string(),
                )
                .env(
                    "OGC_RECOVERY_FIXTURE_EXTERNAL_PID",
                    external.0.id().to_string(),
                )
                .env(
                    "OGC_RECOVERY_FIXTURE_RENDERER_PID",
                    renderer.0.id().to_string(),
                )
                .status()
                .unwrap();
            assert!(status.success());
            return;
        }
        let root = tempfile::tempdir_in(std::env::temp_dir().canonicalize().unwrap()).unwrap();
        let kind = if cfg!(windows) {
            crate::model::Kind::Windows
        } else if cfg!(target_os = "macos") {
            crate::model::Kind::Macos
        } else {
            crate::model::Kind::Deb
        };
        let target = root.path().join("App");
        let executable = kind.main_executable(&target);
        std::fs::create_dir_all(executable.parent().unwrap()).unwrap();
        let helper = std::env::current_exe().unwrap();
        std::fs::copy(&helper, &executable).unwrap();
        let external = root.path().join(if cfg!(windows) {
            "editor.exe"
        } else {
            "editor"
        });
        let renderer = executable.parent().unwrap().join(if cfg!(windows) {
            "renderer.exe"
        } else {
            "renderer"
        });
        std::fs::copy(&helper, &external).unwrap();
        std::fs::copy(&helper, &renderer).unwrap();
        let status = crate::platform::command(executable)
            .args(["--exact", TEST])
            .env("OGC_RECOVERY_DESCENDANT_FIXTURE", "main")
            .env("OGC_RECOVERY_FIXTURE_HELPER", helper)
            .env("OGC_RECOVERY_FIXTURE_EXTERNAL", external)
            .env("OGC_RECOVERY_FIXTURE_RENDERER", renderer)
            .env(
                "OGC_RECOVERY_FIXTURE_TARGET",
                target.canonicalize().unwrap(),
            )
            .status()
            .unwrap();
        assert!(status.success());
    }
}
