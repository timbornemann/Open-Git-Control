export type CsvDelimiter = ',' | ';' | '\t';

export type CsvDocument = {
  rows: string[][];
  delimiter: CsvDelimiter;
  lineEnding: '\n' | '\r\n' | '\r';
  hasFinalLineBreak: boolean;
};

const DELIMITERS: CsvDelimiter[] = [',', ';', '\t'];

const detectDelimiter = (source: string): CsvDelimiter => {
  const counts = new Map<CsvDelimiter, number>(DELIMITERS.map((delimiter) => [delimiter, 0]));
  let inQuotes = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (inQuotes && source[index + 1] === '"') index += 1;
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (character === '\r' || character === '\n')) break;
    if (!inQuotes && counts.has(character as CsvDelimiter)) {
      const delimiter = character as CsvDelimiter;
      counts.set(delimiter, (counts.get(delimiter) || 0) + 1);
    }
  }
  return DELIMITERS.reduce((best, delimiter) => ((counts.get(delimiter) || 0) > (counts.get(best) || 0) ? delimiter : best), ',');
};

const detectLineEnding = (source: string): CsvDocument['lineEnding'] => {
  const firstCrLf = source.indexOf('\r\n');
  const firstLf = source.indexOf('\n');
  const firstCr = source.indexOf('\r');
  if (firstCrLf >= 0 && (firstLf < 0 || firstCrLf <= firstLf) && (firstCr < 0 || firstCrLf <= firstCr)) return '\r\n';
  if (firstLf >= 0 && (firstCr < 0 || firstLf < firstCr)) return '\n';
  return firstCr >= 0 ? '\r' : '\n';
};

export const parseCsvDocument = (source: string, requestedDelimiter?: CsvDelimiter): CsvDocument => {
  const delimiter = requestedDelimiter || detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false;
  let justClosedQuote = false;
  let endedWithLineBreak = false;

  const finishField = () => {
    row.push(field);
    field = '';
    fieldStarted = false;
    justClosedQuote = false;
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
    endedWithLineBreak = true;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else if (character === '\r' || character === '\n') {
        if (character === '\r' && source[index + 1] === '\n') index += 1;
        field += '\n';
      } else {
        field += character;
      }
      endedWithLineBreak = false;
      continue;
    }

    if (character === delimiter) {
      finishField();
      endedWithLineBreak = false;
      continue;
    }
    if (character === '\r' || character === '\n') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      finishRow();
      continue;
    }
    if (justClosedQuote) throw new Error(`Unexpected character after a quoted field at character ${index + 1}.`);
    if (character === '"') {
      if (fieldStarted || field.length > 0) throw new Error(`Unexpected quote in an unquoted field at character ${index + 1}.`);
      inQuotes = true;
      fieldStarted = true;
      endedWithLineBreak = false;
      continue;
    }
    field += character;
    fieldStarted = true;
    endedWithLineBreak = false;
  }

  if (inQuotes) throw new Error('The CSV file contains an unterminated quoted field.');
  if (source.length === 0) rows.push(['']);
  else if (!endedWithLineBreak) {
    finishField();
    rows.push(row);
  }

  return {
    rows,
    delimiter,
    lineEnding: detectLineEnding(source),
    hasFinalLineBreak: endedWithLineBreak,
  };
};

const serializeField = (value: string, delimiter: CsvDelimiter, lineEnding: CsvDocument['lineEnding']): string => {
  const normalizedValue = value.replace(/\r\n|\r|\n/g, lineEnding);
  if (
    normalizedValue.includes(delimiter) ||
    normalizedValue.includes('"') ||
    normalizedValue.includes('\r') ||
    normalizedValue.includes('\n') ||
    /^[ \t]|[ \t]$/.test(normalizedValue)
  ) {
    return `"${normalizedValue.replace(/"/g, '""')}"`;
  }
  return normalizedValue;
};

export const serializeCsvDocument = (document: CsvDocument): string => {
  const rows = document.rows.length > 0 ? document.rows : [['']];
  const content = rows
    .map((row) =>
      (row.length > 0 ? row : ['']).map((field) => serializeField(String(field ?? ''), document.delimiter, document.lineEnding)).join(document.delimiter),
    )
    .join(document.lineEnding);
  return document.hasFinalLineBreak ? `${content}${document.lineEnding}` : content;
};
