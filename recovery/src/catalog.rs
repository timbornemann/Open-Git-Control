use crate::{model::Control, policy};
use anyhow::{ensure, Context, Result};
use reqwest::{header, Client, RequestBuilder, Response};
use semver::Version;
use serde::Deserialize;
use std::{future::Future, time::Duration};
use url::Url;

#[derive(Clone, Debug, Deserialize)]
pub struct Release {
    pub tag_name: String,
    pub draft: bool,
    pub prerelease: bool,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub assets: Vec<Asset>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Asset {
    pub name: String,
    pub size: u64,
    pub browser_download_url: String,
    pub state: String,
}
impl Release {
    pub fn version(&self) -> Result<Version> {
        ensure!(
            !self.draft && !self.prerelease,
            "Only published stable releases can be installed."
        );
        ensure!(
            self.published_at.as_deref().is_some_and(|v| !v.is_empty()),
            "This release has not been published."
        );
        policy::stable(
            self.tag_name
                .strip_prefix('v')
                .context("Invalid release tag.")?,
        )
    }
    pub fn asset(&self, name: &str, expected_size: Option<u64>) -> Result<&Asset> {
        let version = self.version()?;
        let matches: Vec<_> = self.assets.iter().filter(|a| a.name == name).collect();
        ensure!(
            matches.len() == 1,
            "The release is incomplete or contains duplicate assets: {name}"
        );
        let asset = matches[0];
        ensure!(
            asset.state == "uploaded"
                && asset.size > 0
                && expected_size.is_none_or(|size| size == asset.size)
                && asset.browser_download_url == policy::asset_url(&version, name)?.as_str(),
            "The release asset does not match the official metadata."
        );
        Ok(asset)
    }
}

pub struct Network {
    http: Client,
    runtime: tokio::runtime::Runtime,
    api_authorization: Option<header::HeaderValue>,
}
impl Network {
    fn request(&self, url: Url, timeout: Duration) -> RequestBuilder {
        // Never put API credentials in client-wide default headers: release
        // assets redirect to separate download hosts and must remain anonymous.
        let authorized = policy::allowed_api(&url);
        let mut request = self
            .http
            .get(url)
            .header(header::ACCEPT, "application/vnd.github+json")
            .timeout(timeout);
        if let Some(value) = self.api_authorization.as_ref().filter(|_| authorized) {
            request = request.header(header::AUTHORIZATION, value.clone());
        }
        request
    }

    fn wait<T>(
        &self,
        future: impl Future<Output = reqwest::Result<T>>,
        control: &Control,
    ) -> Result<T> {
        self.runtime.block_on(async { tokio::pin!(future); loop { control.check()?;
            tokio::select! { value = &mut future => return Ok(value?), _ = tokio::time::sleep(Duration::from_millis(100)) => {} }
        } })
    }
    fn get(&self, url: Url, timeout: Duration, control: &Control) -> Result<Response> {
        // reqwest creates its timeout when send() is called, so construct the
        // request future inside the owned runtime, not before block_on().
        self.wait(async { self.request(url, timeout).send().await }, control)
    }
    pub fn chunk(&self, response: &mut Response, control: &Control) -> Result<Option<Vec<u8>>> {
        Ok(self
            .wait(response.chunk(), control)?
            .map(|bytes| bytes.to_vec()))
    }
}

pub fn client() -> Result<Network> {
    client_with_token(std::env::var("OGC_RECOVERY_GITHUB_TOKEN").ok().as_deref())
}
fn client_with_token(token: Option<&str>) -> Result<Network> {
    let api_authorization = token
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(|token| {
            let mut value = header::HeaderValue::from_str(&format!("Bearer {token}"))
                .context("Invalid recovery GitHub API authorization header.")?;
            value.set_sensitive(true);
            Ok::<_, anyhow::Error>(value)
        })
        .transpose()?;
    let http = Client::builder()
        .user_agent(concat!(
            "Open-Git-Control-Recovery/",
            env!("CARGO_PKG_VERSION")
        ))
        .redirect(reqwest::redirect::Policy::none())
        .https_only(true)
        .connect_timeout(Duration::from_secs(10))
        .read_timeout(Duration::from_secs(30))
        .build()?;
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    Ok(Network {
        http,
        runtime,
        api_authorization,
    })
}
pub fn api<T: serde::de::DeserializeOwned>(
    client: &Network,
    url: Url,
    control: &Control,
) -> Result<T> {
    control.check()?;
    ensure!(policy::allowed_api(&url), "Unapproved release API address.");
    let response = client.get(url, Duration::from_secs(45), control)?;
    let text = bounded(client, response, 8 * 1024 * 1024, control)?;
    serde_json::from_slice(&text).context("Invalid release response.")
}
pub fn releases(client: &Network, page: u32, control: &Control) -> Result<(Vec<Release>, bool)> {
    let all: Vec<Release> = api(
        client,
        policy::api_url(&format!("releases?per_page=50&page={page}")),
        control,
    )?;
    let more = all.len() == 50 && page < 1000;
    Ok((
        all.into_iter().filter(|r| r.version().is_ok()).collect(),
        more,
    ))
}
pub fn release(client: &Network, version: &Version, control: &Control) -> Result<Release> {
    let release: Release = api(
        client,
        policy::api_url(&format!("releases/tags/v{version}")),
        control,
    )?;
    ensure!(
        release.version()? == *version,
        "The release response changed the selected version."
    );
    Ok(release)
}
pub fn latest(client: &Network, control: &Control) -> Result<Release> {
    let release: Release = api(client, policy::api_url("releases/latest"), control)?;
    release.version()?;
    Ok(release)
}
pub fn asset_response(client: &Network, initial: Url, control: &Control) -> Result<Response> {
    let mut url = initial.clone();
    for _ in 0..=5 {
        control.check()?;
        ensure!(
            policy::allowed_redirect(&url, &initial),
            "The download left the official release source."
        );
        let response = client.get(url.clone(), Duration::from_secs(15 * 60), control)?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .context("Missing download redirect.")?
                .to_str()?;
            url = url.join(location)?;
        } else {
            ensure!(response.status().is_success(), "Release download failed (HTTP {}). The release may still be publishing; try again later.", response.status().as_u16());
            return Ok(response);
        }
    }
    anyhow::bail!("Too many download redirects.")
}
fn bounded(
    client: &Network,
    mut response: Response,
    limit: u64,
    control: &Control,
) -> Result<Vec<u8>> {
    ensure!(
        response.status().is_success(),
        "Release request failed (HTTP {}). Check your connection or try again later.",
        response.status().as_u16()
    );
    ensure!(
        response.content_length().is_none_or(|n| n <= limit),
        "Release response is too large."
    );
    let mut bytes = Vec::new();
    while let Some(chunk) = client.chunk(&mut response, control)? {
        ensure!(
            (bytes.len() + chunk.len()) as u64 <= limit,
            "Release response is too large."
        );
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}
pub fn manifest(
    client: &Network,
    release: &Release,
    platform: &str,
    control: &Control,
) -> Result<policy::Manifest> {
    let version = release.version()?;
    let source = policy::source();
    let feed = &source
        .platforms
        .get(platform)
        .context("Unsupported platform.")?
        .feed;
    release.asset(feed, None)?;
    let response = asset_response(client, policy::asset_url(&version, feed)?, control)?;
    let bytes = bounded(client, response, 1024 * 1024, control)?;
    let text = std::str::from_utf8(&bytes).context("Release metadata is not valid UTF-8.")?;
    let manifest = policy::manifest(text, platform, &version)?;
    for file in &manifest.files {
        release.asset(&file.url, Some(file.size))?;
    }
    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn creates_request_timeouts_inside_the_owned_reactor() {
        let client = client().unwrap();
        // A refused loopback port exercises request construction without an
        // external network dependency. Previously this panicked before connect.
        assert!(client
            .get(
                Url::parse("https://127.0.0.1:0").unwrap(),
                Duration::from_secs(1),
                &Control::default()
            )
            .is_err());
    }

    #[test]
    fn scopes_optional_credentials_to_the_official_release_api() {
        let network = client_with_token(Some("test-token")).unwrap();
        let request = |url| {
            network
                .request(url, Duration::from_secs(1))
                .build()
                .unwrap()
        };
        let api = request(policy::api_url("releases/tags/v3.0.5"));
        let value = api.headers().get(header::AUTHORIZATION).unwrap();
        assert_eq!(value, "Bearer test-token");
        assert!(value.is_sensitive());
        for url in [
            policy::asset_url(&Version::new(3, 0, 5), "latest.yml").unwrap(),
            Url::parse("https://release-assets.githubusercontent.com/download").unwrap(),
            Url::parse("https://api.github.com/repos/other/project/releases").unwrap(),
            Url::parse("https://example.com/releases").unwrap(),
        ] {
            assert!(!request(url).headers().contains_key(header::AUTHORIZATION));
        }
        let anonymous = client_with_token(None).unwrap();
        assert!(!anonymous
            .request(policy::api_url("releases/latest"), Duration::from_secs(1))
            .build()
            .unwrap()
            .headers()
            .contains_key(header::AUTHORIZATION));
        assert!(client_with_token(Some("invalid\nheader")).is_err());
    }
}
