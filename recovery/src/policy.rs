use anyhow::{bail, ensure, Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use semver::Version;
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};
use url::Url;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub windows_installer_guid: String,
    pub owner: String,
    pub repo: String,
    pub repository_id: u64,
    pub product_name: String,
    pub platforms: BTreeMap<String, Platform>,
}
#[derive(Deserialize)]
pub struct Platform {
    pub feed: String,
    pub artifacts: Vec<String>,
    pub blockmaps: Vec<String>,
}
pub fn source() -> Source {
    serde_json::from_str(include_str!("../../src/shared/updateSource.json"))
        .expect("Bundled update source")
}
pub fn stable(value: &str) -> Result<Version> {
    ensure!(value.len() <= 64, "Invalid stable release version.");
    let version = Version::parse(value).context("Invalid stable release version.")?;
    ensure!(
        version.pre.is_empty() && version.build.is_empty() && version.to_string() == value,
        "Only stable x.y.z releases are supported."
    );
    Ok(version)
}
pub fn name(version: &Version, suffix: &str) -> String {
    format!("{}-{version}-{suffix}", source().product_name)
}
pub fn asset_url(version: &Version, asset: &str) -> Result<Url> {
    let source = source();
    let allowed = source
        .platforms
        .values()
        .any(|p| p.feed == asset || p.artifacts.iter().any(|s| name(version, s) == asset));
    ensure!(allowed, "Unapproved release asset.");
    Ok(Url::parse(&format!(
        "https://github.com/{}/{}/releases/download/v{version}/{asset}",
        source.owner, source.repo
    ))?)
}
pub fn api_url(path: &str) -> Url {
    let s = source();
    Url::parse(&format!(
        "https://api.github.com/repos/{}/{}/{path}",
        s.owner, s.repo
    ))
    .expect("Official API")
}
pub fn allowed_api(url: &Url) -> bool {
    let s = source();
    let base = format!("/repos/{}/{}/releases", s.owner, s.repo);
    if !secure(url) || url.host_str() != Some("api.github.com") {
        return false;
    }
    if url.path() == base {
        let pairs: Vec<_> = url.query_pairs().collect();
        return pairs.len() == 2
            && pairs[0].0 == "per_page"
            && pairs[0].1 == "50"
            && pairs[1].0 == "page"
            && pairs[1]
                .1
                .parse::<u32>()
                .is_ok_and(|n| (1..=1000).contains(&n));
    }
    if url.path() == format!("{base}/latest") {
        return url.query().is_none();
    }
    url.query().is_none()
        && url
            .path()
            .strip_prefix(&format!("{base}/tags/v"))
            .is_some_and(|v| stable(v).is_ok())
}
fn secure(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.fragment().is_none()
}
pub fn allowed_redirect(url: &Url, initial: &Url) -> bool {
    if !secure(url) || !official_asset(initial) {
        return false;
    }
    if url == initial {
        return true;
    }
    let hosts = [
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
        "github-releases.githubusercontent.com",
    ];
    if !url.host_str().is_some_and(|h| hosts.contains(&h)) {
        return false;
    }
    let parts: Vec<_> = url.path().split('/').collect();
    parts.len() == 4
        && parts[0].is_empty()
        && [
            "github-production-release-asset",
            "github-production-release-asset-2e65be",
        ]
        .contains(&parts[1])
        && parts[2] == source().repository_id.to_string()
        && uuid::Uuid::parse_str(parts[3])
            .is_ok_and(|id| id.hyphenated().to_string().eq_ignore_ascii_case(parts[3]))
}
fn official_asset(url: &Url) -> bool {
    let source = source();
    let prefix = format!("/{}/{}/releases/download/v", source.owner, source.repo);
    if !secure(url) || url.host_str() != Some("github.com") || url.query().is_some() {
        return false;
    }
    let Some((version, file)) = url
        .path()
        .strip_prefix(&prefix)
        .and_then(|p| p.split_once('/'))
    else {
        return false;
    };
    stable(version).is_ok_and(|v| asset_url(&v, file).is_ok_and(|expected| expected == *url))
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct File {
    pub url: String,
    pub sha512: String,
    pub size: u64,
    pub block_map_size: Option<u64>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub version: String,
    pub files: Vec<File>,
    pub path: String,
    pub sha512: String,
    pub packages: Option<serde_yaml::Value>,
    pub tag: Option<String>,
}
pub fn digest(value: &str) -> Result<Vec<u8>> {
    let bytes = STANDARD
        .decode(value)
        .context("Invalid SHA-512 checksum.")?;
    ensure!(
        bytes.len() == 64 && STANDARD.encode(&bytes) == value,
        "Invalid SHA-512 checksum."
    );
    Ok(bytes)
}
pub fn manifest(text: &str, platform: &str, version: &Version) -> Result<Manifest> {
    ensure!(text.len() <= 1024 * 1024, "Release metadata is too large.");
    // Reject aliases before a deserializer can expand them. Quoted release
    // notes containing '&' or '*' are ordinary scalar tokens.
    use yaml_rust2::scanner::{Scanner, Token, TokenType};
    let mut scanner = Scanner::new(text.chars());
    for Token(_, token) in scanner.by_ref() {
        ensure!(
            !matches!(token, TokenType::Alias(_) | TokenType::Anchor(_)),
            "Release metadata must not contain YAML aliases or anchors."
        );
    }
    ensure!(scanner.get_error().is_none(), "Invalid release YAML.");
    // Parse through Value first: duplicate mapping keys are rejected before deserializing.
    let value: serde_yaml::Value =
        serde_yaml::from_str(text).context("Invalid release metadata.")?;
    ensure!(
        !value
            .as_mapping()
            .is_some_and(|m| m.contains_key(serde_yaml::Value::String("tag".into()))),
        "Release metadata must not override the release tag."
    );
    let m: Manifest = serde_yaml::from_value(value)?;
    ensure!(
        stable(&m.version)? == *version && m.tag.is_none() && m.packages.is_none(),
        "Release metadata does not match the selected stable tag."
    );
    let s = source();
    let p = s.platforms.get(platform).context("Unsupported platform.")?;
    let expected: BTreeSet<_> = p
        .artifacts
        .iter()
        .map(|suffix| name(version, suffix))
        .collect();
    let mut seen = BTreeSet::new();
    for f in &m.files {
        ensure!(
            expected.contains(&f.url) && seen.insert(f.url.clone()),
            "Unexpected or duplicate release file."
        );
        ensure!(
            f.size > 0 && f.size <= 9_007_199_254_740_991,
            "Invalid release file size."
        );
        digest(&f.sha512)?;
        if let Some(size) = f.block_map_size {
            ensure!(
                f.url.ends_with(".AppImage")
                    && size > 0
                    && size <= 4 * 1024 * 1024
                    && size < f.size.saturating_sub(4),
                "Invalid blockmap size."
            );
        }
    }
    ensure!(
        seen == expected,
        "The release is incomplete for this platform."
    );
    let main = m
        .files
        .iter()
        .find(|f| f.url == m.path)
        .context("Invalid primary release file.")?;
    if m.sha512 != main.sha512 {
        bail!("Inconsistent release checksums.");
    }
    Ok(m)
}
