import { describe, expect, it } from 'vitest';
import { createEmptyRepositoryRunConfig } from '@/types/repositoryRun';
import { buildRepositoryRunAgentPrompt } from '@/utils/repositoryRunAgentPrompt';

describe('repository run agent prompt', () => {
  it('contains the exact target file, configuration rules, and complete empty template', () => {
    const prompt = buildRepositoryRunAgentPrompt({ language: 'en', repositoryPath: 'C:/Repositories/Example App' });

    expect(prompt).toContain('<repository_root>C:/Repositories/Example App</repository_root>');
    expect(prompt).toContain('<target_file>C:/Repositories/Example App/.Open-Git-Control/run.json</target_file>');
    expect(prompt).toContain('windows = powershell or cmd; macos = zsh; linux = bash');
    expect(prompt).toContain('at most 24 steps per action');
    expect(prompt).toContain(JSON.stringify(createEmptyRepositoryRunConfig(), null, 2));
  });

  it('uses the selected language and preserves Windows target paths', () => {
    const prompt = buildRepositoryRunAgentPrompt({ language: 'de', repositoryPath: 'C:\\Repositories\\Example' });

    expect(prompt).toContain('Erstelle oder aktualisiere die Run-Konfiguration');
    expect(prompt).toContain('<target_file>C:\\Repositories\\Example\\.Open-Git-Control\\run.json</target_file>');
    expect(prompt).toContain('<leere_vorlage>');
  });
});
