import { describe, expect, it } from 'vitest';
import { normalizeTerminalText, TerminalTextSanitizer } from './terminalText';

describe('plain terminal text', () => {
  it('removes colours, cursor commands, OSC links/titles and C1 controls without corrupting Unicode', () => {
    expect(
      normalizeTerminalText(
        '\u001b[43m[WARN]\u001b[0m Grüße A^3 🚀\t日本語\u001b[?25l\u001b]0;title\u0007\u001b]8;;https://example.test\u001b\\link\u001b]8;;\u001b\\\u009b31m!\u009b0m',
      ),
    ).toBe('[WARN] Grüße A^3 🚀\t日本語link!');
    expect(normalizeTerminalText('\u001bPprivate terminal data\u001b\\visible\u0000\u0007')).toBe('visible');
  });
  it('retains terminal parser state across every possible split in an escape sequence', () => {
    const text = '\u001b[31mFehler\u001b[0m \u001b]8;;https://example.test\u001b\\öffnen\u001b]8;;\u001b\\';
    for (let split = 0; split <= text.length; split++) {
      const sanitizer = new TerminalTextSanitizer();
      expect(sanitizer.write(text.slice(0, split)) + sanitizer.write(text.slice(split))).toBe('Fehler öffnen');
    }
  });
  it('resolves inline redraws and backspaces and preserves CRLF and tabs', () => {
    expect(normalizeTerminalText('Downloading 10%\rDownloading 100%\r\n\tüber 💻\bx\n')).toBe('Downloading 100%\n\tüber x\n');
  });
  it('ignores incomplete controls and recovers at a new line', () => {
    const sanitizer = new TerminalTextSanitizer();
    expect(sanitizer.write('normal\u001b[31')).toBe('normal');
    sanitizer.write('\n');
    expect(sanitizer.write('next line')).toBe('next line');
  });
});
