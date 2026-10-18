#![cfg(windows)]
use crate::{
    installation,
    model::{Installation, Kind, APP_ID},
    policy, safe_io,
};
use anyhow::{ensure, Result};
use std::path::{Path, PathBuf};
use winreg::{enums::*, RegKey};

pub struct Record {
    pub target: PathBuf,
    pub scope: &'static str,
    pub version: Option<semver::Version>,
}
pub fn records() -> Vec<Record> {
    let guid = policy::source().windows_installer_guid;
    let mut found = Vec::new();
    for (hive, scope) in [
        (HKEY_CURRENT_USER, "/currentuser"),
        (HKEY_LOCAL_MACHINE, "/allusers"),
    ] {
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            let registry = RegKey::predef(hive);
            if let Ok(key) =
                registry.open_subkey_with_flags(format!("Software\\{guid}"), KEY_READ | view)
            {
                if let Ok(target) = key.get_value::<String, _>("InstallLocation") {
                    let target = PathBuf::from(target);
                    if !target.is_absolute() || target.parent().is_none() {
                        continue;
                    }
                    let target = target.canonicalize().unwrap_or(target);
                    let version = registry
                        .open_subkey_with_flags(
                            format!(
                                "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{guid}"
                            ),
                            KEY_READ | view,
                        )
                        .ok()
                        .and_then(|k| k.get_value::<String, _>("DisplayVersion").ok())
                        .and_then(|v| policy::stable(&v).ok());
                    if !found.iter().any(|r: &Record| {
                        r.scope == scope && safe_io::key(&r.target) == safe_io::key(&target)
                    }) {
                        found.push(Record {
                            target,
                            scope,
                            version,
                        });
                    }
                }
            }
        }
    }
    found
}
pub fn recognized(target: &Path, profile: Option<&Path>) -> Result<Installation> {
    let record = records()
        .into_iter()
        .find(|r| safe_io::key(&r.target) == safe_io::key(target))
        .ok_or_else(|| anyhow::anyhow!("No matching NSIS installation is registered."))?;
    let profile = profile
        .map(Path::to_path_buf)
        .unwrap_or(installation::default_profile()?);
    ensure!(
        profile.is_absolute() && !safe_io::overlaps(&profile, &record.target),
        "Choose a separate app data profile."
    );
    ensure!(
        record.version.is_some(),
        "The registered installation has no verifiable version."
    );
    Ok(Installation {
        schema: 1,
        app_id: APP_ID.into(),
        target: record.target,
        profile,
        kind: Kind::Windows,
        version: record.version,
        image_identity: None,
    })
}
pub fn scope(target: &Path) -> Result<&'static str> {
    choose_scope(target, &records())
}
fn choose_scope(target: &Path, records: &[Record]) -> Result<&'static str> {
    if records
        .iter()
        .any(|r| r.scope == "/currentuser" && safe_io::key(&r.target) == safe_io::key(target))
    {
        return Ok("/currentuser");
    }
    if records
        .iter()
        .any(|r| r.scope == "/allusers" && safe_io::key(&r.target) == safe_io::key(target))
    {
        // electron-builder's all-users installer also uninstalls the current
        // user's copy. Never permit it to remove a different installation.
        ensure!(!records.iter().any(|r|r.scope=="/currentuser"&&safe_io::key(&r.target)!=safe_io::key(target)),"The official system installer would also remove a different per-user installation. Close recovery and resolve those installations separately before continuing.");
        return Ok("/allusers");
    }
    ensure!(!records.iter().any(|r|r.scope=="/currentuser"),"Another per-user installation is registered. Choose that installation; NSIS would otherwise uninstall it while installing into this folder.");
    Ok("/currentuser")
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selects_only_the_registered_scope_and_blocks_collateral_uninstalls() {
        let user = PathBuf::from(r"C:\Users\test\App");
        let system = PathBuf::from(r"C:\Program Files\App");
        let records = vec![
            Record {
                target: user.clone(),
                scope: "/currentuser",
                version: None,
            },
            Record {
                target: system.clone(),
                scope: "/allusers",
                version: None,
            },
        ];
        assert_eq!(choose_scope(&user, &records).unwrap(), "/currentuser");
        assert!(choose_scope(&system, &records).is_err());
        assert!(choose_scope(Path::new(r"C:\other"), &records).is_err());
    }
}
