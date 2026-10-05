// @vitest-environment jsdom

import * as fs from 'fs';
import * as path from 'path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';
import { useDiffPreviewData } from './useDiffPreviewData';

const filePath = 'electron/git/__tests__/GitRunner.diffPreview.test.ts';
const translate = (key: string) => key;

const textDiff = (lines: string[]) => ['diff --git a/test.ts b/test.ts', '--- a/test.ts', '+++ b/test.ts', `@@ -1 +1,${lines.length} @@`, ...lines].join('\n');

describe('useDiffPreviewData binary detection', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  const loadPreview = async (text: string) => {
    vi.spyOn(gitClient, 'getDiffPreview').mockResolvedValue({
      success: true,
      data: { text, truncated: false, bytes: text.length, lines: text.split('\n').length },
    });
    const request = { source: 'unstaged' as const, path: filePath };
    let current: ReturnType<typeof useDiffPreviewData> | null = null;
    const Harness = () => {
      current = useDiffPreviewData({ repoPath: 'D:/repo', request, t: translate });
      return null;
    };
    await act(async () => root.render(createElement(Harness)));
    await vi.waitFor(() => expect(current!.diffText).toBe(text));
    return current!;
  };

  it('renders the reported TypeScript file as text even though its tests mention binary diffs', async () => {
    const contents = fs.readFileSync(path.resolve(filePath), 'utf8');
    expect(contents).toContain('Binary files');
    const preview = await loadPreview(textDiff(contents.split('\n').map((line) => `+${line}`)));

    expect(preview.isBinaryDiff).toBe(false);
    expect(preview.canRenderText).toBe(true);
    expect(preview.parsed.hunks.length).toBeGreaterThan(0);
  });

  it.each(['+', '-', ' '])('keeps marker-like source lines with the %j diff prefix visible', async (prefix) => {
    const preview = await loadPreview(textDiff([`${prefix}Binary files a/image.png and b/image.png differ`, `${prefix}GIT binary patch`]));

    expect(preview.isBinaryDiff).toBe(false);
    expect(preview.canRenderText).toBe(true);
  });

  it.each([
    'Binary files /dev/null and b/image.png differ\n',
    'Binary files a/image.png and b/image.png differ\r\n',
    'GIT binary patch\nliteral 4\nencoded payload\n',
    'GIT binary patch\r\nliteral 4\r\nencoded payload\r\n',
  ])('still hides actual binary diff data %j', async (marker) => {
    const preview = await loadPreview(`diff --git a/test.ts b/test.ts\n${marker}`);

    expect(preview.isBinaryDiff).toBe(true);
    expect(preview.canRenderText).toBe(false);
  });
});
