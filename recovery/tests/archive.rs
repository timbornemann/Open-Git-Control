use ogc_recovery::{archive, model::Control};
use std::{fs, io::Write};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

fn fixture() -> tempfile::TempDir {
    // Match production's canonical anchor, including macOS /var -> /private/var.
    tempfile::tempdir_in(std::env::temp_dir().canonicalize().unwrap()).unwrap()
}

#[test]
fn extracts_deflated_bundle_with_utf8_names_without_privileged_permissions() {
    let root = fixture();
    let source = root.path().join("app.zip");
    let destination = root.path().join("extracted");
    fs::create_dir(&destination).unwrap();
    let mut writer = ZipWriter::new(fs::File::create(&source).unwrap());
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    writer
        .start_file(
            "Open-Git-Control.app/Contents/MacOS/Open-Git-Control",
            options,
        )
        .unwrap();
    writer.write_all(b"verified executable bytes").unwrap();
    writer
        .start_file("Open-Git-Control.app/Contents/Resources/Grüße.txt", options)
        .unwrap();
    writer.write_all("Grüße aus dem ZIP".as_bytes()).unwrap();
    writer.finish().unwrap();
    // Supply an actual hostile Unix mode, independently of the writer's own permission masking.
    let mut bytes = fs::read(&source).unwrap();
    let header = bytes.windows(4).position(|b| b == b"PK\x01\x02").unwrap();
    bytes[header + 5] = 3; // ZIP "made by" host: Unix.
    bytes[header + 38..header + 42].copy_from_slice(&((0o106755u32) << 16).to_le_bytes());
    fs::write(&source, bytes).unwrap();
    let bundle = archive::bundle(&source, &destination, &Control::default()).unwrap();
    let executable = bundle.join("Contents/MacOS/Open-Git-Control");
    assert_eq!(fs::read(&executable).unwrap(), b"verified executable bytes");
    assert_eq!(
        fs::read_to_string(bundle.join("Contents/Resources/Grüße.txt")).unwrap(),
        "Grüße aus dem ZIP"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(&executable).unwrap().permissions().mode() & 0o7777,
            0o755
        );
    }
}

#[test]
fn rejects_archive_paths_and_symlink_targets_outside_the_bundle() {
    for symlink in [false, true] {
        let root = fixture();
        let source = root.path().join("hostile.zip");
        let destination = root.path().join("extracted");
        fs::create_dir(&destination).unwrap();
        let mut writer = ZipWriter::new(fs::File::create(&source).unwrap());
        if symlink {
            writer
                .add_symlink(
                    "Open-Git-Control.app/Contents/link",
                    "../../../outside",
                    SimpleFileOptions::default(),
                )
                .unwrap();
        } else {
            writer
                .start_file("../outside", SimpleFileOptions::default())
                .unwrap();
            writer.write_all(b"must not be extracted").unwrap();
        }
        writer.finish().unwrap();
        assert!(archive::bundle(&source, &destination, &Control::default()).is_err());
        assert!(!root.path().join("outside").exists());
    }
}
