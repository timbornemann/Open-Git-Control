import React from 'react';
import type { TextFileEncodingDto } from '@/shared/ipc/contracts/git';
import { applyLineEnding, type LineEnding } from '@/utils/lineEndings';
import { getTextMetrics } from './textContentTransforms';

type Props = {
  text: string;
  encoding: TextFileEncodingDto;
  lineEnding: LineEnding;
  modifiedAt?: string;
  tr: (german: string, english: string) => string;
};

const ENCODING_LABELS: Record<TextFileEncodingDto, string> = {
  utf8: 'UTF-8',
  'utf8-bom': 'UTF-8 BOM',
  utf16le: 'UTF-16 LE',
  utf16be: 'UTF-16 BE',
  latin1: 'Latin-1',
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes.toLocaleString()} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let index = -1;
  do {
    value /= 1024;
    index += 1;
  } while (value >= 1024 && index < units.length - 1);
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[index]}`;
};

const formatDate = (value?: string): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(date);
};

export const getEncodedTextByteLength = (text: string, encoding: TextFileEncodingDto, lineEnding: LineEnding): number => {
  const encodedText = applyLineEnding(text, lineEnding);
  if (encoding === 'utf16le' || encoding === 'utf16be') return encodedText.length * 2 + 2;
  if (encoding === 'latin1') return encodedText.length;
  return new TextEncoder().encode(encodedText).length + (encoding === 'utf8-bom' ? 3 : 0);
};

export const WorkingDirectoryFileStatusBar: React.FC<Props> = ({ text, encoding, lineEnding, modifiedAt, tr }) => {
  const metrics = getTextMetrics(text);
  const bytes = getEncodedTextByteLength(text, encoding, lineEnding);
  return (
    <div className="working-file-viewer__status" aria-label={tr('Dateiinformationen', 'File information')}>
      <span title={tr('Größe des aktuellen Editorinhalts', 'Size of the current editor content')}>{formatBytes(bytes)}</span>
      <span>
        {metrics.characters.toLocaleString()} {tr('Zeichen', 'characters')}
      </span>
      <span>
        {metrics.words.toLocaleString()} {tr('Wörter', 'words')}
      </span>
      <span>
        {metrics.lines.toLocaleString()} {tr('Zeilen', 'lines')}
      </span>
      <span>{ENCODING_LABELS[encoding]}</span>
      <span>{lineEnding === '\r\n' ? 'CRLF' : 'LF'}</span>
      <span title={tr('Letzte Änderung auf dem Datenträger', 'Last modification on disk')}>
        {tr('Geändert', 'Modified')}: {formatDate(modifiedAt)}
      </span>
    </div>
  );
};

export const textEncodingLabel = (encoding: TextFileEncodingDto): string => ENCODING_LABELS[encoding];
