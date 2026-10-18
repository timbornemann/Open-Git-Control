use ogc_recovery::policy;
use serde_json::Value;
use url::Url;

#[test]
fn shared_metadata_rules() {
    let data: Value =
        serde_json::from_str(include_str!("../../src/shared/recoveryPolicyCases.json")).unwrap();
    for case in data["cases"].as_array().unwrap() {
        let mut info = data["base"].clone();
        if let Some(field) = case["field"].as_str() {
            let mut pointer = String::new();
            for part in field.split('.') {
                pointer.push('/');
                pointer.push_str(part);
            }
            if let Some(place) = info.pointer_mut(&pointer) {
                *place = case["value"].clone();
            } else {
                let (parent, name) = pointer.rsplit_once('/').unwrap();
                info.pointer_mut(parent)
                    .unwrap()
                    .as_object_mut()
                    .unwrap()
                    .insert(name.into(), case["value"].clone());
            }
        }
        let yaml = serde_yaml::to_string(&info).unwrap();
        assert_eq!(
            policy::manifest(&yaml, "windows", &policy::stable("2.4.6").unwrap()).is_ok(),
            case["valid"].as_bool().unwrap(),
            "{}",
            case["name"]
        );
    }
}
#[test]
fn shared_download_rules() {
    let data: Value =
        serde_json::from_str(include_str!("../../src/shared/recoveryPolicyCases.json")).unwrap();
    let initial = Url::parse(data["initial"].as_str().unwrap()).unwrap();
    for case in data["urls"].as_array().unwrap() {
        let url = Url::parse(case["url"].as_str().unwrap()).unwrap();
        assert_eq!(
            policy::allowed_redirect(&url, &initial),
            case["valid"].as_bool().unwrap(),
            "{url}"
        );
    }
}
#[test]
fn strict_yaml_and_versions() {
    assert!(policy::manifest(
        "version: 2.4.6\nversion: 2.4.6\n",
        "windows",
        &policy::stable("2.4.6").unwrap()
    )
    .is_err());
    for value in [
        "1.2",
        "1.2.3-beta.1",
        "v1.2.3",
        "01.2.3",
        "1.2.3+build",
        "../1.2.3",
    ] {
        assert!(policy::stable(value).is_err(), "{value}");
    }
    for url in [
        "https://api.github.com/repos/timbornemann/Open-Git-Control/releases/latest?token=other",
        "http://api.github.com/repos/timbornemann/Open-Git-Control/releases/latest",
        "https://api.github.com/repos/other/Open-Git-Control/releases/latest",
    ] {
        assert!(!policy::allowed_api(&Url::parse(url).unwrap()));
    }
}

#[test]
fn manifest_cannot_override_the_release_tag_or_expand_aliases() {
    let data: Value =
        serde_json::from_str(include_str!("../../src/shared/recoveryPolicyCases.json")).unwrap();
    let good = serde_yaml::to_string(&data["base"]).unwrap();
    let version = policy::stable("2.4.6").unwrap();
    assert!(policy::manifest(&(good.clone() + "tag: null\n"), "windows", &version).is_err());
    assert!(policy::manifest(
        &(good.clone() + "notes: &anchor test\ncopy: *anchor\n"),
        "windows",
        &version
    )
    .is_err());
    assert!(policy::manifest(
        &(good + "notes: 'An ordinary * and & in release notes'\n"),
        "windows",
        &version
    )
    .is_ok());
    assert!(!policy::allowed_redirect(
        &Url::parse("https://evil.invalid/download.exe").unwrap(),
        &Url::parse("https://evil.invalid/download.exe").unwrap()
    ));
}
