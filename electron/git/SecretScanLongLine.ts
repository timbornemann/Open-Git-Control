const OVERLAP = 4096;
const quotedAssignment = /\b(?:api[_-]?key|secret|token|password|passwd|private[_-]?key)\b\s*[:=]\s*(["'])/gi;

/** Bounded scan windows, including credentials split across chunks or long quoted values. */
export class SecretScanLongLine {
  private overlap = '';
  private prefix = '';
  private whitespace = 0;
  private first = true;
  private quoted?: { opening: string; quote: string; sample: string; length: number };
  constructor(private readonly scan: (window: string, first: boolean, last: boolean) => Promise<void>) {}

  async consume(text: string, last: boolean) {
    // Assignment separators may contain arbitrarily long whitespace. Collapsing
    // runs retains their meaning for the secret patterns without retaining them.
    const compact = text.replace(/\s+|\S+/g, (part) => {
      if (!/^\s/.test(part)) {
        this.whitespace = 0;
        return part;
      }
      const count = Math.min(16 - this.whitespace, part.length);
      this.whitespace += count;
      return ' '.repeat(count);
    });
    await this.scan(this.overlap + compact, this.first, last);
    this.first = false;
    await this.consumeQuoted(compact);
    const combined = this.overlap + compact;
    let start = Math.max(0, combined.length - OVERLAP);
    if (combined.charCodeAt(start) >= 0xdc00 && combined.charCodeAt(start) <= 0xdfff) start--;
    this.overlap = combined.slice(start);
  }

  private async consumeQuoted(text: string) {
    let offset = 0;
    if (this.quoted) {
      const end = text.search(/["']/);
      this.appendValue(end < 0 ? text : text.slice(0, end));
      if (end < 0) return;
      await this.finishValue(text[end]);
      offset = end + 1;
    }
    const prefix = offset ? '' : this.prefix;
    const input = prefix + text.slice(offset);
    const pattern = new RegExp(quotedAssignment.source, quotedAssignment.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(input))) {
      // A prefix is lookbehind only; do not restart a previously consumed value.
      if (pattern.lastIndex <= prefix.length) continue;
      this.quoted = { opening: match[0], quote: match[1], sample: '', length: 0 };
      const rest = input.slice(pattern.lastIndex);
      const end = rest.search(/["']/);
      this.appendValue(end < 0 ? rest : rest.slice(0, end));
      if (end < 0) break;
      await this.finishValue(rest[end]);
      pattern.lastIndex += end + 1;
    }
    this.prefix = input.slice(-128);
  }

  private appendValue(text: string) {
    const value = this.quoted!;
    value.length = Math.min(12, value.length + text.length);
    value.sample += text.slice(0, 512 - value.sample.length);
  }

  private async finishValue(quote: string) {
    const value = this.quoted!;
    this.quoted = undefined;
    if (quote === value.quote && value.length >= 12) {
      // The sample is for generic quoted-value rules. It must not manufacture
      // an end-of-line match for configuration rules requiring the real suffix.
      await this.scan(`${value.opening}${value.sample}${quote} [continued line]`, false, false);
    }
  }
}
