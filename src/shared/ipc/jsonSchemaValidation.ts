export type JsonSchemaValidationRequest = {
  source: string;
  schemaSource: string;
};

export const JSON_SCHEMA_MAX_SOURCE_CHARS = 16 * 1024 * 1024;
export const JSON_SCHEMA_MAX_SCHEMA_CHARS = 2 * 1024 * 1024;
