import { describe, expect, it } from 'vitest';
import { COMMON_REPOSITORY_RUN_TEMPLATES } from '../repositoryRunTemplates';
import { describeRunPrerequisiteError, getRepositoryRunPrerequisiteIssues, getRepositoryRunPrograms } from '@/shared/repositoryRunPrerequisites';

describe('known Run command prerequisites', () => {
  it('covers every bundled template on every supported platform', () => {
    for (const template of COMMON_REPOSITORY_RUN_TEMPLATES)
      for (const platform of ['windows', 'macos', 'linux'] as const) {
        expect(getRepositoryRunPrograms(template.step[platform]!.command, platform), `${template.id} on ${platform}`).not.toEqual([]);
      }
  });
  it('recognizes saved and edited template commands without requiring template metadata', () => {
    expect(getRepositoryRunPrograms('pnpm run workspace-test -- --watch', 'linux')).toEqual(['node', 'pnpm']);
    expect(getRepositoryRunPrograms('& "Python.exe" main.py', 'windows')).toEqual(['python']);
    expect(getRepositoryRunPrograms('python3 -m pytest', 'macos')).toEqual(['python3']);
    expect(getRepositoryRunPrograms('.\\gradlew.bat build', 'windows')).toEqual(['gradlew', 'java']);
    expect(getRepositoryRunPrograms('npm-malicious test', 'linux')).toEqual([]);
    expect(getRepositoryRunPrograms('/my/custom/bin/npm test', 'linux')).toEqual([]);
  });
  it('uses the exact shell checks and ignores tools needed only by other actions', () => {
    const step = { label: 'Build', parser: 'none' as const, windows: { shell: 'cmd' as const, command: 'cargo build' } };
    const checks = [
      { program: 'cargo' as const, shell: 'powershell' as const, state: 'missing' as const },
      { program: 'npm' as const, shell: 'cmd' as const, state: 'missing' as const },
    ];
    expect(getRepositoryRunPrerequisiteIssues([step], { platform: 'windows', checks, checkedAt: 1 })).toEqual({ missing: [], unknown: ['cargo'] });
  });
  it('presents localized missing and failed checks with a next action', () => {
    const tr = (de: string, _en: string) => de;
    expect(describeRunPrerequisiteError('RUN_PREREQUISITES:{"missing":["npm"],"unknown":[]}', tr)).toContain('Benötigte Programme fehlen: npm');
    expect(describeRunPrerequisiteError('RUN_PREREQUISITES:{"missing":[],"unknown":["cargo"]}', tr)).toContain('konnte nicht geprüft werden');
    expect(describeRunPrerequisiteError('ordinary run error', tr)).toBeNull();
  });
});
