use anyhow::{bail, ensure, Context, Result};
use std::path::PathBuf;

#[derive(Default, Debug)]
pub struct Options {
    pub installation: Option<PathBuf>,
    pub profile: Option<PathBuf>,
    pub language: Option<String>,
    pub register_only: bool,
    pub smoke_test: bool,
    pub inspect_only: bool,
    pub licenses: bool,
}
impl Options {
    pub fn parse(args: impl IntoIterator<Item = std::ffi::OsString>) -> Result<Self> {
        let mut options = Self::default();
        let mut args = args.into_iter();
        while let Some(argument) = args.next() {
            let flag = argument.to_str().context("Invalid recovery option.")?;
            match flag {
                "--installation" => {
                    ensure!(
                        options.installation.is_none(),
                        "Duplicate installation option."
                    );
                    options.installation =
                        Some(args.next().context("Missing installation path.")?.into());
                }
                "--profile" => {
                    ensure!(options.profile.is_none(), "Duplicate profile option.");
                    options.profile = Some(args.next().context("Missing profile path.")?.into());
                }
                "--language" => {
                    let value = args.next().context("Missing language.")?;
                    let value = value.to_str().context("Invalid language.")?;
                    ensure!(matches!(value, "de" | "en"), "Choose de or en.");
                    options.language = Some(value.into());
                }
                "--register-only" => options.register_only = true,
                "--smoke-test" => options.smoke_test = true,
                "--inspect-only" => options.inspect_only = true,
                "--licenses" => options.licenses = true,
                _ => bail!("Unknown recovery option: {flag}"),
            }
        }
        if options.register_only || options.inspect_only {
            ensure!(
                options.installation.is_some(),
                "Registration requires an installation path."
            );
        }
        for path in [&options.installation, &options.profile]
            .into_iter()
            .flatten()
        {
            ensure!(path.is_absolute(), "Choose an absolute path.");
        }
        Ok(options)
    }
}
