import { describe, expect, it } from 'vitest';
import { formatJsonText, minifyJsonText, sortJsonKeys, getJsonPathAtOffset } from '@/components/working-directory/fileContentTransforms';
import { structuredText } from './demoStructuredExamples';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import type { TutorialLaunchContext } from '@/shared/tutorial/types';
import { formatYamlText, validateYamlText, jsonToYaml, yamlToJson } from '@/components/working-directory/structuredContentTransforms';

describe.each(['de', 'en'] as const)('structured examples in %s', (language) => {
  it('rejects incomplete JSON for all four tools, then resolves the repaired selection', () => {
    const invalid = structuredText('json-invalid', language);
    for (const transform of [formatJsonText, minifyJsonText, sortJsonKeys, (text: string) => getJsonPathAtOffset(text, 2)])
      expect(() => transform(invalid)).toThrow('Invalid JSON/JSONC:');
    expect(getJsonPathAtOffset(structuredText('base', language), 15)).toBe('$.name');
  });
  it('preserves data and types through real YAML formatting and both conversions', async () => {
    expect(await formatYamlText(structuredText('yaml-base', language))).toBe(structuredText('yaml-formatted', language));
    expect(await jsonToYaml(structuredText('base', language))).toBe(structuredText('yaml-formatted', language));
    expect(await yamlToJson(structuredText('yaml-base', language))).toBe(structuredText('formatted', language));
    await expect(validateYamlText(structuredText('yaml-formatted', language))).resolves.toBeUndefined();
    for (const transform of [formatYamlText, validateYamlText, yamlToJson])
      await expect(transform(structuredText('yaml-invalid', language))).rejects.toThrow('Map keys must be unique');
    await expect(jsonToYaml(structuredText('json-invalid', language))).rejects.toThrow('Invalid JSON/JSONC:');
  });
  it('matches all three real JSON transformations without changing the data', () => {
    const base = structuredText('base', language),
      formatted = structuredText('formatted', language),
      sorted = structuredText('sorted', language);
    expect(formatJsonText(base)).toBe(formatted);
    expect(minifyJsonText(formatted)).toBe(base);
    expect(sortJsonKeys(base)).toBe(sorted);
    expect(JSON.parse(sorted)).toEqual(JSON.parse(base));
  });
  it('matches cursor and selection positions to the expected JSON paths', () => {
    const base = structuredText('base', language);
    expect(base.slice(15, 18)).toBe('OGC');
    expect(base.slice(46, 50)).toBe('true');
    expect(getJsonPathAtOffset(base, 15)).toBe('$.name');
    expect(getJsonPathAtOffset(base, 46)).toBe('$.items[0].active');
    expect(getJsonPathAtOffset(base, 0)).toBe('$');
  });
  it('creates a clean versioned config and restores a formatted draft with an unchanged index', () => {
    const context: TutorialLaunchContext = {
      request: { chapterId: 'json-formatting' },
      language,
      theme: 'copper-night',
      progress: { version: 1, welcomeSeen: true, completedChapters: [] },
    };
    const chapter = TUTORIAL_CHAPTERS.find((entry) => entry.id === 'json-formatting')!;
    const clean = createDemoApi(context, chapter.steps[0]);
    expect(clean.repo.status()).toBe('');
    expect(clean.repo.files['config.json']).toBe(structuredText('base', language));
    const replay = createDemoApi(
      context,
      chapter.steps.find((step) => step.id === 'json-minify-apply')!,
    );
    expect(replay.repo.files['config.json']).toBe(structuredText('formatted', language));
    expect(replay.repo.indexFiles['config.json']).toBe(structuredText('base', language));
    expect([...replay.repo.modified]).toEqual(['config.json']);
  });
});
