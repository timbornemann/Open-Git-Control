use crate::{
    installation,
    model::{Installation, Report},
    platform, safe_io,
};
use anyhow::{ensure, Result};
use semver::Version;
use std::{io::Read, os::windows::process::CommandExt, path::Path, thread, time::Duration};

pub fn install(
    target: &Installation,
    artifact: &Path,
    version: &Version,
    report: &Report,
) -> Result<()> {
    let mut bytes = [0; 64];
    std::fs::File::open(artifact)?.read_exact(&mut bytes)?;
    ensure!(
        bytes.starts_with(b"MZ"),
        "The verified download is not a Windows installer."
    );
    let mut installer = platform::command(artifact);
    let scope = crate::windows_registry::scope(&target.target)?;
    crate::processes::assert_installer_scope(target)?;
    if scope == "/allusers" {
        return elevated(artifact, &target.target, scope);
    }
    // Recovery already obtained explicit confirmation. Silent NSIS keeps the
    // chosen destination fixed; UAC remains entirely under Windows control.
    // /D is deliberately unquoted and last, as required by NSIS.
    installer.args(["--updated", "/S", scope]).raw_arg(format!(
        "/D={}",
        safe_io::normalized(&target.target, false).trim_start_matches(r"\\?\")
    ));
    if let Err(error) = platform::wait(&mut installer, report) {
        if error
            .downcast_ref::<std::io::Error>()
            .is_some_and(|e| e.raw_os_error() == Some(740))
        {
            elevated(artifact, &target.target, scope)?;
        } else {
            return Err(error);
        }
    }
    // Assisted NSIS may delegate to an elevated copy. Never report success just for starting it.
    for _ in 0..40 {
        if installation::inspect(&target.target, Some(&target.profile), None).is_ok_and(|i| {
            i.version.as_ref() == Some(version) && i.kind.main_executable(&i.target).is_file()
        }) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(500));
    }
    anyhow::bail!("The installed version could not be verified. The installer may have been cancelled or failed. Retry using the retained recovery helper.")
}

fn elevated(artifact: &Path, target: &Path, scope: &str) -> Result<()> {
    struct Com;
    impl Drop for Com {
        fn drop(&mut self) {
            unsafe {
                windows::Win32::System::Com::CoUninitialize();
            }
        }
    }
    unsafe {
        windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_APARTMENTTHREADED,
        )
        .ok()?;
    }
    let _com = Com;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::{
        Foundation::{CloseHandle, WAIT_OBJECT_0},
        System::Threading::{GetExitCodeProcess, WaitForSingleObject},
        UI::Shell::{
            ShellExecuteExW, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
        },
    };
    let file: Vec<u16> = artifact.as_os_str().encode_wide().chain(Some(0)).collect();
    let args: Vec<u16> = format!(
        "--updated /S {scope} /D={}",
        target.display().to_string().trim_start_matches(r"\\?\")
    )
    .encode_utf16()
    .chain(Some(0))
    .collect();
    let verb: Vec<u16> = "runas".encode_utf16().chain(Some(0)).collect();
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC,
        lpVerb: verb.as_ptr(),
        lpFile: file.as_ptr(),
        lpParameters: args.as_ptr(),
        nShow: 0,
        ..Default::default()
    };
    unsafe {
        if ShellExecuteExW(&mut info) == 0 {
            return Err(std::io::Error::last_os_error().into());
        }
        ensure!(
            !info.hProcess.is_null(),
            "Windows did not return the installer process."
        );
        let _ = crate::lease::track_installer(windows_sys::Win32::System::Threading::GetProcessId(
            info.hProcess,
        ));
        let wait = WaitForSingleObject(info.hProcess, u32::MAX);
        let mut code = 1;
        let read = GetExitCodeProcess(info.hProcess, &mut code);
        CloseHandle(info.hProcess);
        ensure!(
            wait == WAIT_OBJECT_0 && read != 0 && code == 0,
            "The elevated installer was cancelled or failed (exit {code})."
        );
    }
    Ok(())
}
