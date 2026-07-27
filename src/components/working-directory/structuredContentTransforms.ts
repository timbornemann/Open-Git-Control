import type { ErrorObject } from 'ajv';
import { parseJsonText } from './fileContentTransforms';

const yamlDocument = async (source: string) => {
  const { parseDocument } = await import('yaml');
  const document = parseDocument(source, { prettyErrors: true, uniqueKeys: true });
  if (document.errors.length > 0) throw new Error(`Invalid YAML: ${document.errors.map((error) => error.message).join('\n')}`);
  return document;
};

export const formatYamlText = async (source: string): Promise<string> => (await yamlDocument(source)).toString({ indent: 2, lineWidth: 0 });

export const validateYamlText = async (source: string): Promise<void> => {
  await yamlDocument(source);
};

export const jsonToYaml = async (source: string): Promise<string> => {
  const { stringify } = await import('yaml');
  return stringify(parseJsonText(source), { indent: 2, lineWidth: 0 });
};

export const yamlToJson = async (source: string): Promise<string> => JSON.stringify((await yamlDocument(source)).toJS(), null, 2);

export const formatXmlText = async (source: string): Promise<string> => {
  const { default: xmlFormat } = await import('xml-formatter');
  return xmlFormat(source, {
    indentation: '  ',
    lineSeparator: '\n',
    strictMode: true,
    collapseContent: true,
  });
};

export const minifyXmlText = async (source: string): Promise<string> => {
  const { default: xmlFormat } = await import('xml-formatter');
  return xmlFormat.minify(source, { strictMode: true, collapseContent: true });
};

export const formatHtmlText = async (source: string): Promise<string> => {
  const [{ format }, prettierHtmlPlugin] = await Promise.all([import('prettier/standalone'), import('prettier/plugins/html')]);
  return format(source, {
    parser: 'html',
    plugins: [prettierHtmlPlugin],
    tabWidth: 2,
    printWidth: 120,
    htmlWhitespaceSensitivity: 'css',
  });
};

export const minifyHtmlText = async (source: string): Promise<string> => {
  const { minify } = await import('html-minifier-terser');
  return minify(source, {
    collapseWhitespace: true,
    conservativeCollapse: false,
    keepClosingSlash: true,
    minifyCSS: false,
    minifyJS: false,
    removeComments: true,
    removeRedundantAttributes: false,
  });
};

const describeSchemaError = (error: ErrorObject): string => {
  const location = error.instancePath || '$';
  return `${location}: ${error.message || error.keyword}`;
};

export const validateJsonWithSchema = async (source: string, schemaSource: string): Promise<string[]> => {
  const schema = parseJsonText(schemaSource);
  const data = parseJsonText(source);
  try {
    const dialect = schema && typeof schema === 'object' && '$schema' in schema ? String((schema as { $schema?: unknown }).$schema || '') : '';
    const module = dialect.includes('2020-12')
      ? await import('ajv/dist/2020')
      : dialect.includes('2019-09')
        ? await import('ajv/dist/2019')
        : await import('ajv');
    const ajv = new module.default({ allErrors: true, strict: false });
    const validate = ajv.compile(schema as object);
    return validate(data) ? [] : (validate.errors || []).map(describeSchemaError);
  } catch (error: unknown) {
    throw new Error(`Invalid JSON Schema: ${error instanceof Error ? error.message : String(error)}`);
  }
};
