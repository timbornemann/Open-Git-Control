import { describe, expect, it } from 'vitest';
import { normalizeDiffPreviewArgs } from '../diffPreviewPolicy';

describe('normalizeDiffPreviewArgs', () => {
  it('allows the supported staged, unstaged, and commit preview commands', () => {
    expect(normalizeDiffPreviewArgs(['diff', '--', 'src/app.ts'])).toEqual(['diff', '--', ':(literal)src/app.ts']);
    expect(normalizeDiffPreviewArgs(['diff', '--cached', '--', 'src/app.ts'])).toEqual(['diff', '--cached', '--', ':(literal)src/app.ts']);
    expect(normalizeDiffPreviewArgs(['show', '--format=', '--binary', 'a'.repeat(40), '--', 'src/app.ts'])).toEqual([
      'show',
      '--format=',
      '--binary',
      'a'.repeat(40),
      '--',
      ':(literal)src/app.ts',
    ]);
  });

  it('rejects arbitrary diff options and paths outside the repository', () => {
    expect(() => normalizeDiffPreviewArgs(['diff', '--no-index', '--', 'a', 'b'])).toThrow('Unsupported');
    expect(() => normalizeDiffPreviewArgs(['diff', '--', '../secret.txt'])).toThrow('repository-relative');
    expect(() => normalizeDiffPreviewArgs(['diff', '--', 'C:/Users/Tim/secret.txt'])).toThrow('repository-relative');
    expect(() => normalizeDiffPreviewArgs(['show', '--format=', '--binary', 'HEAD', '--', 'src/app.ts'])).toThrow('Invalid commit hash');
  });
});
