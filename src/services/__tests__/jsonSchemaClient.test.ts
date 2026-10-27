import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonSchemaClient } from '../jsonSchemaClient';

afterEach(() => vi.unstubAllGlobals());
describe('JSON Schema IPC client', () => {
  it('forwards source text unchanged and returns validation issues', async () => {
    const result = { success: true, data: ['/name: must be string'] };
    const validateJsonSchema = vi.fn().mockResolvedValue(result);
    vi.stubGlobal('window', { electronAPI: { app: { validateJsonSchema } } });
    const request = { source: '{/* comment */ "name":42,}', schemaSource: '{"type":"object"}' };
    await expect(jsonSchemaClient.validate(request)).resolves.toEqual(result);
    expect(validateJsonSchema).toHaveBeenCalledWith(request);
  });
});
