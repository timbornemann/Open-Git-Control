const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function prepare(root) {
  const metadata = JSON.parse(
    execFileSync('cargo', ['metadata', '--manifest-path', 'recovery/Cargo.toml', '--locked', '--format-version', '1'], {
      cwd: root,
      windowsHide: true,
      maxBuffer: 32 * 1024 * 1024,
    }).toString('utf8'),
  );
  const sections = [
    'Open-Git-Control Recovery – Third-party notices',
    'GPL-3.0-only. Source: https://github.com/timbornemann/Open-Git-Control',
    '',
    'Generated from the pinned Cargo.lock. Optional, build and platform dependencies are included.',
  ];
  for (const pkg of metadata.packages
    .filter((p) => p.name !== 'ogc-recovery')
    .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`))) {
    const directory = path.dirname(pkg.manifest_path);
    sections.push('', '='.repeat(80), `${pkg.name}@${pkg.version}`, `License: ${pkg.license || 'See included license text'}`, pkg.repository || '');
    const licenses = fs.readdirSync(directory, { withFileTypes: true }).filter((e) => e.isFile() && /^(license|licence|copying|notice)([._-]|$)/i.test(e.name));
    if (!licenses.length && !pkg.license) throw new Error(`Recovery dependency has no license information: ${pkg.name}`);
    for (const entry of licenses) {
      const file = path.join(directory, entry.name);
      if (fs.statSync(file).size <= 1024 * 1024) sections.push(entry.name, fs.readFileSync(file, 'utf8'));
    }
  }
  const destination = path.join(root, 'recovery/THIRD_PARTY_NOTICES.txt');
  fs.writeFileSync(destination, `${sections.join('\n')}\n`);
  return destination;
}
module.exports = { prepare };
