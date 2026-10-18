import { describe, expect, it, vi } from 'vitest';
import { classifyLfsObjects, readLfsObjectInfo, readLfsPointers } from '../GitLfsPointers';
import { lfsPointer, pointerText } from './lfsInventoryFixture';

const oid = 'a'.repeat(40),
  second = 'b'.repeat(40);
const value = lfsPointer('content'),
  text = pointerText(value);
const blob = (id: string, content: string) => Buffer.from(`${id} blob ${Buffer.byteLength(content)}\n${content}\n`);

describe('bounded LFS pointer classification', () => {
  it('returns verified negative classifications alongside pointers and ignores larger blobs', async () => {
    const third = 'c'.repeat(40);
    const reader = {
      runBuffer: vi
        .fn()
        .mockResolvedValueOnce(Buffer.from(`${oid} blob ${Buffer.byteLength(text)}\n${second} blob 2048\n${third} blob 0\n`))
        .mockResolvedValueOnce(Buffer.concat([blob(oid, text), blob(third, '')])),
    };
    expect(await classifyLfsObjects('/repo', [oid, second, third], reader)).toEqual(
      new Map([
        [oid, value],
        [second, null],
        [third, null],
      ]),
    );
    expect(reader.runBuffer.mock.calls[1][2].input).toBe(`${oid}\n${third}\n`);
  });

  it.each(['', `${oid} missing\n`, `${second} blob 123\n`, `${oid} blob 9007199254740992\n`, `${oid} blob 3\n${second} blob 3\n`])(
    'never treats incomplete or invalid metadata as a non-pointer: %j',
    async (metadata) => {
      const reader = { runBuffer: vi.fn().mockResolvedValue(Buffer.from(metadata)) };
      await expect(classifyLfsObjects('/repo', [oid], reader)).rejects.toThrow();
    },
  );

  it.each([
    `${second} blob ${Buffer.byteLength(text)}\n${text}\n`,
    `${oid} blob 999\n${text}\n`,
    `${oid} blob ${Buffer.byteLength(text)}\n${text}`,
    `${oid} blob ${Buffer.byteLength(text)}\n${text}!`,
    `${oid} blob ${Buffer.byteLength(text)}\n${text}\nextra`,
  ])('rejects malformed pointer bodies rather than caching an incomplete batch: %j', async (body) => {
    const reader = {
      runBuffer: vi
        .fn()
        .mockResolvedValueOnce(Buffer.from(`${oid} blob ${Buffer.byteLength(text)}\n`))
        .mockResolvedValueOnce(Buffer.from(body)),
    };
    await expect(readLfsPointers('/repo', [oid], reader)).rejects.toThrow();
  });

  it('allows absent old snapshot heads only when the caller explicitly requests it', async () => {
    const reader = { runBuffer: vi.fn().mockResolvedValue(Buffer.from(`${oid} missing\n`)) };
    expect(await readLfsObjectInfo('/repo', [oid], reader, {}, true)).toEqual([null]);
    await expect(readLfsObjectInfo('/repo', [oid], reader)).rejects.toThrow('not available locally');
  });

  it('does not start a pre-cancelled classification or accept revision expressions as blob identities', async () => {
    const reader = { runBuffer: vi.fn() };
    const controller = new AbortController();
    controller.abort();
    await expect(classifyLfsObjects('/repo', [oid], reader, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(classifyLfsObjects('/repo', ['HEAD'], reader)).rejects.toThrow('Invalid Git blob identity');
    expect(reader.runBuffer).not.toHaveBeenCalled();
  });
});
