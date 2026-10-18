use crate::{model::APP_ID, safe_io};
use anyhow::{bail, ensure, Result};
use serde::{Deserialize, Serialize};
use std::{
    cell::RefCell,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, Weak,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Owner {
    pub schema: u32,
    pub app_id: String,
    pub pid: u32,
    pub process_start: u64,
    pub nonce: String,
    pub target: PathBuf,
    pub heartbeat: u64,
    #[serde(default)]
    pub installer_pid: Option<u32>,
    #[serde(default)]
    pub installer_start: Option<u64>,
}
struct TrackedOwner {
    directory: PathBuf,
    owner: Weak<Mutex<Owner>>,
}
thread_local! { static CURRENT_OWNERS: RefCell<Vec<TrackedOwner>> = const { RefCell::new(Vec::new()) }; }
/// Persist the system installer's identity before waiting. Its lock remains
/// meaningful if the helper is killed while the installer continues running.
pub fn track_installer(pid: u32) -> Result<()> {
    ensure!(pid > 0, "Cannot record an unknown installer process.");
    let mut system = System::new();
    let process = Pid::from_u32(pid);
    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[process]),
        true,
        ProcessRefreshKind::nothing(),
    );
    let started = system.process(process).map(|p| p.start_time()).unwrap_or(0);
    CURRENT_OWNERS.with(|tracked| -> Result<()> {
        let mut tracked = tracked.borrow_mut();
        tracked.retain(|entry| entry.owner.strong_count() > 0);
        for entry in tracked.iter() {
            if let Some(owner) = entry.owner.upgrade() {
                let mut owner = owner.lock().unwrap_or_else(|p| p.into_inner());
                owner.installer_pid = Some(pid);
                owner.installer_start = Some(started);
                safe_io::atomic_json(&entry.directory.join("owner.json"), &*owner)?;
            }
        }
        Ok(())
    })
}
pub fn process_alive(pid: u32, started: u64) -> bool {
    let pid = Pid::from_u32(pid);
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        true,
        ProcessRefreshKind::nothing(),
    );
    system.process(pid).is_some_and(|p| {
        crate::processes::running(p) && (started == 0 || p.start_time() == started)
    })
}
pub struct Lease {
    directory: PathBuf,
    owner: Arc<Mutex<Owner>>,
    stop: Arc<AtomicBool>,
    timer: Option<thread::JoinHandle<()>>,
    _guard: fs::File,
    _global: Option<Box<Lease>>,
}
impl Lease {
    pub fn acquire(root: &Path, target: &Path) -> Result<Self> {
        let global = if cfg!(windows) {
            Some(Box::new(Self::at(
                root.join("windows-installer"),
                target,
                false,
            )?))
        } else {
            None
        };
        let mut lease = Self::at(safe_io::installation_dir(root, target), target, true)?;
        lease._global = global;
        Ok(lease)
    }
    fn at(parent: PathBuf, target: &Path, same_target: bool) -> Result<Self> {
        safe_io::private_dir(&parent)?;
        let guard_path = parent.join("install.guard");
        if guard_path.try_exists()? {
            safe_io::no_link(&guard_path)?;
        }
        let guard = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(guard_path)?;
        fs2::FileExt::try_lock_exclusive(&guard)
            .map_err(|_| anyhow::anyhow!("Another recovery is running for this installation."))?;
        let directory = parent.join("install.lock");
        if let Err(error) = fs::create_dir(&directory) {
            if error.kind() != std::io::ErrorKind::AlreadyExists {
                return Err(error.into());
            }
            safe_io::no_link(&directory)?;
            let owner_path = directory.join("owner.json");
            if owner_path.try_exists()? {
                let previous: Owner = safe_io::read_json(&owner_path, 32 * 1024)?;
                ensure!(
                    previous.schema == 1
                        && previous.app_id == APP_ID
                        && previous.target.is_absolute()
                        && (!same_target || safe_io::key(&previous.target) == safe_io::key(target))
                        && previous.pid > 0,
                    "The installation lock is invalid; it was left intact."
                );
                ensure!(
                    !process_alive(previous.pid, previous.process_start)
                        && !previous.installer_pid.is_some_and(|pid| process_alive(
                            pid,
                            previous.installer_start.unwrap_or(0)
                        )),
                    "Another update or recovery is still running for this installation."
                );
                // The nonce is re-read before removing only this known ownership file.
                let check: Owner = safe_io::read_json(&owner_path, 32 * 1024)?;
                ensure!(
                    check.nonce == previous.nonce,
                    "The update lock changed. Try again."
                );
                fs::remove_file(owner_path)?;
                fs::remove_dir(&directory)?;
            } else {
                let age = fs::metadata(&directory)?
                    .modified()?
                    .elapsed()
                    .unwrap_or_default();
                if age < Duration::from_secs(30) {
                    bail!("An update is starting. Try again in a moment.");
                }
                // remove_dir cannot remove a directory that contains unexpected files.
                fs::remove_dir(&directory)?;
            }
            fs::create_dir(&directory)?;
        }
        let pid = std::process::id();
        let mut system = System::new();
        let process = Pid::from_u32(pid);
        system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[process]),
            true,
            ProcessRefreshKind::nothing(),
        );
        let owner = Owner {
            schema: 1,
            app_id: APP_ID.into(),
            pid,
            process_start: system.process(process).map(|p| p.start_time()).unwrap_or(0),
            nonce: uuid::Uuid::new_v4().to_string(),
            target: target.to_owned(),
            heartbeat: now(),
            installer_pid: None,
            installer_start: None,
        };
        safe_io::atomic_json(&directory.join("owner.json"), &owner)?;
        let owner = Arc::new(Mutex::new(owner));
        CURRENT_OWNERS.with(|tracked| {
            tracked.borrow_mut().push(TrackedOwner {
                directory: directory.clone(),
                owner: Arc::downgrade(&owner),
            })
        });
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = stop.clone();
        let dir = directory.clone();
        let heartbeat = owner.clone();
        let timer = thread::spawn(move || {
            while !stopped.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(500));
                if stopped.load(Ordering::SeqCst) {
                    break;
                }
                let mut heartbeat = heartbeat.lock().unwrap_or_else(|p| p.into_inner());
                if now().saturating_sub(heartbeat.heartbeat) >= 2000 {
                    heartbeat.heartbeat = now();
                    let _ = safe_io::atomic_json(&dir.join("owner.json"), &*heartbeat);
                }
            }
        });
        Ok(Self {
            directory,
            owner,
            stop,
            timer: Some(timer),
            _guard: guard,
            _global: None,
        })
    }
}
impl Drop for Lease {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(timer) = self.timer.take() {
            let _ = timer.join();
        }
        let file = self.directory.join("owner.json");
        let owner = self.owner.lock().unwrap_or_else(|p| p.into_inner());
        if safe_io::read_json::<Owner>(&file, 32 * 1024).is_ok_and(|o| o.nonce == owner.nonce) {
            let _ = fs::remove_file(file);
            let _ = fs::remove_dir(&self.directory);
        }
    }
}
