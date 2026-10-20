import { describe, expect, it, vi } from 'vitest';
import source from '../../../src/shared/updateSource.json';
import { MAX_USER_NOTE_BYTES, USER_NOTES_FOLDER } from '../../../src/shared/userNotes';
import { emptyUserNotesSnapshot } from '../userNotesModel';
import { fetchUserNotesSnapshot } from '../userNotesRemote';
import { gitBlob } from './userNotesFixtures';

const root = '1'.repeat(40),
  config = '2'.repeat(40),
  notes = '3'.repeat(40),
  assets = '4'.repeat(40);
const directory = (path: string, sha: string) => ({ path, sha, mode: '040000', type: 'tree' });
const tree = (sha: string, entries: unknown[]) => ({ sha, tree: entries, truncated: false });

function fixture() {
  const responses = new Map<string, unknown>([
    ['', { id: source.repositoryId, default_branch: 'news/default' }],
    ['/git/trees/news%2Fdefault', tree(root, [directory('.Open-Git-Control', config)])],
    [`/git/trees/${config}`, tree(config, [directory('notes-to-user', notes)])],
    [`/git/trees/${notes}`, tree(notes, [])],
    [`/git/trees/${assets}`, tree(assets, [])],
  ]);
  const entries: unknown[] = [];
  const imageEntries: unknown[] = [];
  const add = (path: string, contents: string | Buffer, image = false) => {
    const blob = gitBlob(contents);
    const entry = { path, sha: blob.sha, size: blob.size, type: 'blob', mode: '100644' };
    (image ? imageEntries : entries).push(entry);
    responses.set(`/git/blobs/${blob.sha}`, blob);
    responses.set(`/git/trees/${notes}`, tree(notes, [...entries, directory('assets', assets)]));
    responses.set(`/git/trees/${assets}`, tree(assets, imageEntries));
    return blob;
  };
  const request = vi.fn(async (input: string | URL | Request, options?: RequestInit) => {
    expect(options).toMatchObject({ credentials: 'omit', redirect: 'error' });
    expect(options?.headers).not.toHaveProperty('Authorization');
    const url = String(input);
    const prefix = `https://api.github.com/repos/${source.owner}/${source.repo}`;
    expect(url.startsWith(prefix)).toBe(true);
    const response = responses.get(url.slice(prefix.length));
    if (response instanceof Response) return response.clone();
    return new Response(JSON.stringify(response || { error: 'missing' }), { status: response ? 200 : 404 });
  });
  return {
    responses,
    add,
    request,
    run: (previous = emptyUserNotesSnapshot(), signal = new AbortController().signal) => fetchUserNotesSnapshot(previous, signal, request),
  };
}

describe('official user notes synchronization', () => {
  it('reads the default branch, sorts pages, renders reference-image dependencies and ignores code fences', async () => {
    const remote = fixture();
    remote.add('2026-10-19-older.md', '# Older');
    remote.add(
      '2026-10-20-latest.md',
      '# Latest\n![Status][status]\n\n[status]: assets/status.gif\n\n```md\n![Ignore](assets/not-used.png)\n```\n![Remote](https://example.invalid/tracker.png)',
    );
    remote.add('fallback.md', 'No heading');
    const image = remote.add('status.gif', Buffer.from('GIF89a'), true);
    const result = await remote.run();
    expect(result.notes.map((note) => note.id)).toEqual(['fallback.md', '2026-10-20-latest.md', '2026-10-19-older.md']);
    expect(result.notes[0].title).toBe('fallback');
    expect(result.notes[1]).toMatchObject({
      title: 'Latest',
      images: { 'assets/status.gif': { path: `${USER_NOTES_FOLDER}/assets/status.gif`, sha: image.sha } },
    });
    expect(Object.keys(result.notes[1].images)).toEqual(['assets/status.gif']);
    expect(result.assets[image.sha]).toBe(`data:image/gif;base64,${image.content}`);
  });

  it('reuses unchanged Markdown and shared image blobs without downloading them again', async () => {
    const remote = fixture();
    remote.add('one.md', '# One\n![Image](assets/picture.png)');
    remote.add('two.md', '# Two\n<img src="assets/picture.png">');
    const image = remote.add('picture.png', Buffer.from('image'), true);
    const first = await remote.run();
    expect(Object.keys(first.assets)).toEqual([image.sha]);
    expect(remote.request.mock.calls.filter(([url]) => String(url).endsWith(`/git/blobs/${image.sha}`))).toHaveLength(1);
    remote.request.mockClear();
    const second = await remote.run(first);
    expect(second.notes).toEqual(first.notes);
    expect(remote.request.mock.calls.filter(([url]) => String(url).includes('/git/blobs/'))).toHaveLength(0);
  });

  it('changes a note revision when only a referenced image changes and drops obsolete image data', async () => {
    const firstRemote = fixture();
    firstRemote.add('info.md', '# Information\n![Image](assets/picture.png)');
    const oldImage = firstRemote.add('picture.png', 'old', true);
    const first = await firstRemote.run();
    const nextRemote = fixture();
    nextRemote.add('info.md', '# Information\n![Image](assets/picture.png)');
    const newImage = nextRemote.add('picture.png', 'new', true);
    const next = await nextRemote.run(first);
    expect(next.notes[0].revision).not.toBe(first.notes[0].revision);
    expect(next.assets).not.toHaveProperty(oldImage.sha);
    expect(next.assets).toHaveProperty(newImage.sha);
  });

  it('keeps emergency text readable when an image cannot be downloaded', async () => {
    const remote = fixture();
    remote.add('info.md', '# Service problem\n![Image](assets/picture.png)');
    const image = remote.add('picture.png', 'unavailable', true);
    remote.responses.set(`/git/blobs/${image.sha}`, new Response('', { status: 404 }));
    const result = await remote.run();
    expect(result.notes[0].markdown).toContain('Service problem');
    expect(result.assets).toEqual({});
  });

  it('accepts a verified missing folder as an empty collection, while repository failures reject', async () => {
    const remote = fixture();
    remote.responses.set(`/git/trees/${config}`, tree(config, []));
    expect((await remote.run()).notes).toEqual([]);
    remote.responses.set('', new Response('', { status: 404 }));
    await expect(remote.run()).rejects.toThrow('HTTP 404');
  });

  it.each([403, 429, 503])('rejects HTTP %i instead of producing an empty collection', async (status) => {
    const remote = fixture();
    remote.responses.set(`/git/trees/${notes}`, new Response('', { status }));
    await expect(remote.run()).rejects.toThrow(`HTTP ${status}`);
  });

  it('rejects truncated directories and failed Markdown downloads', async () => {
    const remote = fixture();
    const note = remote.add('info.md', '# Info');
    remote.responses.set(`/git/trees/${notes}`, { ...tree(notes, []), truncated: true });
    await expect(remote.run()).rejects.toThrow('Incomplete');
    remote.responses.set(`/git/trees/${notes}`, tree(notes, [{ path: 'info.md', type: 'blob', mode: '100644', sha: note.sha }]));
    remote.responses.delete(`/git/blobs/${note.sha}`);
    await expect(remote.run()).rejects.toThrow('HTTP 404');
  });

  it('rejects oversized or mismatched Markdown blobs', async () => {
    const remote = fixture();
    const note = remote.add('info.md', '# Info');
    remote.responses.set(`/git/trees/${notes}`, tree(notes, [{ path: 'info.md', type: 'blob', mode: '100644', sha: note.sha, size: MAX_USER_NOTE_BYTES + 1 }]));
    await expect(remote.run()).rejects.toThrow('oversized');
    remote.responses.set(`/git/trees/${notes}`, tree(notes, [{ path: 'info.md', type: 'blob', mode: '100644', sha: note.sha }]));
    remote.responses.set(`/git/blobs/${note.sha}`, { ...note, content: Buffer.from('# Unexpected').toString('base64') });
    await expect(remote.run()).rejects.toThrow('validation');
  });

  it('does not fetch images outside the notice folder or follow symlinks', async () => {
    const remote = fixture();
    remote.add('info.md', '# Info\n![Outside](../private.png)\n![Encoded](%2e%2e/private.png)\n![Remote](//example.invalid/a.png)\n![Link](assets/link.png)');
    remote.responses.set(`/git/trees/${assets}`, tree(assets, [{ path: 'link.png', sha: '5'.repeat(40), type: 'blob', mode: '120000' }]));
    const result = await remote.run();
    expect(Object.keys(result.notes[0].images)).toEqual(['assets/link.png']);
    expect(result.assets).toEqual({});
    expect(remote.request.mock.calls.some(([url]) => String(url).endsWith(`/git/blobs/${'5'.repeat(40)}`))).toBe(false);
  });

  it('honors cancellation before starting any network request', async () => {
    const remote = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(remote.run(undefined, controller.signal)).rejects.toThrow();
    expect(remote.request).not.toHaveBeenCalled();
  });
});
