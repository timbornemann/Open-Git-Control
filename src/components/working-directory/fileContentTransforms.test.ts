import { describe, expect, it } from 'vitest';
import { compactTextToSingleLine, formatJsonText, isCsvFilePath, isJsonFilePath, minifyJsonText } from './fileContentTransforms';

describe('file content transforms', () => {
  it('compacts non-empty trimmed lines without changing internal spaces', () => {
    expect(compactTextToSingleLine('  first  value  \r\n\r\n second value\n\tthird\tvalue\t')).toBe('first  value second value third\tvalue');
  });

  it('formats and minifies JSON without rewriting large numbers or string escapes', () => {
    const source = ' { "big" : 12345678901234567890, "escaped" : "\\u0041", "nested" : [true,{"value":"a  b"}] } ';
    const minified = '{"big":12345678901234567890,"escaped":"\\u0041","nested":[true,{"value":"a  b"}]}';

    expect(minifyJsonText(source)).toBe(minified);
    expect(formatJsonText(source)).toBe(
      [
        '{',
        '  "big": 12345678901234567890,',
        '  "escaped": "\\u0041",',
        '  "nested": [',
        '    true,',
        '    {',
        '      "value": "a  b"',
        '    }',
        '  ]',
        '}',
      ].join('\n'),
    );
  });

  it('rejects invalid JSON instead of partially transforming it', () => {
    expect(() => minifyJsonText('{"missing": }')).toThrow('Invalid JSON');
    expect(() => formatJsonText('')).toThrow('Invalid JSON');
  });

  it('minifies JSONC comments and trailing commas while preserving comment-like strings', () => {
    const source = [
      '{',
      '  // TypeScript accepts JSON with comments.',
      '  "url": "https://example.test/a//b",',
      '  "compilerOptions": {',
      '    /* Preserve this large numeric token exactly. */',
      '    "large": 12345678901234567890,',
      '    "libs": ["DOM", "ES2020",],',
      '  },',
      '}',
    ].join('\n');

    expect(minifyJsonText(source)).toBe('{"url":"https://example.test/a//b","compilerOptions":{"large":12345678901234567890,"libs":["DOM","ES2020"]}}');
  });

  it('formats JSONC without discarding its comments or trailing commas', () => {
    const source = '{"compilerOptions":{/* Bundler mode */"module":"ESNext",// keep this\n"strict":true,},}';

    expect(formatJsonText(source)).toBe(
      ['{', '  "compilerOptions": {', '    /* Bundler mode */', '    "module": "ESNext", // keep this', '    "strict": true,', '  },', '}'].join('\n'),
    );
  });

  it('rejects malformed JSONC comments and values', () => {
    expect(() => minifyJsonText('{"value": 1, /* unfinished')).toThrow('unterminated block comment');
    expect(() => formatJsonText('{"value": nope,}')).toThrow('Invalid JSON/JSONC');
  });

  it('detects JSON and CSV extensions case-insensitively', () => {
    expect(isJsonFilePath('config/SETTINGS.JSON')).toBe(true);
    expect(isJsonFilePath('settings.jsonc')).toBe(true);
    expect(isCsvFilePath('data/EXPORT.CSV')).toBe(true);
  });
});
