import React, { useMemo, useState } from 'react';
import { Columns, Minus, Plus, Rows, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { parseCsvDocument, serializeCsvDocument, type CsvDelimiter, type CsvDocument } from './csvDocument';
import '@/styles/working-directory-csv-editor.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const MAX_VISIBLE_ROWS = 500;
const MAX_VISIBLE_COLUMNS = 100;
const MAX_VISIBLE_CELLS = 5_000;

const columnLabel = (index: number): string => {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
};

const parseForTable = (value: string, delimiter?: CsvDelimiter): { document: CsvDocument; error: null } | { document: null; error: string } => {
  try {
    return { document: parseCsvDocument(value, delimiter), error: null };
  } catch (error: unknown) {
    return { document: null, error: error instanceof Error ? error.message : String(error) };
  }
};

export const CsvTableEditor: React.FC<Props> = ({ value, onChange }) => {
  const { tr } = useI18n();
  const [delimiterOverride, setDelimiterOverride] = useState<CsvDelimiter | undefined>();
  const parsed = useMemo(() => parseForTable(value, delimiterOverride), [delimiterOverride, value]);
  if (!parsed.document) {
    return (
      <div className="working-csv-editor__error">
        <strong>{tr('CSV konnte nicht als Tabelle gelesen werden.', 'CSV could not be read as a table.')}</strong>
        <span>{parsed.error}</span>
        <small>{tr('Öffne die Textansicht, um das CSV-Format zu korrigieren.', 'Open the text view to correct the CSV format.')}</small>
      </div>
    );
  }

  const document = parsed.document;
  const columnCount = Math.max(1, ...document.rows.map((row) => row.length));
  const visibleColumnCount = Math.min(columnCount, MAX_VISIBLE_COLUMNS);
  const cellLimitedRows = Math.max(1, Math.floor(MAX_VISIBLE_CELLS / visibleColumnCount));
  const visibleRowCount = Math.min(document.rows.length, MAX_VISIBLE_ROWS, cellLimitedRows);
  const rowsTruncated = visibleRowCount < document.rows.length;
  const columnsTruncated = visibleColumnCount < columnCount;
  const delimiterLabel = document.delimiter === '\t' ? tr('Tabulator', 'tab') : document.delimiter;

  const updateRows = (rows: string[][]) => onChange(serializeCsvDocument({ ...document, rows }));
  const updateCell = (rowIndex: number, columnIndex: number, cellValue: string) => {
    const rows = document.rows.map((row) => row.slice());
    while (rows[rowIndex].length <= columnIndex) rows[rowIndex].push('');
    rows[rowIndex][columnIndex] = cellValue;
    updateRows(rows);
  };
  const addRow = () => updateRows([...document.rows.map((row) => row.slice()), Array.from({ length: columnCount }, () => '')]);
  const removeRow = (rowIndex: number) => {
    const rows = document.rows.filter((_row, index) => index !== rowIndex).map((row) => row.slice());
    updateRows(rows.length > 0 ? rows : [['']]);
  };
  const addColumn = () => updateRows(document.rows.map((row) => [...row, ...Array.from({ length: Math.max(0, columnCount - row.length) + 1 }, () => '')]));
  const removeLastColumn = () => {
    if (columnCount <= 1) return;
    updateRows(document.rows.map((row) => row.slice(0, columnCount - 1)));
  };

  return (
    <div className="working-csv-editor">
      <div className="working-csv-editor__toolbar">
        <span className="working-csv-editor__summary">
          {document.rows.length.toLocaleString()} {tr('Zeilen', 'rows')} · {columnCount.toLocaleString()} {tr('Spalten', 'columns')} ·{' '}
          {tr('Trennzeichen', 'delimiter')}:
        </span>
        <select
          aria-label={tr('CSV-Trennzeichen', 'CSV delimiter')}
          value={document.delimiter}
          onChange={(event) => setDelimiterOverride(event.target.value as CsvDelimiter)}
        >
          <option value=",">{tr('Komma (,)', 'Comma (,)')}</option>
          <option value=";">{tr('Semikolon (;)', 'Semicolon (;)')}</option>
          <option value={'\t'}>{tr('Tabulator', 'Tab')}</option>
        </select>
        <code className="working-csv-editor__delimiter-preview">{delimiterLabel}</code>
        <button type="button" onClick={addRow}>
          <Rows size={14} />
          <Plus size={11} />
          {tr('Zeile', 'Row')}
        </button>
        <button type="button" onClick={addColumn}>
          <Columns size={14} />
          <Plus size={11} />
          {tr('Spalte', 'Column')}
        </button>
        <button type="button" onClick={removeLastColumn} disabled={columnCount <= 1}>
          <Columns size={14} />
          <Minus size={11} />
          {tr('Letzte Spalte', 'Last column')}
        </button>
      </div>
      {(rowsTruncated || columnsTruncated) && (
        <div className="working-csv-editor__notice">
          {tr(
            `Zur sicheren Darstellung werden nur die ersten ${visibleRowCount.toLocaleString()} Zeilen und ${visibleColumnCount.toLocaleString()} Spalten angezeigt. Weitere Daten bleiben erhalten und können in der Textansicht bearbeitet werden.`,
            `For responsive rendering, only the first ${visibleRowCount.toLocaleString()} rows and ${visibleColumnCount.toLocaleString()} columns are shown. Remaining data is preserved and can be edited in the text view.`,
          )}
        </div>
      )}
      <div className="working-csv-editor__scroller">
        <table aria-label={tr('Bearbeitbare CSV-Tabelle', 'Editable CSV table')}>
          <thead>
            <tr>
              <th aria-label={tr('Zeilennummer', 'Row number')}>#</th>
              {Array.from({ length: visibleColumnCount }, (_, columnIndex) => (
                <th key={columnIndex}>{columnLabel(columnIndex)}</th>
              ))}
              <th aria-label={tr('Zeilenaktionen', 'Row actions')} />
            </tr>
          </thead>
          <tbody>
            {document.rows.slice(0, visibleRowCount).map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th scope="row">{rowIndex + 1}</th>
                {Array.from({ length: visibleColumnCount }, (_, columnIndex) => (
                  <td key={columnIndex}>
                    <input
                      value={row[columnIndex] ?? ''}
                      aria-label={`${tr('Zeile', 'Row')} ${rowIndex + 1}, ${tr('Spalte', 'column')} ${columnLabel(columnIndex)}`}
                      onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="working-csv-editor__delete-row"
                    aria-label={`${tr('Zeile löschen', 'Delete row')} ${rowIndex + 1}`}
                    onClick={() => removeRow(rowIndex)}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
