import { describe, expect, it, vi } from 'vitest';
import { validateDemoJsonSchema } from './demoSchemaValidation';
import { validateJsonSchema } from '../../electron/validation/validateJsonSchema';
import { structuredText } from './demoStructuredExamples';
import { schemaIssues } from '@/shared/tutorial/schemaLessonHelpers';
import { JSON_SCHEMA_MAX_SCHEMA_CHARS, JSON_SCHEMA_MAX_SOURCE_CHARS, type JsonSchemaValidationRequest } from '@/shared/ipc/jsonSchemaValidation';

const contract = structuredText('schema-contract', 'en');
const check = (source: string, schemaSource = contract) => validateDemoJsonSchema({ source, schemaSource });
describe('offline practice schema validation', () => {
  it.each([
    structuredText('base', 'en'),
    structuredText('schema-failure', 'en'),
    '{}',
    '[]',
    'null',
    '42',
    '{"name":"OGC","z":0,"items":[]}',
    '{"name":"OGC","z":1.5,"items":[{"id":2.5,"active":false}]}',
    '{"name":"OGC","z":0,"items":[{"id":1,"active":true},{"id":0}]}',
    '{"name":"OGC","z":0,"items":[null]}',
    '{"name":"OGC","z":0,"items":[{"id":1,"active":true,"extra":0}]}',
    '{"__proto__":{},"name":"OGC","z":0,"items":[]}',
  ])('agrees with the native Ajv validator for %s', async (source) => {
    expect(await check(source)).toEqual({ success: true, data: await validateJsonSchema({ source, schemaSource: contract }) });
  });
  it('reports the five real issue paths used by the lesson', async () => {
    expect(await check(structuredText('schema-failure', 'en'))).toEqual({ success: true, data: schemaIssues });
  });
  it('also checks the actual dialog default schema', async () => {
    expect(await check('{}', '{"type":"object"}')).toEqual({ success: true, data: [] });
    expect(await check('[]', '{"type":"object"}')).toEqual({ success: true, data: ['$: must be object'] });
  });
  it('accepts comments, trailing commas and reordered schema properties', async () => {
    expect(await check('// data\n{"name":"OGC","z":0,"items":[],}', '// schema\n' + contract)).toEqual({ success: true, data: [] });
    expect(await check('{}', '{/* object */ "type":"object",}')).toEqual({ success: true, data: [] });
    const reordered = Object.fromEntries(Object.entries(JSON.parse(contract)).reverse());
    expect(await check(structuredText('base', 'en'), JSON.stringify(reordered))).toEqual({ success: true, data: [] });
  });
  it('keeps syntax errors and unsupported schemas distinct from invalid data', async () => {
    for (const request of [
      { source: '{', schemaSource: contract },
      { source: '{}', schemaSource: '{' },
    ])
      expect(await validateDemoJsonSchema(request)).toEqual({ success: false, error: expect.stringContaining('Invalid JSON/JSONC:') });
    for (const schema of ['false', '{"type":"string"}', '{"$ref":"https://unreachable.invalid/schema"}'])
      expect(await check('{}', schema)).toEqual({ success: false, error: expect.stringContaining('Practice mode supports') });
  });
  it('works with runtime code generation and network disabled', async () => {
    const code = vi.spyOn(globalThis, 'Function').mockImplementation(() => {
      throw new Error('Runtime code generation is forbidden.');
    });
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network is forbidden.'));
    try {
      expect(await check(structuredText('base', 'en'))).toEqual({ success: true, data: [] });
      expect(await check(structuredText('schema-failure', 'en'))).toEqual({ success: true, data: schemaIssues });
      expect(fetch).not.toHaveBeenCalled();
      expect(code).not.toHaveBeenCalled();
    } finally {
      code.mockRestore();
      fetch.mockRestore();
    }
  });
  it('rejects malformed and oversized requests before parsing', async () => {
    const requests = [
      null,
      {},
      { source: 1, schemaSource: '{}' },
      { source: ' '.repeat(JSON_SCHEMA_MAX_SOURCE_CHARS + 1), schemaSource: contract },
      { source: '{}', schemaSource: ' '.repeat(JSON_SCHEMA_MAX_SCHEMA_CHARS + 1) },
    ];
    for (const request of requests)
      expect(await validateDemoJsonSchema(request as JsonSchemaValidationRequest)).toEqual({
        success: false,
        error: expect.stringContaining('Invalid or oversized'),
      });
  });
  it('does not leak issues between consecutive calls', async () => {
    const invalid = await check(structuredText('schema-failure', 'en'));
    expect(await check(structuredText('base', 'en'))).toEqual({ success: true, data: [] });
    expect(invalid).toEqual({ success: true, data: schemaIssues });
  });
});
