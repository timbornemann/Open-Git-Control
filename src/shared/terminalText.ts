// eslint-disable-next-line no-control-regex -- Fast path for text without terminal control bytes.
const terminalControls = /[\u0000-\u0007\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

/** Plain-text console capture: never expose terminal controls, OSC links or screen commands to the UI. */
export class TerminalTextSanitizer {
  private state: 'text' | 'escape' | 'intermediate' | 'csi' | 'osc' | 'string' | 'string-escape' = 'text';
  private stringState: 'osc' | 'string' = 'osc';

  write(value: string): string {
    if (this.state === 'text' && !terminalControls.test(value)) return value;
    let result = '';
    for (const character of value) {
      const code = character.codePointAt(0)!;
      if (this.state === 'string-escape') {
        this.state = character === '\\' ? 'text' : this.stringState;
        if (code === 0x1b) this.state = 'string-escape';
        continue;
      }
      if (this.state === 'osc' || this.state === 'string') {
        if (code === 0x9c || (code === 7 && this.state === 'osc')) this.state = 'text';
        else if (code === 0x1b) {
          this.stringState = this.state;
          this.state = 'string-escape';
        }
        continue;
      }
      if (code === 0x1b) {
        this.state = 'escape';
        continue;
      }
      if (this.state === 'escape') {
        this.startEscapeSequence(character, code);
        continue;
      }
      if (this.state === 'intermediate') {
        if (code >= 0x30 && code <= 0x7e) this.state = 'text';
        continue;
      }
      if (this.state === 'csi') {
        if (code >= 0x40 && code <= 0x7e) this.state = 'text';
        // A malformed/incomplete control must not swallow the following line.
        else if (character === '\n' || character === '\r') this.state = 'text';
        continue;
      }
      if (code === 0x9b || code === 0x9d || [0x90, 0x98, 0x9e, 0x9f].includes(code)) {
        this.state = code === 0x9b ? 'csi' : code === 0x9d ? 'osc' : 'string';
        continue;
      }
      if ((code < 0x20 && ![8, 9, 10, 13].includes(code)) || (code >= 0x7f && code <= 0x9f)) continue;
      result += character;
    }
    return result;
  }

  private startEscapeSequence(character: string, code: number): void {
    this.state =
      character === '[' ? 'csi' : character === ']' ? 'osc' : 'PX^_'.includes(character) ? 'string' : code >= 0x20 && code <= 0x2f ? 'intermediate' : 'text';
  }
}

/** Resolve inline redraws and backspaces while preserving Unicode, tabs and ordinary line breaks. */
export function normalizeTerminalText(value: string): string {
  const clean = new TerminalTextSanitizer().write(value);
  if (!clean.includes('\r') && !clean.includes('\b')) return clean;
  const lines: string[] = [];
  let current: string[] = [];
  const characters = [...clean];
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index];
    if (character === '\r') {
      if (characters[index + 1] !== '\n') current = [];
    } else if (character === '\n') {
      lines.push(current.join(''));
      current = [];
    } else if (character === '\b') current.pop();
    else current.push(character);
  }
  return [...lines, current.join('')].join('\n');
}
