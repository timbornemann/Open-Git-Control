#[cfg(target_os = "macos")]
use crate::platform;
use crate::{installation, model::Installation, safe_io};
#[cfg(target_os = "linux")]
use anyhow::ensure;
use anyhow::{Context, Result};
use std::{
    fs,
    path::{Path, PathBuf},
};

/// A retained versioned copy survives replacement or downgrade of the main app.
pub fn stage(root: &Path) -> Result<PathBuf> {
    let current = std::env::current_exe()?.canonicalize()?;
    let fingerprint = file_hash(&current)?;
    let directory = root
        .join("bin")
        .join(env!("CARGO_PKG_VERSION"))
        .join(&fingerprint[..32]);
    safe_io::private_dir(&directory)?;
    let name = if cfg!(windows) {
        "Open-Git-Control-Recovery.exe"
    } else {
        "open-git-control-recovery"
    };
    let destination = directory.join(name);
    safe_io::within(root, &destination)?;
    if current == destination.canonicalize().unwrap_or_default() {
        return Ok(destination);
    }
    if destination.exists() {
        safe_io::no_link(&destination)?;
        if fingerprint == file_hash(&destination)? {
            return Ok(destination);
        }
    }
    let mut input = fs::File::open(&current)?;
    let mut temporary = tempfile::NamedTempFile::new_in(&directory)?;
    std::io::copy(&mut input, &mut temporary)?;
    temporary.as_file().sync_all()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(temporary.path(), fs::Permissions::from_mode(0o700))?;
    }
    temporary.persist(&destination).map_err(|e| e.error)?;
    Ok(destination)
}
fn file_hash(path: &Path) -> Result<String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut file = fs::File::open(path)?;
    let mut hash = Sha256::new();
    let mut buffer = [0; 65536];
    loop {
        let size = file.read(&mut buffer)?;
        if size == 0 {
            break;
        }
        hash.update(&buffer[..size]);
    }
    Ok(hex::encode(hash.finalize()))
}
pub fn register(root: &Path, app: &Installation, helper: &Path) -> Result<()> {
    installation::register(root, app)?;
    #[cfg(windows)]
    windows_shortcut(helper)?;
    #[cfg(target_os = "macos")]
    macos_shortcut(helper)?;
    #[cfg(target_os = "linux")]
    linux_shortcut(helper)?;
    Ok(())
}

#[cfg(windows)]
fn windows_shortcut(helper: &Path) -> Result<()> {
    use windows::{
        core::{Interface, HSTRING},
        Win32::{
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile,
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
            },
            UI::Shell::{IShellLinkW, ShellLink},
        },
    };
    let base = directories::BaseDirs::new().context("Cannot locate the Start menu.")?;
    let directory = base
        .config_dir()
        .join("Microsoft/Windows/Start Menu/Programs");
    safe_io::private_dir(&directory)?;
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()?;
        let result = (|| -> Result<()> {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            link.SetPath(&HSTRING::from(helper.as_os_str()))?;
            link.SetDescription(&HSTRING::from(
                "Update, repair or restore Open-Git-Control independently",
            ))?;
            let persist: IPersistFile = link.cast()?;
            persist.Save(
                &HSTRING::from(directory.join("Open-Git-Control Recovery.lnk").as_os_str()),
                true,
            )?;
            Ok(())
        })();
        CoUninitialize();
        result
    }
}
#[cfg(target_os = "macos")]
fn macos_shortcut(helper: &Path) -> Result<()> {
    let base = directories::BaseDirs::new().context("Cannot locate Applications.")?;
    let bundle = base
        .home_dir()
        .join("Applications/Open-Git-Control Recovery.app");
    let binary = bundle.join("Contents/MacOS/open-git-control-recovery");
    safe_io::private_dir(binary.parent().unwrap())?;
    let mut temp = tempfile::NamedTempFile::new_in(binary.parent().unwrap())?;
    std::io::copy(&mut fs::File::open(helper)?, &mut temp)?;
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(temp.path(), fs::Permissions::from_mode(0o755))?;
    temp.persist(&binary).map_err(|e| e.error)?;
    let mut dictionary = plist::Dictionary::new();
    for (key, value) in [
        ("CFBundleIdentifier", "com.opengitcontrol.recovery"),
        ("CFBundleName", "Open-Git-Control Recovery"),
        ("CFBundlePackageType", "APPL"),
        ("CFBundleExecutable", "open-git-control-recovery"),
        ("CFBundleShortVersionString", env!("CARGO_PKG_VERSION")),
    ] {
        dictionary.insert(key.into(), value.into());
    }
    plist::Value::Dictionary(dictionary).to_file_xml(bundle.join("Contents/Info.plist"))?;
    // Registration uses the OS's own tool and never changes Gatekeeper settings.
    let tool = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
    if Path::new(tool).is_file() {
        platform::command(tool).arg("-f").arg(&bundle).status()?;
    }
    Ok(())
}
#[cfg(target_os = "linux")]
fn linux_shortcut(helper: &Path) -> Result<()> {
    let base = directories::BaseDirs::new().context("Cannot locate the application menu.")?;
    let directory = base.data_dir().join("applications");
    safe_io::private_dir(&directory)?;
    let file = directory.join("open-git-control-recovery.desktop");
    let path = desktop_quote(helper)?;
    fs::write(&file, format!("[Desktop Entry]\nType=Application\nName=Open-Git-Control Recovery\nName[de]=Open-Git-Control Notfall-Updater\nComment=Update, repair or restore Open-Git-Control\nExec={path}\nTerminal=false\nCategories=Development;\n"))?;
    Ok(())
}
#[cfg(target_os = "linux")]
fn desktop_quote(path: &Path) -> Result<String> {
    let value = path.to_str().context("The launcher path is not UTF-8.")?;
    ensure!(!value.contains(['\r', '\n', '\0']), "Unsafe launcher path.");
    Ok(format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('`', "\\`")
            .replace('$', "\\$")
            .replace('%', "%%")
    ))
}
