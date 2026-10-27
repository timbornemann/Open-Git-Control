export const stripJsonComments = (source: string): string => {
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

export const normalizeAndValidateJsonc = (source: string): string => {
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

export const parseJsonText = (source: string): unknown => JSON.parse(normalizeAndValidateJsonc(source));
