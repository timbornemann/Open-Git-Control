use ogc_recovery::{catalog, model::Control, policy};

#[test]
#[ignore = "read-only verification against the official public release service"]
fn published_baselines_have_complete_checkable_packages() {
    let client = catalog::client().unwrap();
    let control = Control::default();
    for version in ["2.2.1", "3.0.5"] {
        let version = policy::stable(version).unwrap();
        let release = catalog::release(&client, &version, &control).unwrap();
        for platform in ["windows", "macos", "linux"] {
            let manifest = catalog::manifest(&client, &release, platform, &control).unwrap();
            println!(
                "Verified public metadata: {version} {platform} ({} complete assets)",
                manifest.files.len()
            );
        }
    }
}
