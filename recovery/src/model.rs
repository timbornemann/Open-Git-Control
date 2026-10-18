use anyhow::{bail, Result};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

pub const APP_ID: &str = "com.opengitcontrol.app";
pub const PRODUCT: &str = "Open-Git-Control";

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Windows,
    Macos,
    Appimage,
    Deb,
}
impl Kind {
    pub fn platform(self) -> &'static str {
        match self {
            Self::Windows => "windows",
            Self::Macos => "macos",
            Self::Appimage | Self::Deb => "linux",
        }
    }
    pub fn suffix(self) -> &'static str {
        match self {
            Self::Windows => "win-x64.exe",
            Self::Macos => "mac-x64.zip",
            Self::Appimage => "linux-x86_64.AppImage",
            Self::Deb => "linux-amd64.deb",
        }
    }
    pub fn main_executable(self, target: &Path) -> PathBuf {
        match self {
            Self::Windows => target.join("Open-Git-Control.exe"),
            Self::Macos => target.join("Contents/MacOS/Open-Git-Control"),
            Self::Appimage => target.to_owned(),
            Self::Deb => target.join("open-git-control"),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installation {
    pub schema: u32,
    pub app_id: String,
    pub target: PathBuf,
    pub profile: PathBuf,
    pub kind: Kind,
    pub version: Option<Version>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_identity: Option<ImageIdentity>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImageIdentity {
    pub size: u64,
    pub modified_at_ms: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    Update,
    Repair,
    Downgrade,
}
impl Action {
    pub fn validate(self, current: Option<&Version>, target: &Version) -> Result<()> {
        match (self, current) {
            (Self::Repair, Some(version)) if version == target => Ok(()),
            (Self::Repair, _) => bail!("Select the exact installed version for a repair."),
            (Self::Update, Some(version)) if target <= version => bail!("No newer stable version is available. Use Repair or Restore an older version."),
            (Self::Downgrade, Some(version)) if target >= version => bail!("Select an older stable version."),
            (Self::Downgrade, None) => bail!("The installed version is unknown. Select an installation whose version can be verified."),
            _ => Ok(()),
        }
    }
}

#[derive(Clone, Default)]
pub struct Control {
    pub cancel: Arc<AtomicBool>,
    pub force_close: Arc<AtomicBool>,
}
impl Control {
    pub fn check(&self) -> Result<()> {
        if self.cancel.load(Ordering::SeqCst) {
            bail!("Operation cancelled.");
        }
        Ok(())
    }
}

#[derive(Clone, Debug)]
pub struct Progress {
    pub phase: &'static str,
    pub completed: u64,
    pub total: u64,
    pub message: String,
}
impl Progress {
    pub fn phase(phase: &'static str, message: impl Into<String>) -> Self {
        Self {
            phase,
            completed: 0,
            total: 0,
            message: message.into(),
        }
    }
}
pub type Report = dyn Fn(Progress) + Send + Sync;
