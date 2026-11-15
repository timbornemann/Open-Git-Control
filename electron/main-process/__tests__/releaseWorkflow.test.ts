import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

type Step = { name?: string; uses?: string; run?: string; if?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = {
  needs?: string | string[];
  uses?: string;
  with?: Record<string, unknown>;
  steps?: Step[];
  env?: Record<string, string>;
  strategy?: { matrix: { include?: Array<{ os: string; platform: string }>; shard?: string | number[] } };
};
const workflow = (name: string): { jobs: Record<string, Job> } =>
  parse(fs.readFileSync(path.resolve(__dirname, `../../../.github/workflows/${name}.yml`), 'utf8'));
const steps = (job: Job) => {
  expect(job.steps, 'Expected an ordinary job with inline steps').toBeDefined();
  return job.steps!;
};
const step = (job: Job, name: string) => {
  const entry = steps(job).find((entry) => entry.name === name);
  expect(entry, `Missing workflow step: ${name}`).toBeDefined();
  return entry!;
};
const action = (job: Job, name: string) => {
  const entry = steps(job).find((entry) => entry.uses?.startsWith(name + '@'));
  expect(entry, `Missing workflow action: ${name}`).toBeDefined();
  return entry!;
};

describe('release pipeline dependencies and authenticated recovery verification', () => {
  const release = workflow('release');
  const ci = workflow('ci');
  const quality = workflow('quality');

  it('builds and verifies the app and native helper independently before packaging their exact outputs', () => {
    const { verify, recovery, build, publish } = release.jobs;
    expect(verify.needs).toBe('prepare');
    expect(recovery.needs).toBe('prepare');
    expect(build.needs).toEqual(expect.arrayContaining(['prepare', 'verify', 'recovery']));
    expect(publish.needs).toContain('build');
    const targets = verify.strategy!.matrix.include!;
    expect(targets).toHaveLength(3);
    for (const { os, platform } of targets) {
      expect(recovery.strategy!.matrix.include).toContainEqual({ os, platform });
      expect(build.strategy!.matrix.include).toEqual(expect.arrayContaining([expect.objectContaining({ os, platform })]));
    }
    expect(verify.uses).toBe('./.github/workflows/quality.yml');
    expect(verify.with).toMatchObject({
      os: '${{ matrix.os }}',
      ref: '${{ needs.prepare.outputs.tag }}',
      version: '${{ needs.prepare.outputs.version }}',
      'artifact-name': 'compiled-${{ matrix.platform }}',
      'unit-shards': '${{ matrix.unit-shards }}',
    });
    const compiled = action(quality.jobs.build, 'actions/upload-artifact').with!;
    expect(compiled.name).toBe('${{ inputs.artifact-name }}');
    expect(compiled.path).toContain('dist/');
    expect(compiled.path).toContain('dist-electron/');
    expect(step(build, 'Download verified application build').with!.name).toBe(verify.with!['artifact-name']);
    expect(step(build, 'Download verified recovery helper').with!.name).toBe(step(recovery, 'Upload verified recovery helper').with!.name);
    const packaging = step(build, 'Build release assets').run!;
    expect(packaging).toContain('electron-builder');
    expect(steps(build).some((entry) => /npm run (?:dist|build|recovery:build)/.test(entry.run ?? ''))).toBe(false);
    const permission = step(build, 'Restore native executable permissions after artifact download');
    expect(permission.if).toBe("runner.os != 'Windows'");
    expect(permission.run).toBe('chmod 755 build/recovery/open-git-control-recovery');
    expect(steps(build).indexOf(permission)).toBeLessThan(steps(build).indexOf(step(build, 'Build release assets')));
  });

  it('shares the quality gate with CI and requires the complete shard coverage before verification succeeds', () => {
    expect(ci.jobs.quality.uses).toBe(release.jobs.verify.uses);
    const { build, unit, coverage } = quality.jobs;
    expect(steps(build).some((entry) => entry.run === 'npm run test:ci:checks')).toBe(true);
    expect(unit.needs).toBe('build');
    expect(coverage.needs).toBe('unit');
    expect(unit.strategy!.matrix.shard).toBe('${{ fromJSON(inputs.unit-shards) }}');
    expect(action(unit, 'actions/download-artifact').with!.name).toBe('${{ inputs.artifact-name }}');
    const tests = step(unit, 'Run test shard and collect coverage').run!;
    expect(tests).toContain('npm run test:coverage');
    expect(tests).toContain('--shard=${{ matrix.shard }}/${{ strategy.job-total }}');
    expect(tests).toContain('--reporter=blob');
    const requireShards = step(coverage, 'Require every shard before merging');
    expect(requireShards.run).toBe('node scripts/verify-coverage-shards.cjs');
    expect(requireShards.env).toEqual({ OGC_COVERAGE_SHARDS: '${{ inputs.unit-shards }}' });
    const merge = step(coverage, 'Merge coverage and enforce all existing thresholds');
    expect(merge.run).toBe('npm run test:coverage:merge');
    expect(steps(coverage).indexOf(requireShards)).toBeLessThan(steps(coverage).indexOf(merge));
  });

  it('shares platform-scoped Rust dependency caches between CI and releases and keeps them after a later failure', () => {
    for (const { jobs } of [ci, release]) {
      const native = jobs.recovery;
      const cache = steps(native).find((entry) => entry.uses === 'Swatinem/rust-cache@v2')!.with!;
      expect(cache.workspaces).toBe('recovery');
      expect(cache['shared-key']).toBe('recovery-x64');
      expect(cache['cache-on-failure']).toBe(true);
      expect(native.env).toMatchObject({ CARGO_PROFILE_DEV_DEBUG: '0', CARGO_PROFILE_TEST_DEBUG: '0' });
    }
  });

  it('authenticates live recovery checks in both workflows while retaining the complete native and UI gates', () => {
    for (const { jobs } of [ci, release]) {
      const native = jobs.recovery;
      const installation = steps(native).find((entry) => entry.run === 'node scripts/test-recovery-installation.js')!;
      expect(installation.env).toEqual({ OGC_RECOVERY_GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' });
      const commands = steps(native)
        .map((entry) => entry.run ?? '')
        .join('\n');
      for (const command of ['recovery:check', 'recovery:test', 'recovery:build', 'recovery:smoke']) expect(commands).toContain(command);
      expect(steps(native).some((entry) => entry.run === 'xvfb-run -a npm run recovery:smoke' && entry.if === "runner.os == 'Linux'")).toBe(true);
    }
  });
});
