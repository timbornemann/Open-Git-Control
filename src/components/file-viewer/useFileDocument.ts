import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { freshRead, peekResource } from '@/data/clientCache';
import { gitClient } from '@/services/gitClient';
import type { RepositoryFileContextDto, RepositoryFilePreviewDto } from '@/shared/ipc/repositoryFiles';
import type { TextFileEncodingDto } from '@/shared/ipc/contracts/git';
import type { IpcResult } from '@/types/ipc';
import { applyLineEnding, detectLineEnding, normalizeToLf, type LineEnding } from '@/utils/lineEndings';
import { fileViewerIdentity } from './fileViewerRequest';

function documentState(preview: RepositoryFilePreviewDto | null) {
  const text = preview?.kind === 'text' ? normalizeToLf(preview.text) : '';
  const encoding: TextFileEncodingDto = preview?.kind === 'text' ? preview.encoding : 'utf8';
  const lineEnding: LineEnding = preview?.kind === 'text' ? detectLineEnding(preview.text) : '\n';
  return { preview, text, encoding, lineEnding, savedText: text, savedEncoding: encoding, savedLineEnding: lineEnding };
}
const dirtyDocument = (state: ReturnType<typeof documentState>) =>
  state.text !== state.savedText || state.encoding !== state.savedEncoding || state.lineEnding !== state.savedLineEnding;
const cachedPreview = (context: RepositoryFileContextDto) => {
  const result = peekResource<IpcResult<RepositoryFilePreviewDto>>('git', 'getRepositoryFilePreview', [context]);
  return result?.success ? result.data : null;
};

export function useFileDocument(context: RepositoryFileContextDto, refreshTrigger: number, onSaved: () => void, onError: (message: string) => void) {
  const key = fileViewerIdentity(context);
  const keyRef = useRef<string | null>(key);
  keyRef.current = key;
  const [state, setState] = useState(() => documentState(cachedPreview(context)));
  const stateRef = useRef(state);
  stateRef.current = state;
  const [loading, setLoading] = useState(!state.preview);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const saveRef = useRef<Promise<boolean> | null>(null);
  const saveGenerationRef = useRef(0);

  const load = useCallback(
    async (allowLargeImage = false) => {
      if (dirtyDocument(stateRef.current) || saveRef.current) return;
      const generation = ++generationRef.current;
      setLoading(true);
      setError(null);
      try {
        const result = await freshRead(() => gitClient.getRepositoryFilePreview({ ...context, ...(allowLargeImage ? { allowLargeImage: true } : {}) }));
        if (keyRef.current !== key || generationRef.current !== generation) return;
        if (!result.success) {
          setError(result.error || 'Could not load the selected file version.');
          return;
        }
        if (!dirtyDocument(stateRef.current) && !saveRef.current) {
          const next = documentState(result.data);
          stateRef.current = next;
          setState(next);
        }
      } catch (error) {
        if (keyRef.current === key && generationRef.current === generation) setError(error instanceof Error ? error.message : 'Could not load file.');
      } finally {
        if (keyRef.current === key && generationRef.current === generation) setLoading(false);
      }
    },
    [context, key],
  );

  useLayoutEffect(() => {
    keyRef.current = key;
    const next = documentState(cachedPreview(context));
    stateRef.current = next;
    setState(next);
    saveRef.current = null;
    saveGenerationRef.current += 1;
    setSaving(false);
    setError(null);
    return () => {
      generationRef.current += 1;
      keyRef.current = null;
    };
  }, [context, key]);
  useLayoutEffect(() => {
    void load();
  }, [load, refreshTrigger]);

  const update = useCallback(
    (changes: Partial<Pick<typeof state, 'text' | 'encoding' | 'lineEnding'>>) => {
      if (keyRef.current !== key || !stateRef.current.preview?.editable) return;
      const next = { ...stateRef.current, ...changes };
      stateRef.current = next;
      setState(next);
    },
    [key],
  );
  const discard = useCallback(() => {
    const current = stateRef.current;
    const next = { ...current, text: current.savedText, encoding: current.savedEncoding, lineEnding: current.savedLineEnding };
    stateRef.current = next;
    setState(next);
  }, []);
  const save = useCallback((): Promise<boolean> => {
    if (saveRef.current) return saveRef.current;
    const captured = stateRef.current;
    if (keyRef.current !== key || !captured.preview?.editable || captured.preview.kind !== 'text') return Promise.resolve(false);
    setSaving(true);
    setError(null);
    const operation = ++saveGenerationRef.current;
    const promise = (async () => {
      try {
        const result = await gitClient.saveRepositoryFile({
          ...context,
          content: applyLineEnding(captured.text, captured.lineEnding),
          encoding: captured.encoding,
          expectedVersion: captured.preview!.version,
        });
        if (keyRef.current !== key || operation !== saveGenerationRef.current) return false;
        if (!result.success) throw new Error(result.error || 'Could not save the selected file version.');
        const current = stateRef.current;
        const next = {
          ...current,
          savedText: captured.text,
          savedEncoding: captured.encoding,
          savedLineEnding: captured.lineEnding,
          preview: {
            ...captured.preview!,
            ...result.data,
            text: applyLineEnding(captured.text, captured.lineEnding),
            encoding: captured.encoding,
          } as RepositoryFilePreviewDto,
        };
        stateRef.current = next;
        setState(next);
        onSaved();
        return !dirtyDocument(next);
      } catch (error) {
        if (keyRef.current === key && operation === saveGenerationRef.current) {
          const message = error instanceof Error ? error.message : 'Could not save file.';
          setError(message);
          onError(message);
        }
        return false;
      } finally {
        if (keyRef.current === key && operation === saveGenerationRef.current) {
          saveRef.current = null;
          setSaving(false);
        }
      }
    })();
    saveRef.current = promise;
    return promise;
  }, [context, key, onSaved, onError]);
  return { ...state, dirty: dirtyDocument(state), loading, saving, error, update, discard, save, reload: load };
}
