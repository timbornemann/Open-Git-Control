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

  it('detects JSON and CSV extensions case-insensitively', () => {
    expect(isJsonFilePath('config/SETTINGS.JSON')).toBe(true);
    expect(isJsonFilePath('settings.jsonc')).toBe(false);
    expect(isCsvFilePath('data/EXPORT.CSV')).toBe(true);
  });
});
