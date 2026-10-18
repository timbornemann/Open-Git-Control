use crate::model::{Installation, Kind};
use anyhow::{ensure, Result};
use std::fs;

/// Official installers may remove unowned files inside their program folder.
/// Protect embedded repositories and redirected Windows directories explicitly.
pub fn protect(app: &Installation) -> Result<()> {
    if app.kind == Kind::Appimage || !app.target.exists() {
        return Ok(());
    }
    #[cfg(windows)]
    if let Some(windows) = std::env::var_os("SystemRoot") {
        let system = std::path::PathBuf::from(windows).canonicalize()?;
        ensure!(
            !app.target.starts_with(system),
            "A Windows system folder cannot be a recovery destination."
        );
    }
    let mut pending = vec![app.target.clone()];
    let mut count = 0u64;
    while let Some(directory) = pending.pop() {
        ensure!(!(directory.join("HEAD").is_file() && directory.join("objects").is_dir() && (directory.join("refs").is_dir() || directory.join("packed-refs").is_file())),"A bare Git repository is inside the program folder ({}). Move it outside the installation before recovery.",directory.display());
        count += 1;
        ensure!(count<=100_000,"The program folder contains too many directories to inspect safely. Choose a dedicated app installation folder.");
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let path = entry.path();
            ensure!(!entry.file_name().to_string_lossy().eq_ignore_ascii_case("settings.json"),"An app data/settings folder is inside the program folder ({}). Move the data profile outside the installation before recovery; it will not be deleted.",path.display());
            ensure!(!entry.file_name().to_string_lossy().eq_ignore_ascii_case(".git"),"A Git repository is inside the installation folder ({}). Move the repository outside the program folder before recovery; it will not be removed or reset.",path.display());
            let metadata = fs::symlink_metadata(&path)?;
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                ensure!(metadata.file_attributes()&0x400==0,"The Windows program folder contains a redirected entry ({}). It was left untouched.",path.display());
            }
            if metadata.is_dir() && !metadata.file_type().is_symlink() {
                pending.push(path);
            }
        }
    }
    Ok(())
}
