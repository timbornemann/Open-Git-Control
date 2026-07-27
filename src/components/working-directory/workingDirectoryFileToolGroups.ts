import { Binary, Braces, Code2, FileCode2, Fingerprint, ListFilter } from 'lucide-react';
import type { TextFileEncodingDto } from '@/shared/ipc/contracts/git';
import type { LineEnding } from '@/utils/lineEndings';
import { formatJsonText, isHtmlFilePathForTools, isJsonFilePath, isXmlFilePath, isYamlFilePath, minifyJsonText, sortJsonKeys } from './fileContentTransforms';
import { formatHtmlText, formatXmlText, formatYamlText, jsonToYaml, minifyHtmlText, minifyXmlText, yamlToJson } from './structuredContentTransforms';
import {
  changeTextCase,
  decodeBase64,
  decodeUrlComponent,
  encodeBase64,
  encodeUrlComponent,
  removeDuplicateLines,
  removeEmptyLines,
  sortLines,
  trimLines,
  type TextSelection,
} from './textContentTransforms';
import { textEncodingLabel } from './WorkingDirectoryFileStatusBar';
import type { WorkingDirectoryToolGroup, WorkingDirectoryToolItem } from './WorkingDirectoryFileToolsMenu';

type Translate = (german: string, english: string) => string;
type ApplyTransform = (transform: (source: string) => string | Promise<string>, successMessage: string) => void;
type ApplySelectionTransform = (transform: (source: string) => string, successMessage: string) => void;

type Params = {
  path: string;
  selection: TextSelection;
  encoding: TextFileEncodingDto;
  lineEnding: LineEnding;
  showWhitespace: boolean;
  tr: Translate;
  applyTransform: ApplyTransform;
  applySelectionTransform: ApplySelectionTransform;
  requestLineAffixes: () => void;
  requestTextCompaction: () => void;
  copyJsonPath: () => void;
  requestSchemaValidation: () => void;
  validateYaml: () => void | Promise<void>;
  setTargetEncoding: (encoding: TextFileEncodingDto) => void;
  setTargetLineEnding: (lineEnding: LineEnding) => void;
  toggleWhitespace: () => void;
  showHashes: () => void;
};

const buildLineItems = (params: Params): WorkingDirectoryToolItem[] => {
  const { tr, applyTransform } = params;
  return [
    { id: 'sort-lines', label: tr('Zeilen sortieren', 'Sort lines'), action: () => applyTransform(sortLines, tr('Zeilen sortiert.', 'Lines sorted.')) },
    {
      id: 'dedupe-lines',
      label: tr('Duplikate entfernen', 'Remove duplicate lines'),
      action: () => applyTransform(removeDuplicateLines, tr('Doppelte Zeilen entfernt.', 'Duplicate lines removed.')),
    },
    {
      id: 'empty-lines',
      label: tr('Leere Zeilen entfernen', 'Remove empty lines'),
      action: () => applyTransform(removeEmptyLines, tr('Leere Zeilen entfernt.', 'Empty lines removed.')),
    },
    { id: 'trim-lines', label: tr('Zeilen trimmen', 'Trim lines'), action: () => applyTransform(trimLines, tr('Zeilen getrimmt.', 'Lines trimmed.')) },
    { id: 'affixes', label: tr('Präfix/Suffix ergänzen', 'Add prefix/suffix'), action: params.requestLineAffixes },
    {
      id: 'uppercase',
      label: tr('In Großbuchstaben', 'Convert to uppercase'),
      action: () => applyTransform((source) => changeTextCase(source, 'upper'), tr('Text in Großbuchstaben umgewandelt.', 'Converted text to uppercase.')),
    },
    {
      id: 'lowercase',
      label: tr('In Kleinbuchstaben', 'Convert to lowercase'),
      action: () => applyTransform((source) => changeTextCase(source, 'lower'), tr('Text in Kleinbuchstaben umgewandelt.', 'Converted text to lowercase.')),
    },
    { id: 'compact', label: tr('Auf eine Zeile komprimieren', 'Compact to one line'), action: params.requestTextCompaction },
  ];
};

const buildStructuredGroups = (params: Params): WorkingDirectoryToolGroup[] => {
  const { path, tr, applyTransform } = params;
  const groups: WorkingDirectoryToolGroup[] = [];
  if (isJsonFilePath(path)) {
    groups.push({
      id: 'json',
      label: 'JSON',
      description: tr('Formatieren, prüfen und konvertieren', 'Format, validate and convert'),
      icon: Braces,
      items: [
        { id: 'json-format', label: tr('Formatieren', 'Format'), action: () => applyTransform(formatJsonText, tr('JSON formatiert.', 'JSON formatted.')) },
        { id: 'json-minify', label: tr('Minifizieren', 'Minify'), action: () => applyTransform(minifyJsonText, tr('JSON minifiziert.', 'JSON minified.')) },
        {
          id: 'json-sort',
          label: tr('Schlüssel sortieren', 'Sort keys'),
          action: () => applyTransform(sortJsonKeys, tr('JSON-Schlüssel sortiert.', 'JSON keys sorted.')),
        },
        { id: 'json-path', label: tr('Pfad an Auswahl kopieren', 'Copy path at selection'), action: params.copyJsonPath },
        { id: 'json-schema', label: tr('Mit Schema validieren', 'Validate with schema'), action: params.requestSchemaValidation },
        {
          id: 'json-yaml',
          label: tr('JSON → YAML', 'JSON → YAML'),
          action: () =>
            applyTransform(jsonToYaml, tr('In YAML konvertiert; Dateiendung bleibt unverändert.', 'Converted to YAML; the extension is unchanged.')),
        },
      ],
    });
  }
  if (isYamlFilePath(path)) {
    groups.push({
      id: 'yaml',
      label: 'YAML',
      description: tr('Formatieren, validieren und konvertieren', 'Format, validate and convert'),
      icon: FileCode2,
      items: [
        { id: 'yaml-format', label: tr('Formatieren', 'Format'), action: () => applyTransform(formatYamlText, tr('YAML formatiert.', 'YAML formatted.')) },
        { id: 'yaml-validate', label: tr('Validieren', 'Validate'), action: params.validateYaml },
        {
          id: 'yaml-json',
          label: tr('YAML → JSON', 'YAML → JSON'),
          action: () =>
            applyTransform(yamlToJson, tr('In JSON konvertiert; Dateiendung bleibt unverändert.', 'Converted to JSON; the extension is unchanged.')),
        },
      ],
    });
  }
  if (isXmlFilePath(path) || isHtmlFilePathForTools(path)) {
    const isHtml = isHtmlFilePathForTools(path);
    groups.push({
      id: 'markup',
      label: isHtml ? 'HTML' : 'XML',
      description: tr('Markup formatieren oder minifizieren', 'Format or minify markup'),
      icon: Code2,
      items: [
        {
          id: 'markup-format',
          label: tr('Formatieren', 'Format'),
          action: () => applyTransform(isHtml ? formatHtmlText : formatXmlText, tr('Markup formatiert.', 'Markup formatted.')),
        },
        {
          id: 'markup-minify',
          label: tr('Minifizieren', 'Minify'),
          action: () => applyTransform(isHtml ? minifyHtmlText : minifyXmlText, tr('Markup minifiziert.', 'Markup minified.')),
        },
      ],
    });
  }
  return groups;
};

export const buildWorkingDirectoryFileToolGroups = (params: Params): WorkingDirectoryToolGroup[] => {
  const { tr, encoding, lineEnding, selection, applySelectionTransform } = params;
  return [
    ...buildStructuredGroups(params),
    {
      id: 'lines',
      label: tr('Zeilen bearbeiten', 'Edit lines'),
      description: tr('Sortieren, bereinigen und Schreibweise ändern', 'Sort, clean and change casing'),
      icon: ListFilter,
      items: buildLineItems(params),
    },
    {
      id: 'encoding',
      label: tr('Encoding und Zeilenenden', 'Encoding and line endings'),
      description: `${textEncodingLabel(encoding)} · ${lineEnding === '\r\n' ? 'CRLF' : 'LF'}`,
      icon: Binary,
      items: [
        { id: 'utf8', label: 'UTF-8', active: encoding === 'utf8', action: () => params.setTargetEncoding('utf8') },
        { id: 'utf8-bom', label: 'UTF-8 BOM', active: encoding === 'utf8-bom', action: () => params.setTargetEncoding('utf8-bom') },
        { id: 'latin1', label: 'Latin-1', active: encoding === 'latin1', action: () => params.setTargetEncoding('latin1') },
        { id: 'lf', label: tr('Zeilenenden: LF', 'Line endings: LF'), active: lineEnding === '\n', action: () => params.setTargetLineEnding('\n') },
        { id: 'crlf', label: tr('Zeilenenden: CRLF', 'Line endings: CRLF'), active: lineEnding === '\r\n', action: () => params.setTargetLineEnding('\r\n') },
        {
          id: 'whitespace',
          label: tr('Unsichtbare Zeichen anzeigen', 'Show invisible characters'),
          active: params.showWhitespace,
          action: params.toggleWhitespace,
        },
      ],
    },
    {
      id: 'codecs',
      label: tr('Base64 und URL-Encoding', 'Base64 and URL encoding'),
      description:
        selection.from === selection.to
          ? tr('Gesamte Datei verarbeiten', 'Process entire file')
          : tr('Aktuelle Auswahl verarbeiten', 'Process current selection'),
      icon: Fingerprint,
      items: [
        {
          id: 'base64-encode',
          label: tr('Base64 codieren', 'Encode Base64'),
          action: () => applySelectionTransform(encodeBase64, tr('Base64 codiert.', 'Base64 encoded.')),
        },
        {
          id: 'base64-decode',
          label: tr('Base64 decodieren', 'Decode Base64'),
          action: () => applySelectionTransform(decodeBase64, tr('Base64 decodiert.', 'Base64 decoded.')),
        },
        {
          id: 'url-encode',
          label: tr('URL codieren', 'URL encode'),
          action: () => applySelectionTransform(encodeUrlComponent, tr('URL-codiert.', 'URL encoded.')),
        },
        {
          id: 'url-decode',
          label: tr('URL decodieren', 'URL decode'),
          action: () => applySelectionTransform(decodeUrlComponent, tr('URL decodiert.', 'URL decoded.')),
        },
      ],
    },
    {
      id: 'hashes',
      label: tr('Hashwerte', 'Hashes'),
      description: tr('SHA-256, SHA-1 und MD5 der gespeicherten Datei', 'SHA-256, SHA-1 and MD5 of the saved file'),
      icon: Fingerprint,
      items: [{ id: 'show-hashes', label: tr('Hashwerte berechnen', 'Calculate hashes'), action: params.showHashes }],
    },
  ];
};
