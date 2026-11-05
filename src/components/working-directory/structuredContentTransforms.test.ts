// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const validation = vi.hoisted(() => vi.fn());
vi.mock('@/services/jsonSchemaClient', () => ({ jsonSchemaClient: { validate: validation } }));
beforeEach(() => validation.mockReset().mockResolvedValue({ success: true, data: [] }));
afterEach(() => vi.unstubAllGlobals());

describe('structured content transforms', () => {
  it('minifies in the browser without fetching external assets or executing embedded code', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network is forbidden.'));
    const send = vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => {
      throw new Error('Network is forbidden.');
    });
    const source =
      '<html><head><link rel="stylesheet" href="https://example.invalid/site.css"><script src="https://example.invalid/app.js"></script><style>body { color: red; }</style></head><body><!-- remove --><script>globalThis.__htmlToolExecuted = true;</script><p>Keep <strong>this space</strong>.</p></body></html>';
    try {
      const result = await minifyHtmlText(source);
      expect(result).toContain('https://example.invalid/site.css');
      expect(result).toContain('https://example.invalid/app.js');
      expect(result).toContain('<style>body { color: red; }</style>');
      expect(result).toContain('<script>globalThis.__htmlToolExecuted = true;</script>');
      expect(result).toContain('<p>Keep <strong>this space</strong>.</p>');
      expect(result).not.toContain('<!-- remove -->');
      expect((globalThis as typeof globalThis & { __htmlToolExecuted?: boolean }).__htmlToolExecuted).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
      send.mockRestore();
    }
  });
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
    validation.mockResolvedValueOnce({ success: true, data: ['/name: must be string'] });
    expect((await validateJsonWithSchema('{"name":42}', schema))[0]).toContain('must be string');
    expect(validation).toHaveBeenLastCalledWith({ source: '{"name":42}', schemaSource: schema });
    validation.mockResolvedValueOnce({ success: false, error: 'Invalid JSON Schema: type must be a valid JSON type' });
    await expect(validateJsonWithSchema('{}', '{"type":"unknown"}')).rejects.toThrow('Invalid JSON Schema');
  });

  it('supports current JSON Schema dialect declarations', async () => {
    const schema = '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"array","prefixItems":[{"type":"string"}]}';

    await expect(validateJsonWithSchema('["ok"]', schema)).resolves.toEqual([]);
    expect(validation).toHaveBeenLastCalledWith({ source: '["ok"]', schemaSource: schema });
    validation.mockResolvedValueOnce({ success: true, data: ['/0: must be string'] });
    expect((await validateJsonWithSchema('[42]', schema))[0]).toContain('must be string');
  });

  it('validates without dynamic code generation in a production-CSP renderer', async () => {
    vi.stubGlobal('Function', function () {
      throw new EvalError('Dynamic code generation is blocked by CSP.');
    });
    await expect(validateJsonWithSchema('{"valid":true}', '{"type":"object"}')).resolves.toEqual([]);
    expect(validation).toHaveBeenCalledWith({ source: '{"valid":true}', schemaSource: '{"type":"object"}' });
  });
});
