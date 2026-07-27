import { getLocation, parseTree, type Node as JsonNode, type ParseError } from 'jsonc-parser';

export const isJsonFilePath = (filePath: string): boolean => {
  const lowerPath = filePath.toLowerCase();
  return lowerPath.endsWith('.json') || lowerPath.endsWith('.jsonc');
};
export const isCsvFilePath = (filePath: string): boolean => filePath.toLowerCase().endsWith('.csv');
export const isYamlFilePath = (filePath: string): boolean => /\.(?:ya?ml)$/i.test(filePath);
export const isXmlFilePath = (filePath: string): boolean => /\.(?:xml|svg|xhtml)$/i.test(filePath);
export const isHtmlFilePathForTools = (filePath: string): boolean => /\.html?$/i.test(filePath);

type JsoncToken = {
  type: 'comment' | 'punctuation' | 'string' | 'literal';
  value: string;
};

const stripJsonComments = (source: string): string => {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
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
    if (character === '/' && source[index + 1] === '/') {
      result += '  ';
      index += 2;
      while (index < source.length && source[index] !== '\r' && source[index] !== '\n') {
        result += ' ';
        index += 1;
      }
      index -= 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      result += '  ';
      index += 2;
      let closed = false;
      while (index < source.length) {
        if (source[index] === '*' && source[index + 1] === '/') {
          result += '  ';
          index += 1;
          closed = true;
          break;
        }
        result += source[index] === '\r' || source[index] === '\n' ? source[index] : ' ';
        index += 1;
      }
      if (!closed) throw new Error('Invalid JSON/JSONC: unterminated block comment.');
      continue;
    }
    result += character;
  }
  return result;
};

const removeTrailingJsonCommas = (source: string): string => {
  const characters = [...source];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character !== ',') continue;
    let nextIndex = index + 1;
    while (nextIndex < characters.length && /\s/.test(characters[nextIndex])) nextIndex += 1;
    if (characters[nextIndex] === '}' || characters[nextIndex] === ']') characters[index] = ' ';
  }
  return characters.join('');
};

const normalizeJsoncForValidation = (source: string): string => removeTrailingJsonCommas(stripJsonComments(source));

const normalizeAndValidateJsonc = (source: string): string => {
  try {
    const normalized = normalizeJsoncForValidation(source);
    JSON.parse(normalized);
    return normalized;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('Invalid JSON/JSONC:')) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON/JSONC: ${detail}`);
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
  return stripJsonWhitespace(normalizeAndValidateJsonc(source));
};

export const parseJsonText = (source: string): unknown => JSON.parse(normalizeAndValidateJsonc(source));

const tokenizeJsonc = (source: string): JsoncToken[] => {
  const tokens: JsoncToken[] = [];
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '/') {
      const start = index;
      index += 2;
      while (index < source.length && source[index] !== '\r' && source[index] !== '\n') index += 1;
      tokens.push({ type: 'comment', value: source.slice(start, index) });
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      const start = index;
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index = Math.min(source.length, index + 2);
      tokens.push({ type: 'comment', value: source.slice(start, index) });
      continue;
    }
    if (character === '"') {
      const start = index;
      index += 1;
      let escaped = false;
      while (index < source.length) {
        const stringCharacter = source[index];
        index += 1;
        if (escaped) escaped = false;
        else if (stringCharacter === '\\') escaped = true;
        else if (stringCharacter === '"') break;
      }
      tokens.push({ type: 'string', value: source.slice(start, index) });
      continue;
    }
    if ('{}[],:'.includes(character)) {
      tokens.push({ type: 'punctuation', value: character });
      index += 1;
      continue;
    }
    const start = index;
    while (index < source.length && !/\s/.test(source[index]) && !'{}[],:'.includes(source[index])) {
      if (source[index] === '/' && (source[index + 1] === '/' || source[index + 1] === '*')) break;
      index += 1;
    }
    tokens.push({ type: 'literal', value: source.slice(start, index) });
  }
  return tokens;
};

const formatComment = (comment: string, depth: number, indentation: number): string =>
  comment
    .trim()
    .split(/\r\n|\r|\n/)
    .map((line, index) => (index === 0 ? line.trimEnd() : `${' '.repeat(depth * indentation)}${line.trim()}`))
    .join('\n');

export const formatJsonText = (source: string, indentation = 2): string => {
  normalizeAndValidateJsonc(source);
  const tokens = tokenizeJsonc(source);
  const indent = (depth: number) => ' '.repeat(depth * indentation);
  const lines = [''];
  let depth = 0;
  const write = (value: string) => {
    lines[lines.length - 1] += value;
  };
  const startLine = (lineDepth: number) => {
    const indentationText = indent(lineDepth);
    if (lines[lines.length - 1].trim().length === 0) lines[lines.length - 1] = indentationText;
    else lines.push(indentationText);
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const previousToken = tokens[index - 1];
    const nextToken = tokens[index + 1];
    if (token.type === 'comment') {
      if (lines[lines.length - 1].trim().length > 0) write(' ');
      write(formatComment(token.value, depth, indentation));
      startLine(depth);
    } else if (token.value === '{' || token.value === '[') {
      write(token.value);
      depth += 1;
      const matchingClose = token.value === '{' ? '}' : ']';
      if (nextToken?.value !== matchingClose) startLine(depth);
    } else if (token.value === '}' || token.value === ']') {
      depth -= 1;
      const matchingOpen = token.value === '}' ? '{' : '[';
      if (previousToken?.value !== matchingOpen) startLine(depth);
      write(token.value);
    } else if (token.value === ',') {
      write(',');
      if (nextToken?.type !== 'comment' && nextToken?.value !== '}' && nextToken?.value !== ']') startLine(depth);
    } else if (token.value === ':') {
      write(': ');
    } else {
      write(token.value);
    }
  }
  return lines.join('\n').trim();
};

export const compactTextToSingleLine = (source: string): string =>
  source
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');

const assertJsonTree = (source: string): JsonNode => {
  const errors: ParseError[] = [];
  const tree = parseTree(source, errors, { allowTrailingComma: true, disallowComments: false });
  if (!tree || errors.length > 0) {
    normalizeAndValidateJsonc(source);
    throw new Error('Invalid JSON/JSONC.');
  }
  return tree;
};

const renderSortedJsonNode = (source: string, node: JsonNode, depth: number, indentation: number): string => {
  if (node.type !== 'object' && node.type !== 'array') return source.slice(node.offset, node.offset + node.length);
  const children = node.children || [];
  if (children.length === 0) return node.type === 'object' ? '{}' : '[]';

  const indent = (level: number) => ' '.repeat(level * indentation);
  if (node.type === 'array') {
    const values = children.map((child) => `${indent(depth + 1)}${renderSortedJsonNode(source, child, depth + 1, indentation)}`);
    return `[\n${values.join(',\n')}\n${indent(depth)}]`;
  }

  const properties = [...children].sort((left, right) => {
    const leftKey = String(left.children?.[0]?.value ?? '');
    const rightKey = String(right.children?.[0]?.value ?? '');
    return leftKey.localeCompare(rightKey);
  });
  const values = properties.map((property) => {
    const key = property.children?.[0];
    const value = property.children?.[1];
    if (!key || !value) throw new Error('Invalid JSON/JSONC object property.');
    const rawKey = source.slice(key.offset, key.offset + key.length);
    return `${indent(depth + 1)}${rawKey}: ${renderSortedJsonNode(source, value, depth + 1, indentation)}`;
  });
  return `{\n${values.join(',\n')}\n${indent(depth)}}`;
};

export const sortJsonKeys = (source: string, indentation = 2): string => {
  normalizeAndValidateJsonc(source);
  if (stripJsonComments(source) !== source) {
    throw new Error('JSONC keys cannot be sorted without removing comments. Remove the comments or use a strict JSON file.');
  }
  return renderSortedJsonNode(source, assertJsonTree(source), 0, indentation);
};

const formatJsonPath = (segments: Array<string | number>): string =>
  segments.reduce<string>((result, segment) => {
    if (typeof segment === 'number') return `${result}[${segment}]`;
    return /^[A-Za-z_$][\w$]*$/.test(segment) ? `${result}.${segment}` : `${result}[${JSON.stringify(segment)}]`;
  }, '$');

export const getJsonPathAtOffset = (source: string, offset: number): string => {
  normalizeAndValidateJsonc(source);
  const boundedOffset = Math.max(0, Math.min(source.length, offset));
  return formatJsonPath(getLocation(source, boundedOffset).path);
};
