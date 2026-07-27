export type TextSelection = { from: number; to: number };

const splitLines = (source: string): { lines: string[]; trailingLineEnding: boolean } => {
  if (source.length === 0) return { lines: [], trailingLineEnding: false };
  const trailingLineEnding = /(?:\r\n|\r|\n)$/.test(source);
  const lines = source.replace(/\r\n|\r/g, '\n').split('\n');
  if (trailingLineEnding) lines.pop();
  return { lines, trailingLineEnding };
};

const joinLines = (lines: string[], trailingLineEnding: boolean): string => {
  const result = lines.join('\n');
  return trailingLineEnding && lines.length > 0 ? `${result}\n` : result;
};

const transformLines = (source: string, transform: (lines: string[]) => string[]): string => {
  const { lines, trailingLineEnding } = splitLines(source);
  return joinLines(transform(lines), trailingLineEnding);
};

export const sortLines = (source: string): string =>
  transformLines(source, (lines) => [...lines].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })));

export const removeDuplicateLines = (source: string): string => transformLines(source, (lines) => [...new Set(lines)]);

export const removeEmptyLines = (source: string): string => transformLines(source, (lines) => lines.filter((line) => line.trim().length > 0));

export const trimLines = (source: string): string => transformLines(source, (lines) => lines.map((line) => line.trim()));

export const addToLines = (source: string, prefix: string, suffix: string): string =>
  transformLines(source, (lines) => lines.map((line) => `${prefix}${line}${suffix}`));

export const changeTextCase = (source: string, mode: 'upper' | 'lower'): string => (mode === 'upper' ? source.toLocaleUpperCase() : source.toLocaleLowerCase());

export const replaceTextSelection = (source: string, selection: TextSelection, replacement: string): string =>
  `${source.slice(0, selection.from)}${replacement}${source.slice(selection.to)}`;

export const selectedTextOrDocument = (source: string, selection: TextSelection): { value: string; selection: TextSelection } => {
  const from = Math.max(0, Math.min(source.length, selection.from));
  const to = Math.max(from, Math.min(source.length, selection.to));
  return from === to ? { value: source, selection: { from: 0, to: source.length } } : { value: source.slice(from, to), selection: { from, to } };
};

const bytesToBinaryString = (bytes: Uint8Array): string => {
  let result = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return result;
};

export const encodeBase64 = (source: string): string => btoa(bytesToBinaryString(new TextEncoder().encode(source)));

export const decodeBase64 = (source: string): string => {
  try {
    const normalized = source.replace(/\s+/g, '');
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Invalid Base64 or the decoded data is not UTF-8 text.');
  }
};

export const encodeUrlComponent = (source: string): string => encodeURIComponent(source);

export const decodeUrlComponent = (source: string): string => {
  try {
    return decodeURIComponent(source);
  } catch {
    throw new Error('Invalid URL-encoded text.');
  }
};

export type TextMetrics = {
  characters: number;
  words: number;
  lines: number;
};

export const getTextMetrics = (source: string): TextMetrics => ({
  characters: source.length,
  words: source.trim().length === 0 ? 0 : source.trim().split(/\s+/u).length,
  lines: source.length === 0 ? 0 : source.split(/\r\n|\r|\n/).length,
});
