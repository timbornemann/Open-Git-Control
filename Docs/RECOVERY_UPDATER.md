# Independent recovery updater

Open-Git-Control Recovery is a separate Rust/Slint application. It uses the winit
software renderer and does not start Electron, Node.js, Git or the main app to
inspect, download or install a release. Windows builds statically link the C
runtime. Icons, UI and license texts are embedded in the executable.

## Using recovery

Open **Settings → App & Diagnostics → Open recovery updater**, or use the separate
program entry. Choose the installation when several are found. Check the displayed
data folder; **Data folder…** selects a different existing profile when necessary.

- **Update** installs the latest official stable release.
- **Repair installation** downloads and reinstalls the detected installed version.
- **Restore an older version** requires an explicit version selection. **More…**
  loads further published stable releases. Automatic downloads are paused by
  setting `autoUpdateEnabled` to `false`; manually initiated updates remain possible.
  Re-enable automatic downloads in the main app settings when ready.

If an unregistered AppImage's installed version cannot be read, the summary calls
this out explicitly before installing the displayed stable target. Automatic
downloads are also paused in this case to avoid undoing a possible version return.

The next screen shows the destination, versions, download size and data folder.
Installation starts only after confirmation. Recovery first downloads and verifies
the complete package, closes the app and backs up its data. If the app will not
close, **Force close** is offered with an unsaved-work warning. A successful result
requires the installed target version and essential runtime files to be verified.
The app starts only when **Launch Open-Git-Control** is selected.

The helper is copied outside the installation before use. This copy and its own
program entry survive a downgrade to a version without built-in recovery.

## Distribution

The release workflow builds the same x64 targets as the main app:

| System         | Installed entry                                                                          | Separate recovery artifact                           |
| -------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Windows        | `Open-Git-Control-Recovery.exe` in the program folder; Start menu                        | `Open-Git-Control-Recovery-VERSION-win-x64.exe`      |
| macOS          | Embedded helper and a separate Recovery app in the DMG; retained app in `~/Applications` | `Open-Git-Control-Recovery-VERSION-mac-x64.zip`      |
| Linux DEB      | Embedded helper and a desktop entry                                                      | `Open-Git-Control-Recovery-VERSION-linux-x64.tar.gz` |
| Linux AppImage | A retained external executable and desktop entry created after first successful setup    | Same Linux archive                                   |

Recovery artifacts are published by builds containing this feature on the
[official releases page](https://github.com/timbornemann/Open-Git-Control/releases).
They are covered by `SHA256SUMS.txt` and published-download verification. Main-app
update manifests contain only main-app packages. Earlier releases without a
recovery artifact remain valid repair/restore targets when their main-app manifest
and package checks pass. Missing or inconsistent metadata blocks installation.

The checked-in `src/shared/updateSource.json` defines the source and filenames.
Only official published stable tags and matching x64 packages are accepted.
Downloads use HTTPS, bounded metadata, restricted redirect hosts and repository
paths, timeouts, exact sizes and canonical SHA-512 checksums. Existing publisher
signing settings are unchanged; recovery does not add a signing identity or bypass
operating-system permission prompts.

## Data and interruption handling

State is stored in the user's configuration/application-data directory under
`Open-Git-Control-Recovery`:

- `bin/VERSION/HASH/`: retained helper copies, including changed builds of the same version without replacing a running executable;
- `installations/HASH/installation.json`: installation and profile registration;
- `installations/HASH/install.guard` and `install.lock/owner.json`: process lock;
- `installations/HASH/downloads/VERSION/`: fully verified reusable packages;
- `installations/HASH/operations/UUID/operation.json`: persistent operation journal;
- `operations/UUID/profile-backup/`: user data and a completion manifest with hashes.

Backups retain opaque settings, credentials and saved app data, excluding known
regenerable caches. Repositories are never traversed, reset or deleted. Damaged
settings are backed up as bytes. A downgrade is blocked if its automatic-download
setting cannot be updated safely; damaged settings are not silently replaced.
An incomplete backup has no completion marker. Partial downloads are not executable
packages. Backups and journals are retained for inspection and manual recovery.

The normal updater checks the recovery lock before checking/downloading/installing,
when recovery becomes active, and immediately before its quit-install handler.
Recovery closes only processes belonging to the selected installation and current
user, including its own Electron helpers. The recovery process itself and external
browsers, editors or build tools launched by the app are excluded. AppImage
ownership additionally requires a verified executable inside its mounted image;
inherited environment variables alone do not establish ownership. PID creation
times protect against killing a reused process ID. Installer process IDs are
journaled too, so restarting recovery does not start a competing installer while
the previous system installer is still active.
Windows also takes a shared product-installer lock because NSIS registration is
shared between installations. Recovery selects the registered per-user or system
scope and blocks any NSIS operation that would remove another installation. Old
NSIS installers are not started while another copy of the app is running. Linux
requests a normal window close on X11; on Wayland, the user closes the app normally
before recovery continues. It does not send an unconditional SIGTERM first.

Windows invokes the verified NSIS package silently with a fixed destination and
`--updated`, preserving app data and leaving elevation to Windows. macOS prepares
and validates the bundle before exchanging it, preserving the previous bundle and
recording the paths before the exchange. An interrupted exchange can restore the
preserved bundle when the operation is retried. AppImage uses a same-directory
atomic replacement and preserves the previous image. DEB uses `pkexec`/`apt-get`,
after verifying package identity, version and architecture; it disallows removing
other packages. Active system installers are never killed by Cancel.

## Building and testing

Install Rust 1.93.1 (MSVC build tools and Windows SDK on Windows). Rust dependencies
are locked in `recovery/Cargo.lock`; release builds use `--locked`. On Linux the CI
installs the Slint/font/display development packages and runs UI smoke tests under
Xvfb. macOS release jobs use an Intel runner. Native legal notices are generated
from the locked Cargo package metadata and embedded in the executable; the UI's
**Licenses and source** action opens them as a local text document.

```sh
npm run recovery:check
npm run recovery:test
npm run recovery:build
npm run recovery:smoke
npm run test:ci
npm run dist:win   # or dist:mac / dist:linux
```

Shared JSON policy cases run in TypeScript and Rust. Native tests cover damaged
runtime identification, old ASAR metadata, backup/cancellation, settings preservation,
locks, stale owners, checksum/size failures, archive path protection, retained
helpers, interruption journals and shutdown of isolated hanging app fixtures.
The native smoke test copies only the helper into an isolated directory and opens
the UI with no Electron files, main EXE, Node or Git available.

CI additionally installs official 2.2.1 and 3.0.5 packages on disposable Windows,
macOS and Linux runners, exercising update, repair and restore (both DEB and
AppImage on Linux). These fixed compatibility targets avoid racing a newly
published release whose assets are still being built. The installation suite is
ignored by default and refuses to run outside an explicitly enabled CI runner.

Before releasing, also exercise UAC/package-manager cancellation, low disk space,
restart during installation and retry. These OS permission and installation
scenarios must be run on disposable test installations, not a developer's active
installation or repositories.
