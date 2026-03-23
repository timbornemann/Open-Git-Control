/** Per-line gutter style for merge conflict files (<<<<<<< / ======= / >>>>>>>). */
export type ConflictGutterKind = 'neutral' | 'ours' | 'theirs' | 'marker';

/**
 * Classify each line of a conflicted file for gutter coloring.
 * Assumes standard Git conflict markers (markers on their own lines).
 */
export function getConflictLineGutterKinds(lines: string[]): ConflictGutterKind[] {
  const kinds: ConflictGutterKind[] = new Array(lines.length).fill('neutral');
  let i = 0;

  while (i < lines.length) {
    const current = lines[i];
    const isStart = current.trimEnd().startsWith('<<<<<<<');
    if (!isStart) {
      i += 1;
      continue;
    }

    let separatorIndex = -1;
    let nestedStartBeforeSeparator = -1;

    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j];
      if (candidate.trimEnd().startsWith('<<<<<<<')) {
        nestedStartBeforeSeparator = j;
        break;
      }
      if (candidate.trim() === '=======') {
        separatorIndex = j;
        break;
      }
      if (candidate.trimEnd().startsWith('>>>>>>>')) {
        break;
      }
    }

    if (separatorIndex < 0) {
      kinds[i] = 'marker';
      i = nestedStartBeforeSeparator >= 0 ? nestedStartBeforeSeparator : i + 1;
      continue;
    }

    let endIndex = -1;
    let nestedStartBeforeEnd = -1;

    for (let j = separatorIndex + 1; j < lines.length; j += 1) {
      const candidate = lines[j];
      if (candidate.trimEnd().startsWith('<<<<<<<')) {
        nestedStartBeforeEnd = j;
        break;
      }
      if (candidate.trimEnd().startsWith('>>>>>>>')) {
        endIndex = j;
        break;
      }
    }

    if (endIndex < 0) {
      kinds[i] = 'marker';
      kinds[separatorIndex] = 'marker';
      i = nestedStartBeforeEnd >= 0 ? nestedStartBeforeEnd : i + 1;
      continue;
    }

    kinds[i] = 'marker';
    for (let j = i + 1; j < separatorIndex; j += 1) {
      kinds[j] = 'ours';
    }
    kinds[separatorIndex] = 'marker';
    for (let j = separatorIndex + 1; j < endIndex; j += 1) {
      kinds[j] = 'theirs';
    }
    kinds[endIndex] = 'marker';
    i = endIndex + 1;
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
