import type { JsonSchemaValidationRequest } from '@/shared/ipc/jsonSchemaValidation';
import { JSON_SCHEMA_MAX_SOURCE_CHARS, JSON_SCHEMA_MAX_SCHEMA_CHARS } from '@/shared/ipc/jsonSchemaValidation';
import type { IpcResult } from '@/types/ipc';
import { parseJsonText } from '@/shared/jsonText';
import { canonicalJsonValue as canonical } from '@/shared/tutorial/jsonExerciseValue';
import { structuredText } from './demoStructuredExamples';
import { validateObject, validateContract } from './generated/practice-schema.mjs';

const contractKey = canonical(parseJsonText(structuredText('schema-contract', 'en')));
const unsupported =
  'Im Übungsmodus sind das Standardschema und das mitgelieferte Projektschema verfügbar. / Practice mode supports the default schema and the supplied project schema.';

/** Precompiled by Ajv: real input checks without runtime code generation, I/O or native IPC. */
export async function validateDemoJsonSchema(request: JsonSchemaValidationRequest): Promise<IpcResult<string[]>> {
  try {
    if (
      !request ||
      typeof request.source !== 'string' ||
      typeof request.schemaSource !== 'string' ||
      request.source.length > JSON_SCHEMA_MAX_SOURCE_CHARS ||
      request.schemaSource.length > JSON_SCHEMA_MAX_SCHEMA_CHARS
    )
      throw new Error('Ungültige oder zu große Prüfanfrage. / Invalid or oversized validation request.');
    const schema = parseJsonText(request.schemaSource);
    const source = parseJsonText(request.source);
    const key = canonical(schema);
    const validate = key === contractKey ? validateContract : key === '{"type":"object"}' ? validateObject : null;
    if (!validate) return { success: false, error: unsupported };
    const valid = validate(source);
    const issues = valid ? [] : (validate.errors || []).map((error) => `${error.instancePath || '$'}: ${error.message || error.keyword}`);
    return { success: true, data: issues };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
