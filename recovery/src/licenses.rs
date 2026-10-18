use crate::safe_io;
#[cfg(windows)]
use anyhow::ensure;
use anyhow::Result;
use std::{io::Write, path::Path};
pub const TEXT: &str = include_str!(concat!(env!("OUT_DIR"), "/RECOVERY_NOTICES.txt"));
pub fn show(root: &Path) -> Result<()> {
    let directory = root.join("licenses").join(env!("CARGO_PKG_VERSION"));
    safe_io::private_dir(&directory)?;
    let file = directory.join("Recovery-Licenses.txt");
    safe_io::within(root, &file)?;
    let mut temporary = tempfile::NamedTempFile::new_in(&directory)?;
    temporary.write_all(TEXT.as_bytes())?;
    temporary.as_file().sync_all()?;
    temporary.persist(&file).map_err(|e| e.error)?;
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let value: Vec<u16> = file.as_os_str().encode_wide().chain(Some(0)).collect();
        let verb: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
        let result = unsafe {
            windows_sys::Win32::UI::Shell::ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                value.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        };
        ensure!(
            result as isize > 32,
            "The license text could not be opened. It is saved in {}",
            file.display()
        );
    }
    #[cfg(target_os = "macos")]
    {
        crate::platform::command("/usr/bin/open")
            .arg(&file)
            .spawn()?;
    }
    #[cfg(target_os = "linux")]
    {
        crate::platform::command("/usr/bin/xdg-open")
            .arg(&file)
            .spawn()?;
    }
    Ok(())
}
