import type { ErrorObject } from 'ajv';
import type { JsonSchemaValidationRequest } from '../../src/shared/ipc/jsonSchemaValidation';
import { parseJsonText } from '../../src/shared/jsonText';

const describe = (error: ErrorObject): string => `${error.instancePath || '$'}: ${error.message || error.keyword}`;

/** Runtime schemas need Ajv compilation, so this module belongs only in the Node worker. */
export async function validateJsonSchema({ source, schemaSource }: JsonSchemaValidationRequest): Promise<string[]> {
  const schema = parseJsonText(schemaSource);
  const data = parseJsonText(source);
  let validate;
  try {
    const dialect = schema && typeof schema === 'object' && '$schema' in schema ? String((schema as { $schema?: unknown }).$schema || '') : '';
    const module = dialect.includes('2020-12')
      ? await import('ajv/dist/2020')
      : dialect.includes('2019-09')
        ? await import('ajv/dist/2019')
        : await import('ajv');
    validate = new module.default({ allErrors: true, strict: false }).compile(schema as object);
  } catch (error: unknown) {
    throw new Error(`Invalid JSON Schema: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return (await validate(data)) ? [] : (validate.errors || []).map(describe);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'errors' in error && Array.isArray(error.errors)) return (error.errors as ErrorObject[]).map(describe);
    throw error;
  }
}
