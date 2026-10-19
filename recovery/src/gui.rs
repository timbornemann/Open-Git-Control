mod state;
use crate::cli::Options;
use anyhow::Result;
use ogc_recovery::{
    catalog, installation, job,
    model::{Control, Progress},
    platform,
};
use slint::ComponentHandle;
use state::{Data, Event, Prepared};
use std::{
    cell::RefCell,
    path::PathBuf,
    rc::Rc,
    sync::{atomic::Ordering, mpsc},
    thread,
    time::Duration,
};
slint::include_modules!();

fn backend() -> Result<()> {
    slint::BackendSelector::new()
        .backend_name("winit".into())
        .renderer_name("software".into())
        .select()?;
    Ok(())
}
pub fn smoke() -> Result<()> {
    backend()?;
    let window = RecoveryWindow::new()?;
    window.set_linux(cfg!(target_os = "linux"));
    let (send, _receive) = mpsc::channel();
    let root = std::env::temp_dir().join(format!("ogc-recovery-preview-{}", uuid::Uuid::new_v4()));
    let mut preview = Data::new(root.clone(), send);
    preview.apps.push(ogc_recovery::model::Installation {
        schema: 1,
        app_id: ogc_recovery::model::APP_ID.into(),
        target: root.join("Open-Git-Control"),
        profile: root.join("profile"),
        kind: if cfg!(windows) {
            ogc_recovery::model::Kind::Windows
        } else if cfg!(target_os = "macos") {
            ogc_recovery::model::Kind::Macos
        } else {
            ogc_recovery::model::Kind::Appimage
        },
        version: Some(ogc_recovery::policy::stable("3.0.5")?),
        image_identity: None,
    });
    preview.selected = Some(0);
    preview.latest = Some(ogc_recovery::policy::stable("3.0.6")?);
    preview.versions = vec![
        ogc_recovery::policy::stable("3.0.4")?,
        ogc_recovery::policy::stable("2.2.1")?,
    ];
    let data = Rc::new(RefCell::new(preview));
    bind_selection(&window, &data);
    state::refresh(&window, &mut data.borrow_mut());
    window.invoke_choose_action(1);
    assert_eq!(window.get_target_version().as_str(), "3.0.5");
    window.invoke_choose_action(2);
    assert!(!window.get_can_review());
    window.set_version_index(0);
    window.invoke_choose_version(0);
    assert!(window.get_can_review());
    window.invoke_choose_action(0);
    window.set_status("Preview · No installation or network actions".into());
    let weak = window.as_weak();
    window.on_review(move || { if let Some(w)=weak.upgrade() { w.set_summary("Preview only\n\nInstalled: 3.0.5\nTarget version: 3.0.6\nDownload: 150 MB\n\nApp data will be backed up before installation.".into());w.set_confirm(true); } });
    let weak = window.as_weak();
    window.on_back(move || {
        if let Some(w) = weak.upgrade() {
            w.set_confirm(false);
        }
    });
    let timer = slint::Timer::default();
    if std::env::var_os("OGC_RECOVERY_SMOKE_HOLD").is_none() {
        timer.start(
            slint::TimerMode::SingleShot,
            Duration::from_millis(1200),
            || {
                let _ = slint::quit_event_loop();
            },
        );
    }
    window.run()?;
    println!("OGC_RECOVERY_SMOKE_OK");
    Ok(())
}
pub fn run(options: Options, root: PathBuf) -> Result<()> {
    backend()?;
    let window = RecoveryWindow::new()?;
    window.set_de(
        options
            .language
            .as_deref()
            .map(|s| s == "de")
            .unwrap_or_else(|| sys_locale::get_locale().is_some_and(|s| s.starts_with("de"))),
    );
    window.set_linux(cfg!(target_os = "linux"));
    window.set_log_path(root.display().to_string().into());
    let (send, receive) = mpsc::channel();
    let data = Rc::new(RefCell::new(Data::new(root, send.clone())));
    bind(&window, &data);
    window.set_status(state::tr(
        &window,
        "Installationen und Veröffentlichungen werden gesucht…",
        "Looking for installations and releases…",
    ));
    let discovery_send = send.clone();
    let discovery_root = data.borrow().root.clone();
    thread::spawn(move || {
        let mut apps = installation::discover(&discovery_root).unwrap_or_default();
        let explicit = options.installation.and_then(|path| {
            match installation::resolve(&discovery_root, &path, options.profile.as_deref(), None) {
                Ok(app) => {
                    let index = apps
                        .iter()
                        .position(|a| a.target == app.target)
                        .unwrap_or(apps.len());
                    if index == apps.len() {
                        apps.push(app);
                    } else {
                        apps[index] = app;
                    }
                    Some(index)
                }
                Err(error) => {
                    let _ = discovery_send.send(Event::Error(format!("{error:#}")));
                    None
                }
            }
        });
        let _ = discovery_send.send(Event::Discovered(apps, explicit));
    });
    load(&window, &data, false);
    let weak = window.as_weak();
    let update_data = data.clone();
    let timer = slint::Timer::default();
    timer.start(
        slint::TimerMode::Repeated,
        Duration::from_millis(80),
        move || {
            if let Some(window) = weak.upgrade() {
                while let Ok(event) = receive.try_recv() {
                    state::apply(&window, &mut update_data.borrow_mut(), event);
                }
            }
        },
    );
    let weak = window.as_weak();
    let closing = data.clone();
    window.window().on_close_requested(move || {
        if let Some(window) = weak.upgrade() {
            if window.get_busy() {
                if window.get_can_cancel() {
                    closing
                        .borrow()
                        .control
                        .cancel
                        .store(true, Ordering::SeqCst);
                }
                return slint::CloseRequestResponse::KeepWindowShown;
            }
        }
        slint::CloseRequestResponse::HideWindow
    });
    window.run()?;
    data.borrow()
        .catalog_control
        .cancel
        .store(true, Ordering::SeqCst);
    Ok(())
}
fn bind_selection(window: &RecoveryWindow, data: &Rc<RefCell<Data>>) {
    let weak = window.as_weak();
    let d = data.clone();
    window.on_choose_installation(move |index| {
        if let Some(w) = weak.upgrade() {
            d.borrow_mut().selected = usize::try_from(index).ok();
            state::refresh(&w, &mut d.borrow_mut());
        }
    });
    let weak = window.as_weak();
    let d = data.clone();
    window.on_choose_action(move |index| {
        if let Some(w) = weak.upgrade() {
            w.set_action(index);
            w.set_error(false);
            w.set_status(state::tr(
                &w,
                "Version und Aktion auswählen.",
                "Choose a version and action.",
            ));
            state::refresh(&w, &mut d.borrow_mut());
        }
    });
    let weak = window.as_weak();
    let d = data.clone();
    window.on_choose_version(move |_| {
        if let Some(w) = weak.upgrade() {
            state::refresh(&w, &mut d.borrow_mut());
        }
    });
    let weak = window.as_weak();
    let d = data.clone();
    window.on_language(move || {
        if let Some(w) = weak.upgrade() {
            w.set_de(!w.get_de());
            state::refresh(&w, &mut d.borrow_mut());
        }
    });
}
fn bind(window: &RecoveryWindow, data: &Rc<RefCell<Data>>) {
    bind_selection(window, data);
    let d = data.clone();
    window.on_licenses(move || {
        let root = d.borrow().root.clone();
        let tx = d.borrow().send.clone();
        thread::spawn(move || {
            if let Err(e) = ogc_recovery::licenses::show(&root) {
                let _ = tx.send(Event::Error(format!("{e:#}")));
            }
        });
    });
    let weak = window.as_weak();
    let d = data.clone();
    window.on_load_releases(move |more| {
        if let Some(w) = weak.upgrade() {
            load(&w, &d, more);
        }
    });
    let weak = window.as_weak();
    let d = data.clone();
    window.on_browse_installation(move |image| {
        if let Some(w) = weak.upgrade() {
            browse(&w, &d, image, false);
        }
    });
    let weak = window.as_weak();
    let d = data.clone();
    window.on_browse_profile(move || {
        if let Some(w) = weak.upgrade() {
            browse(&w, &d, false, true);
        }
    });
    let weak = window.as_weak();
    let d = data.clone();
    window.on_review(move || {
        if let Some(w) = weak.upgrade() {
            review(&w, &d);
        }
    });
    let weak = window.as_weak();
    let d = data.clone();
    window.on_install(move || {
        if let Some(w) = weak.upgrade() {
            execute(&w, &d);
        }
    });
    let weak = window.as_weak();
    let d = data.clone();
    window.on_back(move || {
        if let Some(w) = weak.upgrade() {
            w.set_confirm(false);
            d.borrow_mut().prepared = None;
            state::refresh(&w, &mut d.borrow_mut());
        }
    });
    let d = data.clone();
    window.on_cancel(move || {
        d.borrow().control.cancel.store(true, Ordering::SeqCst);
    });
    let d = data.clone();
    window.on_force_close(move || {
        d.borrow().control.force_close.store(true, Ordering::SeqCst);
    });
    let d = data.clone();
    window.on_launch(move || {
        if let Some(app) = d.borrow().app().cloned() {
            let tx = d.borrow().send.clone();
            thread::spawn(move || {
                if let Err(e) = platform::launch(&app) {
                    let _ = tx.send(Event::Error(format!("{e:#}")));
                }
            });
        }
    });
}
fn load(window: &RecoveryWindow, data: &Rc<RefCell<Data>>, more: bool) {
    if window.get_catalog_loading() {
        return;
    }
    window.set_catalog_loading(true);
    let mut d = data.borrow_mut();
    let page = if more { d.page + 1 } else { 1 };
    let tx = d.send.clone();
    let control = Control::default();
    d.catalog_control = control.clone();
    thread::spawn(move || {
        let result = (|| -> Result<_> {
            let net = catalog::client()?;
            let latest = catalog::latest(&net, &control)?.version()?;
            let (releases, more) = catalog::releases(&net, page, &control)?;
            let versions = releases
                .into_iter()
                .filter_map(|r| r.version().ok())
                .collect();
            Ok((latest, versions, more))
        })();
        let _ = tx.send(Event::Catalog(page, result.map_err(|e| format!("{e:#}"))));
    });
}
fn browse(window: &RecoveryWindow, data: &Rc<RefCell<Data>>, image: bool, profile: bool) {
    let app = data.borrow().app().cloned();
    if profile && app.is_none() {
        return;
    }
    window.set_busy(true);
    window.set_can_cancel(false);
    let tx = data.borrow().send.clone();
    thread::spawn(move || {
        let dialog = rfd::FileDialog::new().set_title(if profile {
            "Open-Git-Control data folder"
        } else {
            "Open-Git-Control installation"
        });
        let path = if image {
            dialog.add_filter("AppImage", &["AppImage"]).pick_file()
        } else {
            dialog.pick_folder()
        };
        let result = path
            .map(|path| {
                if profile {
                    let current = app.unwrap();
                    installation::inspect(&current.target, Some(&path), Some(current.kind))
                } else {
                    installation::inspect(&path, None, None)
                }
            })
            .transpose();
        let _ = tx.send(Event::Chosen(result.map_err(|e| format!("{e:#}"))));
    });
}
fn review(window: &RecoveryWindow, data: &Rc<RefCell<Data>>) {
    let mut d = data.borrow_mut();
    let Some(app) = d.app().cloned() else {
        return;
    };
    let action = state::action(window.get_action());
    let Some(version) = state::target(window, &d) else {
        return;
    };
    if let Err(e) = action.validate(app.version.as_ref(), &version) {
        state::error(window, &e.to_string());
        return;
    }
    d.control = Control::default();
    let control = d.control.clone();
    let tx = d.send.clone();
    window.set_busy(true);
    window.set_can_cancel(true);
    window.set_error(false);
    window.set_status(state::tr(
        window,
        "Veröffentlichung wird geprüft…",
        "Checking release…",
    ));
    thread::spawn(move || {
        let result = (|| -> Result<_> {
            let network = catalog::client()?;
            ogc_recovery::destination::protect(&app)?;
            ogc_recovery::processes::assert_installer_scope(&app)?;
            let release = catalog::release(&network, &version, &control)?;
            let manifest = catalog::manifest(&network, &release, app.kind.platform(), &control)?;
            let file = manifest
                .files
                .iter()
                .find(|f| f.url == ogc_recovery::policy::name(&version, app.kind.suffix()))
                .ok_or_else(|| {
                    anyhow::anyhow!("The selected release has no matching installer.")
                })?;
            control.check()?;
            Ok(Prepared {
                app,
                action,
                version,
                size: file.size,
            })
        })();
        let _ = tx.send(Event::Prepared(result.map_err(|e| format!("{e:#}"))));
    });
}
fn execute(window: &RecoveryWindow, data: &Rc<RefCell<Data>>) {
    let mut d = data.borrow_mut();
    let Some(prepared) = d.prepared.take() else {
        return;
    };
    let root = d.root.clone();
    let tx = d.send.clone();
    d.control = Control::default();
    let control = d.control.clone();
    window.set_busy(true);
    window.set_can_cancel(true);
    window.set_error(false);
    thread::spawn(move || {
        let progress_tx = tx.clone();
        let report = move |p: Progress| {
            let _ = progress_tx.send(Event::Progress(p));
        };
        let result = job::run(
            &root,
            &prepared.app,
            prepared.action,
            &prepared.version,
            &control,
            &report,
        );
        if result.is_err() {
            if let Ok(current) = installation::resolve(
                &root,
                &prepared.app.target,
                Some(&prepared.app.profile),
                Some(prepared.app.kind),
            ) {
                let _ = tx.send(Event::Chosen(Ok(Some(current))));
            }
        }
        let _ = tx.send(Event::Finished(result.map_err(|e| format!("{e:#}"))));
    });
}
