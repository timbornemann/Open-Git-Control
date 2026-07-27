import { describe, expect, it } from 'vitest';
import { parseCsvDocument, serializeCsvDocument } from './csvDocument';

describe('CSV document parsing and serialization', () => {
  it('parses quoted delimiters, escaped quotes, multiline fields and CRLF endings', () => {
    const document = parseCsvDocument('name,notes\r\n"Ada","hello, ""world"""\r\n"Lin","line 1\r\nline 2"\r\n');

    expect(document).toEqual({
      rows: [
        ['name', 'notes'],
        ['Ada', 'hello, "world"'],
        ['Lin', 'line 1\nline 2'],
      ],
      delimiter: ',',
      lineEnding: '\r\n',
      hasFinalLineBreak: true,
    });
    expect(serializeCsvDocument(document)).toBe('name,notes\r\nAda,"hello, ""world"""\r\nLin,"line 1\r\nline 2"\r\n');
  });

  it('detects semicolon and tab delimiters while preserving uneven rows', () => {
    const semicolon = parseCsvDocument('name;city;note\nAda;Berlin\nLin;Paris;"a;b"');
    const tab = parseCsvDocument('name\tage\nAda\t36');

    expect(semicolon.delimiter).toBe(';');
    expect(semicolon.rows).toEqual([
      ['name', 'city', 'note'],
      ['Ada', 'Berlin'],
      ['Lin', 'Paris', 'a;b'],
    ]);
    expect(serializeCsvDocument(semicolon)).toBe('name;city;note\nAda;Berlin\nLin;Paris;"a;b"');
    expect(tab.delimiter).toBe('\t');
  });

  it('allows an explicit delimiter when an otherwise ambiguous file is opened', () => {
    const document = parseCsvDocument('1,23;apples\n2,50;pears', ';');

    expect(document.delimiter).toBe(';');
    expect(document.rows).toEqual([
      ['1,23', 'apples'],
      ['2,50', 'pears'],
    ]);
  });

  it('quotes edited fields when needed and preserves a final line break', () => {
    const document = parseCsvDocument('name,value\nAda,plain\n');
    document.rows[1][1] = ' leading, "quoted" ';

    expect(serializeCsvDocument(document)).toBe('name,value\nAda," leading, ""quoted"" "\n');
  });

  it('reports malformed quoted fields instead of silently corrupting rows', () => {
    expect(() => parseCsvDocument('name,notes\nAda,"unfinished')).toThrow('unterminated quoted field');
    expect(() => parseCsvDocument('name,notes\nAd"a,test')).toThrow('Unexpected quote');
  });
});
