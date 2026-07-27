export const isJsonFilePath = (filePath: string): boolean => filePath.toLowerCase().endsWith('.json');
export const isCsvFilePath = (filePath: string): boolean => filePath.toLowerCase().endsWith('.csv');

const validateJson = (source: string): void => {
  try {
    JSON.parse(source);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON: ${detail}`);
  }
};

const stripJsonWhitespace = (source: string): string => {
  let result = '';
  let inString = false;
  let escaped = false;
  for (const character of source) {
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
    } else if (!/\s/.test(character)) {
      result += character;
    }
  }
  return result;
};

export const minifyJsonText = (source: string): string => {
  validateJson(source);
  return stripJsonWhitespace(source);
};

export const formatJsonText = (source: string, indentation = 2): string => {
  const compact = minifyJsonText(source);
  const indent = (depth: number) => ' '.repeat(depth * indentation);
  let result = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < compact.length; index += 1) {
    const character = compact[index];
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === '{' || character === '[') {
      result += character;
      const matchingClose = character === '{' ? '}' : ']';
      if (compact[index + 1] !== matchingClose) {
        depth += 1;
        result += `\n${indent(depth)}`;
      }
      continue;
    }
    if (character === '}' || character === ']') {
      const matchingOpen = character === '}' ? '{' : '[';
      if (compact[index - 1] !== matchingOpen) {
        depth -= 1;
        result += `\n${indent(depth)}`;
      }
      result += character;
      continue;
    }
    if (character === ',') {
      result += `,\n${indent(depth)}`;
      continue;
    }
    result += character === ':' ? ': ' : character;
  }
  return result;
};

export const compactTextToSingleLine = (source: string): string =>
  source
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
