/** Per-line gutter style for merge conflict files (<<<<<<< / ======= / >>>>>>>). */
export type ConflictGutterKind = 'neutral' | 'ours' | 'theirs' | 'marker';

/**
 * Classify each line of a conflicted file for gutter coloring.
 * Assumes standard Git conflict markers (markers on their own lines).
 */
export function getConflictLineGutterKinds(lines: string[]): ConflictGutterKind[] {
  const kinds: ConflictGutterKind[] = [];
  let zone: 'neutral' | 'ours' | 'theirs' = 'neutral';

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (/^<<<<<<</.test(trimmed)) {
      kinds.push('marker');
      zone = 'ours';
      continue;
    }
    if (zone === 'ours' && line.trim() === '=======') {
      kinds.push('marker');
      zone = 'theirs';
      continue;
    }
    if (/^>>>>>>>/.test(trimmed)) {
      kinds.push('marker');
      zone = 'neutral';
      continue;
    }

    if (zone === 'ours') kinds.push('ours');
    else if (zone === 'theirs') kinds.push('theirs');
    else kinds.push('neutral');
  }

  return kinds;
}

/**
 * Normalisiert Zeilenenden und entfernt mehrfache leere Zeilen am Dateiende.
 * Ohne das erzeugt `split('\n')` viele leere Segmente bei z.B. `\n\n\n\n` am EOF —
 * Gutter und Marker laufen dann weiter, obwohl es keinen echten Inhalt mehr gibt.
 */
export function normalizeMergeConflictFileContent(raw: string): string {
  const withLf = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = withLf.split('\n');
  while (lines.length > 1 && lines[lines.length - 1] === '' && lines[lines.length - 2] === '') {
    lines.pop();
  }
  return lines.join('\n');
}

/** Zeilen wie die Textarea zaehlt (LF), ohne Inhalt zu verändern — nur für Anzeige/Split. */
export function splitContentLines(content: string): string[] {
  if (content.length === 0) return [''];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.split('\n');
}
