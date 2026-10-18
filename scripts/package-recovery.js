const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { platformArtifacts } = require('./release-artifact-policy');
const { version } = require('../package.json');
const root = path.resolve(__dirname, '..');
const run = (program, args) => execFileSync(program, args, { windowsHide: true, stdio: 'inherit' });

function macBundle() {
  const bundle = path.join(root, 'build/Open-Git-Control Recovery.app');
  const content = path.join(bundle, 'Contents');
  fs.mkdirSync(path.join(content, 'MacOS'), { recursive: true });
  fs.cpSync(path.join(root, 'build/recovery/open-git-control-recovery'), path.join(content, 'MacOS/open-git-control-recovery'));
  fs.chmodSync(path.join(content, 'MacOS/open-git-control-recovery'), 0o755);
  fs.mkdirSync(path.join(content, 'Resources'), { recursive: true });
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) fs.copyFileSync(path.join(root, 'build/recovery', name), path.join(content, 'Resources', name));
  fs.writeFileSync(
    path.join(content, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.opengitcontrol.recovery</string><key>CFBundleName</key><string>Open-Git-Control Recovery</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleExecutable</key><string>open-git-control-recovery</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleVersion</key><string>${version}</string><key>NSHighResolutionCapable</key><true/></dict></plist>\n`,
  );
  return bundle;
}
async function afterPack(context) {
  const platform = context.electronPlatformName;
  const out = platform === 'darwin' ? path.join(context.appOutDir, 'Open-Git-Control.app/Contents/Resources') : context.appOutDir;
  fs.writeFileSync(
    path.join(out, 'recovery-install.json'),
    `${JSON.stringify({ schema: 1, appId: 'com.opengitcontrol.app', version, kind: { win32: 'windows', darwin: 'macos', linux: 'deb' }[platform] })}\n`,
  );
  if (platform === 'win32') fs.copyFileSync(path.join(root, 'build/recovery/Open-Git-Control-Recovery.exe'), path.join(out, 'Open-Git-Control-Recovery.exe'));
  if (platform === 'darwin') macBundle();
}
async function afterAllArtifactBuild() {
  const platform = { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform];
  const artifact = path.join(root, 'release', platformArtifacts(version, platform).recovery);
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  if (process.platform === 'win32') fs.copyFileSync(path.join(root, 'build/recovery/Open-Git-Control-Recovery.exe'), artifact);
  else if (process.platform === 'darwin') run('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', macBundle(), artifact]);
  else run('tar', ['-czf', artifact, '-C', path.join(root, 'build/recovery'), 'open-git-control-recovery', 'LICENSE', 'THIRD_PARTY_NOTICES.txt']);
  // The main-app feed is intentionally unchanged. Recovery is a separate asset.
  return [artifact];
}
module.exports = { afterPack, afterAllArtifactBuild, macBundle };
