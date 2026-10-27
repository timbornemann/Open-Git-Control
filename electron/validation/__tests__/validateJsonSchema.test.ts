import { describe, expect, it } from 'vitest';
import { validateJsonSchema } from '../validateJsonSchema';

const validate = (data: string, schema: unknown) => validateJsonSchema({ source: data, schemaSource: JSON.stringify(schema) });
describe('JSON Schema validation in the background worker', () => {
  it.each(['http://json-schema.org/draft-07/schema#', 'https://json-schema.org/draft/2019-09/schema', 'https://json-schema.org/draft/2020-12/schema'])(
    'preserves all errors, locations and schema semantics for %s',
    async ($schema) => {
      const schema = {
        $schema,
        type: 'object',
        required: ['name', 'active'],
        properties: { name: { type: 'string' }, count: { type: 'integer', minimum: 1 } },
      };
      await expect(validate('{"name":"Ada","active":true}', schema)).resolves.toEqual([]);
      const issues = await validate('{"name":42,"count":0}', schema);
      expect(issues).toEqual(expect.arrayContaining(["$: must have required property 'active'", '/name: must be string', '/count: must be >= 1']));
    },
  );
  it('supports 2020-12 tuples, local references, and unevaluated properties', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: { name: { type: 'string' } },
      type: 'array',
      prefixItems: [{ $ref: '#/$defs/name' }],
      items: false,
    };
    await expect(validate('["ok"]', schema)).resolves.toEqual([]);
    expect((await validate('[42]', schema))[0]).toBe('/0: must be string');
    expect(await validate('["ok",42]', schema)).not.toEqual([]);
    const object = {
      $schema: 'https://json-schema.org/draft/2019-09/schema',
      type: 'object',
      properties: { name: { type: 'string' } },
      unevaluatedProperties: false,
    };
    expect(await validate('{"name":"ok","extra":true}', object)).toEqual(['$: must NOT have unevaluated properties']);
  });
  it('preserves JSONC comments, trailing commas and boolean schemas', async () => {
    await expect(validateJsonSchema({ source: '{/* comment */ "name":"Ada",}', schemaSource: '// schema\n{"type":"object",}' })).resolves.toEqual([]);
    await expect(validate('null', true)).resolves.toEqual([]);
    expect(await validate('null', false)).toEqual(['$: boolean schema is false']);
  });
  it('keeps syntax errors distinct from invalid schemas and missing references', async () => {
    await expect(validateJsonSchema({ source: '{', schemaSource: '{}' })).rejects.toThrow('Invalid JSON/JSONC:');
    await expect(validateJsonSchema({ source: '{}', schemaSource: '/* unclosed' })).rejects.toThrow('Invalid JSON/JSONC: unterminated block comment.');
    await expect(validate('{}', { type: 'unknown' })).rejects.toThrow('Invalid JSON Schema:');
    await expect(validate('{}', { $ref: 'https://unreachable.invalid/schema.json' })).rejects.toThrow('Invalid JSON Schema:');
  });
  it('awaits async schema results and returns ordinary validation issues', async () => {
    await expect(validate('1', { $async: true, type: 'number' })).resolves.toEqual([]);
    await expect(validate('"invalid"', { $async: true, type: 'number' })).resolves.toEqual(['$: must be number']);
  });
});
