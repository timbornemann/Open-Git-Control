import { describe, expect, it } from 'vitest';
import { COMMON_REPOSITORY_RUN_TEMPLATES, applyRepositoryRunTemplate } from '../repositoryRunTemplates';

describe('repository run command templates', () => {
  it('offers common templates for the fixed actions', () => {
    expect(COMMON_REPOSITORY_RUN_TEMPLATES.some((template) => template.id === 'npm-test' && template.action === 'test')).toBe(true);
    expect(COMMON_REPOSITORY_RUN_TEMPLATES.some((template) => template.id === 'rust-build' && template.action === 'build')).toBe(true);
    expect(COMMON_REPOSITORY_RUN_TEMPLATES.some((template) => template.id === 'dotnet-format' && template.action === 'format')).toBe(true);
  });

  it('applies a template without changing the identity of the existing workflow step', () => {
    const template = COMMON_REPOSITORY_RUN_TEMPLATES.find((entry) => entry.id === 'npm-test');
    if (!template) throw new Error('npm test template is missing.');

    const step = applyRepositoryRunTemplate('existing-step', template);

    expect(step.id).toBe('existing-step');
    expect(step.windows?.command).toBe('npm test');
    expect(step.parser).toBe('vitest-jest');
  });
});
