use super::RecoveryWindow;
use ogc_recovery::{
    job,
    model::{Action, Control, Installation, Progress},
};
use semver::Version;
use slint::{ModelRc, SharedString, VecModel};
use std::{path::PathBuf, sync::mpsc::Sender};

pub struct Prepared {
    pub app: Installation,
    pub action: Action,
    pub version: Version,
    pub size: u64,
}
type CatalogResult = Result<(Version, Vec<Version>, bool), String>;
pub enum Event {
    Discovered(Vec<Installation>, Option<usize>),
    Catalog(u32, CatalogResult),
    Chosen(Result<Option<Installation>, String>),
    Prepared(Result<Prepared, String>),
    Progress(Progress),
    Finished(Result<Installation, String>),
    Error(String),
    Prior(u64, bool),
}
pub struct Data {
    pub root: PathBuf,
    pub apps: Vec<Installation>,
    pub selected: Option<usize>,
    pub latest: Option<Version>,
    pub versions: Vec<Version>,
    pub older: Vec<Version>,
    pub page: u32,
    pub prepared: Option<Prepared>,
    pub send: Sender<Event>,
    pub control: Control,
    pub catalog_control: Control,
    prior_context: Option<(PathBuf, PathBuf)>,
    prior_request: u64,
}
impl Data {
    pub fn new(root: PathBuf, send: Sender<Event>) -> Self {
        Self {
            root,
            apps: vec![],
            selected: None,
            latest: None,
            versions: vec![],
            older: vec![],
            page: 0,
            prepared: None,
            send,
            control: Control::default(),
            catalog_control: Control::default(),
            prior_context: None,
            prior_request: 0,
        }
    }
    pub fn app(&self) -> Option<&Installation> {
        self.selected.and_then(|i| self.apps.get(i))
    }
}
pub fn tr(w: &RecoveryWindow, de: &str, en: &str) -> SharedString {
    if w.get_de() {
        de.into()
    } else {
        en.into()
    }
}
pub fn action(index: i32) -> Action {
    match index {
        1 => Action::Repair,
        2 => Action::Downgrade,
        _ => Action::Update,
    }
}
pub fn target(w: &RecoveryWindow, d: &Data) -> Option<Version> {
    match action(w.get_action()) {
        Action::Update => d.latest.clone(),
        Action::Repair => d.app().and_then(|a| a.version.clone()),
        Action::Downgrade => usize::try_from(w.get_version_index())
            .ok()
            .and_then(|i| d.older.get(i).cloned()),
    }
}
pub fn error(w: &RecoveryWindow, detail: &str) {
    if detail.contains("Operation cancelled.") {
        w.set_error(false);
        w.set_status(tr(
            w,
            "Vorgang abgebrochen. Protokolle und fertige Sicherungen bleiben erhalten.",
            "Operation cancelled. Logs and completed backups are retained.",
        ));
        w.set_detail("".into());
        return;
    }
    w.set_error(true);
    w.set_status(tr(
        w,
        "Vorgang nicht abgeschlossen. Details prüfen und erneut versuchen.",
        "The operation did not complete. Check the details and retry.",
    ));
    w.set_detail(detail.into());
    w.set_show_details(true);
}
pub fn refresh(w: &RecoveryWindow, d: &mut Data) {
    let entries = d
        .apps
        .iter()
        .map(|a| {
            SharedString::from(format!(
                "{} · {}",
                a.version
                    .as_ref()
                    .map(ToString::to_string)
                    .unwrap_or_else(|| "?".into()),
                a.target.display()
            ))
        })
        .collect::<Vec<_>>();
    w.set_installations(ModelRc::new(VecModel::from(entries)));
    w.set_installation_index(d.selected.map(|i| i as i32).unwrap_or(-1));
    let selected_version = usize::try_from(w.get_version_index())
        .ok()
        .and_then(|i| d.older.get(i))
        .cloned();
    let app = d.app().cloned();
    d.older = d
        .versions
        .iter()
        .filter(|v| {
            app.as_ref()
                .and_then(|a| a.version.as_ref())
                .is_some_and(|current| *v < current)
        })
        .cloned()
        .collect();
    w.set_versions(ModelRc::new(VecModel::from(
        d.older
            .iter()
            .map(|v| SharedString::from(v.to_string()))
            .collect::<Vec<_>>(),
    )));
    // Restoring an older version always requires an explicit selection.
    w.set_version_index(
        selected_version
            .and_then(|v| d.older.iter().position(|o| o == &v))
            .map(|i| i as i32)
            .unwrap_or(-1),
    );
    if let Some(app) = app {
        w.set_installation_path(app.target.display().to_string().into());
        w.set_profile_path(app.profile.display().to_string().into());
        w.set_installed_version(
            app.version
                .as_ref()
                .map(ToString::to_string)
                .unwrap_or_else(|| tr(w, "Unbekannt", "Unknown").to_string())
                .into(),
        );
        let context = (app.target.clone(), app.profile.clone());
        if d.prior_context.as_ref() != Some(&context) {
            d.prior_context = Some(context);
            d.prior_request += 1;
            w.set_notice("".into());
            let request = d.prior_request;
            let root = d.root.clone();
            let tx = d.send.clone();
            let previous_app = app.clone();
            std::thread::spawn(move || {
                let interrupted =
                    job::previous(&root, &previous_app).is_some_and(|j| j.phase != "complete");
                let _ = tx.send(Event::Prior(request, interrupted));
            });
        }
        let version = target(w, d);
        w.set_target_version(
            version
                .as_ref()
                .map(ToString::to_string)
                .unwrap_or_else(|| "—".into())
                .into(),
        );
        w.set_can_review(version.is_some_and(|v| {
            action(w.get_action())
                .validate(app.version.as_ref(), &v)
                .is_ok()
        }));
        if !w.get_busy()
            && !w.get_confirm()
            && !w.get_complete()
            && w.get_action() == 0
            && app
                .version
                .as_ref()
                .zip(d.latest.as_ref())
                .is_some_and(|(current, latest)| current >= latest)
        {
            w.set_status(tr(w,"Keine neuere stabile Version verfügbar. Bei Problemen „Installation reparieren“ wählen.","No newer stable version is available. Choose Repair installation if the app has problems."));
        }
    } else {
        w.set_installed_version("—".into());
        w.set_target_version("—".into());
        w.set_can_review(false);
        w.set_notice(tr(w, "Bitte eine Installation auswählen. Wenn mehrere gefunden wurden, wird keine automatisch verändert.", "Choose an installation. When several are found, none is selected automatically."));
    }
}
pub fn apply(w: &RecoveryWindow, d: &mut Data, event: Event) {
    match event {
        Event::Discovered(apps, explicit) => {
            if d.selected.is_some() || w.get_busy() || w.get_confirm() || w.get_complete() {
                for app in apps {
                    if !d.apps.iter().any(|a| {
                        ogc_recovery::safe_io::key(&a.target)
                            == ogc_recovery::safe_io::key(&app.target)
                    }) {
                        d.apps.push(app);
                    }
                }
                return;
            }
            d.apps = apps;
            d.selected = explicit.or_else(|| (d.apps.len() == 1).then_some(0));
            refresh(w, d);
            if !w.get_error() && (w.get_can_review() || d.latest.is_none() || d.selected.is_none())
            {
                w.set_status(tr(
                    w,
                    "Version und Aktion auswählen.",
                    "Choose a version and action.",
                ));
            }
        }
        Event::Catalog(page, result) => {
            w.set_catalog_loading(false);
            match result {
                Ok((latest, versions, more)) => {
                    if page == 1 {
                        d.versions.clear();
                    }
                    d.page = page;
                    d.latest = Some(latest);
                    d.versions.extend(versions);
                    d.versions.sort_by(|a, b| b.cmp(a));
                    d.versions.dedup();
                    w.set_has_more(more);
                    if !w.get_confirm() && !w.get_complete() {
                        refresh(w, d);
                    }
                }
                Err(e) => {
                    if !w.get_busy() {
                        error(w, &e);
                    }
                }
            }
        }
        Event::Chosen(result) => {
            w.set_busy(false);
            match result {
                Ok(Some(app)) => {
                    let i = d
                        .apps
                        .iter()
                        .position(|a| a.target == app.target)
                        .unwrap_or(d.apps.len());
                    if i == d.apps.len() {
                        d.apps.push(app);
                    } else {
                        d.apps[i] = app;
                    }
                    d.selected = Some(i);
                    refresh(w, d);
                }
                Ok(None) => {}
                Err(e) => error(w, &e),
            }
        }
        Event::Prepared(result) => {
            w.set_busy(false);
            w.set_can_cancel(false);
            match result {
                Ok(p) => {
                    let installed = p
                        .app
                        .version
                        .as_ref()
                        .map(ToString::to_string)
                        .unwrap_or_else(|| tr(w, "Unbekannt", "Unknown").to_string());
                    let text = if w.get_de() {
                        format!("Installation: {}\n\nInstalliert: {}\nZielversion: {}\nDownload: {:.1} MB\n\nDatenordner: {}{}", p.app.target.display(), installed, p.version, p.size as f64 / 1_000_000.0, p.app.profile.display(), if p.action == Action::Downgrade { "\n\nAutomatische Downloads werden pausiert, bis du sie in den App-Einstellungen wieder aktivierst." } else { "" })
                    } else {
                        format!("Installation: {}\n\nInstalled: {}\nTarget version: {}\nDownload: {:.1} MB\n\nData folder: {}{}", p.app.target.display(), installed, p.version, p.size as f64 / 1_000_000.0, p.app.profile.display(), if p.action == Action::Downgrade { "\n\nAutomatic downloads will be paused until you enable them again in app settings." } else { "" })
                    };
                    let unknown = if p.app.version.is_none() {
                        tr(w,"\n\nDie installierte Version ist nicht lesbar. Du bestätigst ausdrücklich die angezeigte Zielversion; automatische Downloads werden vorsichtshalber pausiert.","\n\nThe installed version cannot be read. You explicitly confirm the displayed target version; automatic downloads will be paused as a precaution.")
                    } else {
                        "".into()
                    };
                    w.set_summary(format!("{text}{unknown}").into());
                    w.set_confirm(true);
                    w.set_status(tr(w, "Bereit zur Installation.", "Ready to install."));
                    w.set_detail("".into());
                    w.set_error(false);
                    d.prepared = Some(p);
                }
                Err(e) => error(w, &e),
            }
        }
        Event::Progress(p) => {
            let (de, en) = match p.phase {
                "prepare" => ("Veröffentlichung prüfen", "Checking release"),
                "download" => (
                    "Paket herunterladen und prüfen",
                    "Downloading and verifying package",
                ),
                "verify" => ("Prüfsumme prüfen", "Verifying checksum"),
                "close" | "waiting-for-app" => ("App schließen", "Closing app"),
                "backup" => ("Nutzerdaten sichern", "Backing up user data"),
                "install" | "install-wait" => (
                    "Installieren – Betriebssystemdialoge beachten",
                    "Installing – check operating-system prompts",
                ),
                "verify-installation" => ("Installation prüfen", "Verifying installation"),
                "complete" => (
                    "Installation abgeschlossen und geprüft",
                    "Installation completed and verified",
                ),
                _ => ("Wiederherstellung läuft", "Recovery in progress"),
            };
            let mut status = tr(w, de, en).to_string();
            if p.total > 0 {
                status.push_str(&format!(
                    " · {:.0}%",
                    p.completed.min(p.total) as f64 / p.total as f64 * 100.0
                ));
            }
            w.set_status(status.into());
            w.set_detail(p.message.into());
            w.set_indeterminate(p.total == 0);
            w.set_progress(if p.total == 0 {
                0.0
            } else {
                (p.completed as f64 / p.total as f64).clamp(0.0, 1.0) as f32
            });
            if matches!(
                p.phase,
                "install" | "install-wait" | "verify-installation" | "complete"
            ) {
                w.set_can_cancel(false);
            }
            w.set_can_force(p.phase == "waiting-for-app");
        }
        Event::Finished(result) => {
            w.set_busy(false);
            w.set_can_cancel(false);
            w.set_can_force(false);
            w.set_confirm(false);
            match result {
                Ok(app) => {
                    let actual_version = app
                        .version
                        .as_ref()
                        .map(ToString::to_string)
                        .unwrap_or_default();
                    if let Some(i) = d.selected {
                        d.apps[i] = app;
                    }
                    d.prior_context = None;
                    refresh(w, d);
                    w.set_target_version(actual_version.into());
                    w.set_complete(true);
                    w.set_status(tr(w, "Die Zielversion und ihre Programmdateien wurden geprüft. Sicherungen bleiben erhalten.", "The target version and its program files were verified. Backups are retained."));
                }
                Err(e) => error(w, &e),
            }
        }
        Event::Error(e) => error(w, &e),
        Event::Prior(request, interrupted) => {
            if request == d.prior_request {
                w.set_notice(if interrupted { tr(w, "Ein vorheriger Vorgang wurde nicht abgeschlossen. Protokolle und Sicherungen bleiben erhalten. Die Installation kann erneut ausgeführt werden.", "A previous operation did not complete. Logs and backups are retained. You can run the installation again.") } else { "".into() });
            }
        }
    }
}
