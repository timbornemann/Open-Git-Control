fn main() {
    let notices = std::path::Path::new("THIRD_PARTY_NOTICES.txt");
    if std::env::var("PROFILE").as_deref() == Ok("release") && !notices.is_file() {
        panic!("Generate the pinned Rust dependency notices using scripts/build-recovery.js before a release build");
    }
    let text = std::fs::read_to_string(notices).unwrap_or_else(|_| "Development build. Generate dependency notices with scripts/build-recovery.js. Slint: GPL-3.0-only. Open-Git-Control Recovery: GPL-3.0-only.".into());
    let text = format!("Open-Git-Control Recovery · GPL-3.0-only\nSource: https://github.com/timbornemann/Open-Git-Control\n\n{}\n\n{}", std::fs::read_to_string("../LICENSE").expect("Project license"), text);
    std::fs::write(
        std::path::Path::new(&std::env::var("OUT_DIR").unwrap()).join("RECOVERY_NOTICES.txt"),
        text,
    )
    .unwrap();
    println!("cargo:rerun-if-changed=THIRD_PARTY_NOTICES.txt");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut resource = winresource::WindowsResource::new();
        resource.set_icon("../logo.ico");
        resource.set("FileDescription", "Open-Git-Control Recovery");
        resource.set("ProductName", "Open-Git-Control Recovery");
        resource
            .compile()
            .expect("Embed the Windows app icon and version");
    }
    println!("cargo:rerun-if-changed=../src/shared/updateSource.json");
    println!("cargo:rerun-if-changed=ui/recovery.slint");
    if std::env::var_os("CARGO_FEATURE_GUI").is_some() {
        slint_build::compile_with_config(
            "ui/recovery.slint",
            slint_build::CompilerConfiguration::new().with_style("fluent".into()),
        )
        .expect("Compile the independent recovery UI");
    }
}
