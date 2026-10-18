#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

mod cli;
#[cfg(feature = "gui")]
mod gui;
use anyhow::Result;
use ogc_recovery::{installation, safe_io, shortcuts};

fn main() {
    if let Err(error) = run() {
        eprintln!("Open-Git-Control Recovery: {error:#}");
        #[cfg(feature = "gui")]
        {
            let silent = std::env::args_os().skip(1).any(|arg| {
                [
                    "--register-only",
                    "--inspect-only",
                    "--licenses",
                    "--smoke-test",
                ]
                .iter()
                .any(|flag| arg == *flag)
            });
            if !silent {
                let _ = rfd::MessageDialog::new().set_title("Open-Git-Control Recovery").set_description(format!("Recovery could not start / Wiederherstellung konnte nicht starten.\n\n{error:#}")).set_level(rfd::MessageLevel::Error).show();
            }
        }
        std::process::exit(1);
    }
}
fn run() -> Result<()> {
    let options = cli::Options::parse(std::env::args_os().skip(1))?;
    if options.licenses {
        println!("{}", ogc_recovery::licenses::TEXT);
        return Ok(());
    }
    if options.inspect_only {
        let app = installation::inspect(
            options.installation.as_ref().unwrap(),
            options.profile.as_deref(),
            None,
        )?;
        println!("{}", serde_json::to_string(&app)?);
        return Ok(());
    }
    if options.smoke_test {
        #[cfg(feature = "gui")]
        return gui::smoke();
        #[cfg(not(feature = "gui"))]
        anyhow::bail!("The graphical interface was not compiled.");
    }
    let root = safe_io::root()?;
    // The launched executable must survive replacing or removing the app folder.
    // Versioned copies remain available after a downgrade to pre-recovery releases.
    let helper = shortcuts::stage(&root)?;
    if std::env::current_exe()?.canonicalize()? != helper.canonicalize()? {
        ogc_recovery::platform::command(helper)
            .args(std::env::args_os().skip(1))
            .spawn()?;
        return Ok(());
    }
    if options.register_only {
        let app = installation::resolve(
            &root,
            options.installation.as_ref().unwrap(),
            options.profile.as_deref(),
            None,
        )?;
        return shortcuts::register(&root, &app, &helper);
    }
    #[cfg(feature = "gui")]
    return gui::run(options, root);
    #[cfg(not(feature = "gui"))]
    anyhow::bail!("The graphical interface was not compiled.");
}
