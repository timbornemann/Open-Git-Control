import { describe, expect, it } from 'vitest';
import {
  formatHtmlText,
  formatXmlText,
  formatYamlText,
  jsonToYaml,
  minifyHtmlText,
  minifyXmlText,
  validateJsonWithSchema,
  validateYamlText,
  yamlToJson,
} from './structuredContentTransforms';

describe('structured content transforms', () => {
  it('formats and minifies strict XML', async () => {
    const source = '<root><item id="1">value</item><empty/></root>';
    const formatted = await formatXmlText(source);
    expect(formatted).toContain('\n  <item id="1">value</item>');
    await expect(minifyXmlText(formatted)).resolves.toBe(source);
    await expect(formatXmlText('<root><item></root>')).rejects.toThrow();
  });

  it('formats and minifies HTML while preserving inline content', async () => {
    const source = '<!doctype html><html><body><p>Hello <strong>world</strong></p><!-- remove --></body></html>';
    const formatted = await formatHtmlText(source);
    expect(formatted).toContain('<strong>world</strong>');
    await expect(minifyHtmlText(formatted)).resolves.toBe('<!doctype html><html><body><p>Hello <strong>world</strong></p></body></html>');
  });

  it('formats and validates YAML with comments', async () => {
    const source = '# keep\nname: Ada\nitems:\n- one\n- two\n';
    const formatted = await formatYamlText(source);
    expect(formatted).toContain('# keep');
    expect(formatted).toContain('  - one');
    await expect(validateYamlText('value: [unterminated')).rejects.toThrow('Invalid YAML');
  });

  it('converts JSON and YAML in both directions', async () => {
    await expect(jsonToYaml('{"name":"Ada","active":true}')).resolves.toBe('name: Ada\nactive: true\n');
    await expect(yamlToJson('name: Ada\nactive: true\n')).resolves.toBe('{\n  "name": "Ada",\n  "active": true\n}');
  });

  it('reports JSON Schema validation issues', async () => {
    const schema = '{"type":"object","required":["name"],"properties":{"name":{"type":"string"}}}';
    await expect(validateJsonWithSchema('{"name":"Ada"}', schema)).resolves.toEqual([]);
    expect((await validateJsonWithSchema('{"name":42}', schema))[0]).toContain('must be string');
    await expect(validateJsonWithSchema('{}', '{"type":"unknown"}')).rejects.toThrow('Invalid JSON Schema');
  });

  it('supports current JSON Schema dialect declarations', async () => {
    const schema = '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"array","prefixItems":[{"type":"string"}]}';

    await expect(validateJsonWithSchema('["ok"]', schema)).resolves.toEqual([]);
    expect((await validateJsonWithSchema('[42]', schema))[0]).toContain('must be string');
  });
});
