import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const projectRoot = path.resolve(__dirname, '../../..');
const prepareVersionScript = path.join(projectRoot, 'scripts', 'prepare-release-version.js');
const generateChecksumsScript = path.join(projectRoot, 'scripts', 'generate-release-checksums.js');
const tempDirectories: string[] = [];

const createTempDirectory = (): string => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-release-script-'));
  tempDirectories.push(directory);
  return directory;
};

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('release scripts', () => {
  it('keeps package and lockfile versions aligned for a release tag', () => {
    const cwd = createTempDirectory();
    fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }), 'utf8');
    fs.writeFileSync(
      path.join(cwd, 'package-lock.json'),
      JSON.stringify({ name: 'fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'fixture', version: '1.0.0' } } }),
      'utf8',
    );

    const result = spawnSync(process.execPath, [prepareVersionScript, '2.4.6'], { cwd, encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).version).toBe('2.4.6');
    const lockfile = JSON.parse(fs.readFileSync(path.join(cwd, 'package-lock.json'), 'utf8'));
    expect(lockfile.version).toBe('2.4.6');
    expect(lockfile.packages[''].version).toBe('2.4.6');
  });

  it('rejects non-release versions without modifying manifests', () => {
    const cwd = createTempDirectory();
    const manifest = `${JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2)}\n`;
    fs.writeFileSync(path.join(cwd, 'package.json'), manifest, 'utf8');

    const result = spawnSync(process.execPath, [prepareVersionScript, '2.4.6-beta.1'], { cwd, encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).toBe(manifest);
  });

  it('generates checksums only for release installers and archives', () => {
    const releaseDirectory = createTempDirectory();
    fs.writeFileSync(path.join(releaseDirectory, 'Open-Git-Control-2.4.6-win-x64.exe'), 'windows', 'utf8');
    fs.writeFileSync(path.join(releaseDirectory, 'Open-Git-Control-2.4.6-mac-x64.zip'), 'macos', 'utf8');
    fs.writeFileSync(path.join(releaseDirectory, 'latest.yml'), 'version: 2.4.6', 'utf8');
    fs.writeFileSync(path.join(releaseDirectory, 'builder-debug.yml'), 'debug: true', 'utf8');
    fs.writeFileSync(path.join(releaseDirectory, 'Open-Git-Control-2.4.6-win-x64.exe.blockmap'), 'blockmap', 'utf8');

    const result = spawnSync(process.execPath, [generateChecksumsScript, releaseDirectory], { encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(0);
    const checksumLines = fs.readFileSync(path.join(releaseDirectory, 'SHA256SUMS.txt'), 'utf8').trim().split('\n');
    expect(checksumLines).toHaveLength(2);
    expect(checksumLines.join('\n')).toContain('Open-Git-Control-2.4.6-win-x64.exe');
    expect(checksumLines.join('\n')).toContain('Open-Git-Control-2.4.6-mac-x64.zip');
    expect(checksumLines.join('\n')).not.toContain('latest.yml');
    expect(checksumLines.join('\n')).not.toContain('builder-debug.yml');
    expect(checksumLines.join('\n')).not.toContain('.blockmap');
  });
});
