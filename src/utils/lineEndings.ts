export type LineEnding = '\n' | '\r\n' | '\r';

/**
 * Detects the dominant line ending of a text blob. CRLF wins if present at all
 * because that is the Windows convention and the case that matters most here;
 * a lone CR (classic Mac) is only reported when no LF exists.
 */
export const detectLineEnding = (text: string): LineEnding => (text.includes('\r\n') ? '\r\n' : text.includes('\r') ? '\r' : '\n');

/**
 * Collapses every CRLF and lone CR to LF. The in-app code editor (CodeMirror)
 * always emits LF regardless of the file's original endings, so comparisons of
 * "current text" against "saved text" must happen in a normalized LF space.
 * Otherwise a freshly opened CRLF file looks edited the moment it loads.
 */
export const normalizeToLf = (text: string): string => text.replace(/\r\n?/g, '\n');

/**
 * Re-applies a specific line ending to LF-normalized text. Used right before a
 * write so the file keeps its original convention instead of silently being
 * converted to LF, which would otherwise flood the git diff with line changes.
 */
export const applyLineEnding = (lfText: string, ending: LineEnding): string => (ending === '\n' ? lfText : lfText.replace(/\n/g, ending));
