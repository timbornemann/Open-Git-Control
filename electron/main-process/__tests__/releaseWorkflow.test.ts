import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

type Step = { name?: string; uses?: string; run?: string; if?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = {
  needs?: string | string[];
  steps: Step[];
  env?: Record<string, string>;
  strategy?: { matrix: { include: Array<{ os: string; platform: string }> } };
};
const workflow = (name: string): { jobs: Record<string, Job> } =>
  parse(fs.readFileSync(path.resolve(__dirname, `../../../.github/workflows/${name}.yml`), 'utf8'));
const step = (job: Job, name: string) => job.steps.find((entry) => entry.name === name)!;

describe('release pipeline dependencies and authenticated recovery verification', () => {
  const release = workflow('release');
  const ci = workflow('ci');

  it('builds and verifies the app and native helper independently before packaging their exact outputs', () => {
    const { verify, recovery, build, publish } = release.jobs;
    expect(verify.needs).toBe('prepare');
    expect(recovery.needs).toBe('prepare');
    expect(build.needs).toEqual(expect.arrayContaining(['prepare', 'verify', 'recovery']));
    expect(publish.needs).toContain('build');
    const targets = verify.strategy!.matrix.include;
    expect(targets).toHaveLength(3);
    for (const { os, platform } of targets) {
      expect(recovery.strategy!.matrix.include).toContainEqual({ os, platform });
      expect(build.strategy!.matrix.include).toEqual(expect.arrayContaining([expect.objectContaining({ os, platform })]));
    }
    expect(step(verify, 'Run release quality gate').run).toBe('npm run test:ci');
    const compiled = step(verify, 'Upload verified application build').with!;
    expect(compiled.path).toContain('dist/');
    expect(compiled.path).toContain('dist-electron/');
    expect(step(build, 'Download verified application build').with!.name).toBe(compiled.name);
    expect(step(build, 'Download verified recovery helper').with!.name).toBe(step(recovery, 'Upload verified recovery helper').with!.name);
    const packaging = step(build, 'Build release assets').run!;
    expect(packaging).toContain('electron-builder');
    expect(build.steps.some((entry) => /npm run (?:dist|build|recovery:build)/.test(entry.run ?? ''))).toBe(false);
    const permission = step(build, 'Restore native executable permissions after artifact download');
    expect(permission.if).toBe("runner.os != 'Windows'");
    expect(permission.run).toBe('chmod 755 build/recovery/open-git-control-recovery');
    expect(build.steps.indexOf(permission)).toBeLessThan(build.steps.indexOf(step(build, 'Build release assets')));
  });

  it('shares platform-scoped Rust dependency caches between CI and releases and keeps them after a later failure', () => {
    for (const { jobs } of [ci, release]) {
      const native = jobs.recovery;
      const cache = native.steps.find((entry) => entry.uses === 'Swatinem/rust-cache@v2')!.with!;
      expect(cache.workspaces).toBe('recovery');
      expect(cache['shared-key']).toBe('recovery-x64');
      expect(cache['cache-on-failure']).toBe(true);
      expect(native.env).toMatchObject({ CARGO_PROFILE_DEV_DEBUG: '0', CARGO_PROFILE_TEST_DEBUG: '0' });
    }
  });

  it('authenticates live recovery checks in both workflows while retaining the complete native and UI gates', () => {
    for (const { jobs } of [ci, release]) {
      const native = jobs.recovery;
      const installation = native.steps.find((entry) => entry.run === 'node scripts/test-recovery-installation.js')!;
      expect(installation.env).toEqual({ OGC_RECOVERY_GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' });
      const commands = native.steps.map((entry) => entry.run ?? '').join('\n');
      for (const command of ['recovery:check', 'recovery:test', 'recovery:build', 'recovery:smoke']) expect(commands).toContain(command);
      expect(native.steps.some((entry) => entry.run === 'xvfb-run -a npm run recovery:smoke' && entry.if === "runner.os == 'Linux'")).toBe(true);
    }
  });
});
