import type { Dispatch, SetStateAction } from 'react';
import type { ConfirmDialogState, InputDialogState } from '@/app/state/contracts';
import { gitClient } from '@/services/gitClient';
import type { WorkingDirectoryEntryDto, WorkingDirectoryMoveDto, WorkingDirectoryMutationResultDto } from '@/shared/ipc/contracts/git';
import type { ToastMessage } from '@/types/git';
import { copyTextToClipboard } from '@/utils/clipboard';
import {
  addAffixMoves,
  basename,
  changeExtensionMoves,
  commonEntryParent,
  getTopLevelEntries,
  gitignorePatterns,
  isEntryName,
  normalizeNameMoves,
  parentPath,
  removeAffixMoves,
  selectedPathText,
  sortByFileTypeMoves,
} from './workingDirectoryToolTransforms';

type RunMutation = (action: () => Promise<WorkingDirectoryMutationResultDto>, removedDirectories?: string[], invalidatedEntries?: string[]) => Promise<boolean>;

type Params = {
  repoPath: string;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setInputDialog: Dispatch<SetStateAction<InputDialogState | null>>;
  setToast: (message: ToastMessage | null) => void;
  runMutation: RunMutation;
  loadDirectory: (parentPath?: string, options?: { silent?: boolean }) => Promise<WorkingDirectoryEntryDto[]>;
};

const hasPathSeparator = (value: string) => /[\\/]/.test(value);
const boolValue = (value: string | undefined) => value === 'true';
const joinPath = (parent: string, name: string) => (parent ? `${parent}/${name}` : name);
const formatCount = (count: number, singular: string, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

const validateMoves = (moves: WorkingDirectoryMoveDto[]): string | null => {
  if (moves.length === 0) return 'None of the selected names would change.';
  if (moves.some((move) => !isEntryName(basename(move.targetPath)))) return 'The settings produce an invalid file or folder name.';
  return null;
};

export const createWorkingDirectoryToolActions = ({ repoPath, setConfirmDialog, setInputDialog, setToast, runMutation, loadDirectory }: Params) => {
  const executeNameMoves = async (entries: WorkingDirectoryEntryDto[], moves: WorkingDirectoryMoveDto[], successMessage: string) => {
    const validationError = validateMoves(moves);
    if (validationError) {
      setToast({ msg: validationError, isError: true });
      return;
    }
    const topLevelEntries = getTopLevelEntries(entries);
    const ok = await runMutation(
      () => gitClient.applyWorkingDirectoryMoves(moves, false, repoPath),
      topLevelEntries.filter((entry) => entry.kind === 'directory').map((entry) => entry.path),
      moves.map((move) => move.sourcePath),
    );
    if (ok) setToast({ msg: successMessage, isError: false });
  };

  const addAffixes = (entries: WorkingDirectoryEntryDto[]) =>
    setInputDialog({
      title: 'Add prefix / suffix',
      message: `Add a prefix and/or suffix to ${formatCount(getTopLevelEntries(entries).length, 'selected entry', 'selected entries')}. For files, the suffix is inserted before the extension.`,
      fields: [
        {
          id: 'prefix',
          label: 'Prefix',
          placeholder: 'for example, archive-',
          helperText: 'Optional. Path separators are not allowed.',
          validate: (value, values) => {
            if (hasPathSeparator(value)) return 'A prefix cannot contain a path separator.';
            if (!value.trim() && !(values.suffix || '').trim()) return 'Enter a prefix or a suffix.';
            return null;
          },
        },
        {
          id: 'suffix',
          label: 'Suffix',
          placeholder: 'for example, -old',
          helperText: 'Optional. For files, it is placed before the extension.',
          validate: (value, values) => {
            if (hasPathSeparator(value)) return 'A suffix cannot contain a path separator.';
            if (!value.trim() && !(values.prefix || '').trim()) return 'Enter a prefix or a suffix.';
            return null;
          },
        },
      ],
      contextItems: [{ label: 'Selected entries', value: String(getTopLevelEntries(entries).length) }],
      irreversible: false,
      consequences: 'Existing files and folders will not be overwritten.',
      confirmLabel: 'Rename selected',
      onSubmit: async (values) => {
        const prefix = values.prefix || '';
        const suffix = values.suffix || '';
        if (!prefix.trim() && !suffix.trim()) {
          setToast({ msg: 'Enter a prefix or a suffix.', isError: true });
          return;
        }
        await executeNameMoves(entries, addAffixMoves(entries, prefix, suffix), 'Selected entries renamed.');
      },
    });

  const removeAffixes = (entries: WorkingDirectoryEntryDto[]) =>
    setInputDialog({
      title: 'Remove prefix / suffix',
      message: 'Remove matching text from the beginning and/or end of the selected names.',
      fields: [
        {
          id: 'prefix',
          label: 'Prefix to remove',
          placeholder: 'for example, archive-',
          validate: (value, values) => {
            if (hasPathSeparator(value)) return 'A prefix cannot contain a path separator.';
            if (!value && !values.suffix) return 'Enter a prefix or a suffix.';
            return null;
          },
        },
        {
          id: 'suffix',
          label: 'Suffix to remove',
          placeholder: 'for example, -old',
          helperText: 'For files, this is removed before the extension.',
          validate: (value, values) => {
            if (hasPathSeparator(value)) return 'A suffix cannot contain a path separator.';
            if (!value && !values.prefix) return 'Enter a prefix or a suffix.';
            return null;
          },
        },
      ],
      contextItems: [{ label: 'Selected entries', value: String(getTopLevelEntries(entries).length) }],
      irreversible: false,
      consequences: 'Names without the specified prefix or suffix remain unchanged.',
      confirmLabel: 'Remove and rename',
      onSubmit: async (values) => {
        await executeNameMoves(entries, removeAffixMoves(entries, values.prefix || '', values.suffix || ''), 'Matching prefixes and suffixes removed.');
      },
    });

  const changeExtension = (entries: WorkingDirectoryEntryDto[]) =>
    setInputDialog({
      title: 'Change file extension',
      message: `Change the extension of ${formatCount(entries.length, 'selected file')}.`,
      fields: [
        {
          id: 'extension',
          label: 'New extension',
          placeholder: 'jpg',
          helperText: 'Enter the extension with or without a leading dot.',
          required: true,
          validate: (value) => (/^\.?[^.\\/]+$/.test(value.trim()) ? null : 'Enter one valid extension, for example "jpg".'),
        },
      ],
      contextItems: [{ label: 'Selected files', value: String(entries.length) }],
      irreversible: false,
      consequences: 'Existing files will not be overwritten.',
      confirmLabel: 'Change extension',
      onSubmit: async (values) => {
        const extension = (values.extension || '').trim();
        await executeNameMoves(entries, changeExtensionMoves(entries, extension), 'File extensions changed.');
      },
    });

  const normalizeNames = (entries: WorkingDirectoryEntryDto[]) =>
    setInputDialog({
      title: 'Normalize names',
      message: `Apply consistent naming to ${formatCount(getTopLevelEntries(entries).length, 'selected entry', 'selected entries')}.`,
      fields: [
        {
          id: 'lowercase',
          label: 'Convert to lowercase',
          type: 'checkbox',
          defaultValue: 'true',
          validate: (_value, values) =>
            boolValue(values.lowercase) || boolValue(values.hyphens) || boolValue(values.umlauts) ? null : 'Select at least one normalization.',
        },
        {
          id: 'hyphens',
          label: 'Replace spaces with hyphens',
          type: 'checkbox',
          defaultValue: 'true',
        },
        {
          id: 'umlauts',
          label: 'Replace German umlauts',
          helperText: 'ä → ae, ö → oe, ü → ue, ß → ss',
          type: 'checkbox',
          defaultValue: 'true',
        },
      ],
      contextItems: [{ label: 'Selected entries', value: String(getTopLevelEntries(entries).length) }],
      irreversible: false,
      consequences: 'Existing files and folders will not be overwritten.',
      confirmLabel: 'Normalize names',
      onSubmit: async (values) => {
        const moves = normalizeNameMoves(entries, {
          lowercase: boolValue(values.lowercase),
          hyphenateSpaces: boolValue(values.hyphens),
          replaceUmlauts: boolValue(values.umlauts),
        });
        await executeNameMoves(entries, moves, 'Selected names normalized.');
      },
    });

  const sortFilesByType = async (entries: WorkingDirectoryEntryDto[]) => {
    const directoryEntries = entries.filter((entry) => entry.kind === 'directory');
    const directoryFiles = (await Promise.all(directoryEntries.map((entry) => loadDirectory(entry.path)))).flatMap((children) =>
      children.filter((entry) => entry.kind === 'file'),
    );
    const sourceEntries = [...new Map([...entries.filter((entry) => entry.kind === 'file'), ...directoryFiles].map((entry) => [entry.path, entry])).values()];
    const moves = sortByFileTypeMoves(sourceEntries);
    if (moves.length === 0) {
      setToast({ msg: 'No selected files need to be sorted.', isError: true });
      return;
    }
    const destinationFolders = [...new Set(moves.map((move) => parentPath(move.targetPath)))];
    setConfirmDialog({
      variant: 'confirm',
      title: 'Sort files by type?',
      message: `${formatCount(moves.length, 'file')} will be moved into type folders.`,
      contextItems: [
        { label: 'Files', value: String(moves.length) },
        { label: 'Target folders', value: destinationFolders.join(', ') },
      ],
      irreversible: false,
      consequences: 'Missing images, documents, audio, video, archives, or other folders will be created.',
      confirmLabel: 'Sort files',
      onConfirm: async () => {
        const ok = await runMutation(
          () => gitClient.applyWorkingDirectoryMoves(moves, true, repoPath),
          [],
          moves.map((move) => move.sourcePath),
        );
        if (ok) setToast({ msg: `${formatCount(moves.length, 'file')} sorted by type.`, isError: false });
      },
    });
  };

  const cleanEmptyFolders = async (entries: WorkingDirectoryEntryDto[]) => {
    const selectedFolders = entries.filter((entry) => entry.kind === 'directory').map((entry) => entry.path);
    const folderPaths = selectedFolders.includes('') ? [] : selectedFolders;
    const result = await gitClient.findEmptyWorkingDirectoryFolders(folderPaths, repoPath);
    if (!result.success) {
      setToast({ msg: result.error || 'Could not scan for empty folders.', isError: true });
      return;
    }
    const emptyFolders = result.data || [];
    if (emptyFolders.length === 0) {
      setToast({ msg: 'No empty folders were found.', isError: false });
      return;
    }
    const contextItems = emptyFolders.slice(0, 10).map((folderPath) => ({ label: 'Empty folder', value: folderPath }));
    if (emptyFolders.length > contextItems.length)
      contextItems.push({ label: 'More', value: `${emptyFolders.length - contextItems.length} additional folders` });
    setConfirmDialog({
      variant: 'danger',
      title: `Delete ${formatCount(emptyFolders.length, 'empty folder')}?`,
      message: 'Only folders that are still empty when you confirm will be removed.',
      contextItems,
      irreversible: true,
      consequences: 'The backend rechecks every folder and never recursively deletes files.',
      confirmLabel: 'Delete empty folders',
      onConfirm: async () => {
        const ok = await runMutation(() => gitClient.deleteEmptyWorkingDirectoryFolders(emptyFolders, repoPath), emptyFolders, emptyFolders);
        if (ok) setToast({ msg: `${formatCount(emptyFolders.length, 'empty folder')} deleted.`, isError: false });
      },
    });
  };

  const addToGitignore = (entries: WorkingDirectoryEntryDto[]) =>
    setInputDialog({
      title: 'Add to .gitignore',
      message: `Create ignore rules for ${formatCount(entries.length, 'selected entry', 'selected entries')}.`,
      fields: [
        {
          id: 'mode',
          label: 'Rule type',
          type: 'select',
          defaultValue: 'exact',
          options: [
            { value: 'exact', label: 'Exact selected paths' },
            { value: 'extensions', label: 'Selected file extensions (*.log)' },
          ],
        },
      ],
      contextItems: [{ label: 'Selected entries', value: String(entries.length) }],
      irreversible: false,
      consequences: 'New rules are appended to .gitignore without duplicates. Files already tracked by Git remain tracked.',
      confirmLabel: 'Add ignore rules',
      onSubmit: async (values) => {
        const patterns = gitignorePatterns(entries, values.mode === 'extensions' ? 'extensions' : 'exact');
        if (patterns.length === 0) {
          setToast({ msg: 'The selection has no file extensions to ignore.', isError: true });
          return;
        }
        const ok = await runMutation(async () => {
          for (const pattern of patterns) {
            const result = await gitClient.addIgnoreRule(pattern, repoPath);
            if (!result.success) return result;
          }
          return { success: true };
        });
        if (ok) setToast({ msg: `${formatCount(patterns.length, 'ignore rule')} added or already present.`, isError: false });
      },
    });

  const copyPaths = async (entries: WorkingDirectoryEntryDto[], absolute: boolean) => {
    const copied = await copyTextToClipboard(selectedPathText(entries, repoPath, absolute));
    setToast({
      msg: copied ? `${absolute ? 'Absolute' : 'Relative'} ${entries.length === 1 ? 'path' : 'paths'} copied.` : 'Could not copy the selected paths.',
      isError: !copied,
    });
  };

  const createArchive = (entries: WorkingDirectoryEntryDto[]) => {
    const topLevelEntries = getTopLevelEntries(entries).filter((entry) => entry.path);
    const destinationFolder = commonEntryParent(topLevelEntries);
    const defaultBaseName = topLevelEntries.length === 1 ? basename(topLevelEntries[0].path).replace(/\.[^.]+$/, '') || 'archive' : 'selection';
    setInputDialog({
      title: 'Create ZIP archive',
      message: `Create an archive containing ${formatCount(topLevelEntries.length, 'selected entry', 'selected entries')}.`,
      fields: [
        {
          id: 'name',
          label: 'Archive name',
          defaultValue: `${defaultBaseName}.zip`,
          required: true,
          validate: (value) => {
            const name = value.trim();
            if (!isEntryName(name)) return 'Enter a ZIP filename, not a path.';
            return name.toLowerCase().endsWith('.zip') ? null : 'The archive name must end with .zip.';
          },
        },
      ],
      contextItems: [{ label: 'Destination', value: destinationFolder || 'Repository root' }],
      irreversible: false,
      consequences: 'The archive is created without external tools. Existing files are not overwritten.',
      confirmLabel: 'Create archive',
      onSubmit: async (values) => {
        const targetPath = joinPath(destinationFolder, values.name.trim());
        const ok = await runMutation(() =>
          gitClient.createWorkingDirectoryArchive(
            topLevelEntries.map((entry) => entry.path),
            targetPath,
            repoPath,
          ),
        );
        if (ok) setToast({ msg: `Archive created: ${targetPath}`, isError: false });
      },
    });
  };

  return {
    addAffixes,
    removeAffixes,
    changeExtension,
    normalizeNames,
    sortFilesByType,
    cleanEmptyFolders,
    addToGitignore,
    copyPaths,
    createArchive,
  };
};

export type WorkingDirectoryToolActions = ReturnType<typeof createWorkingDirectoryToolActions>;
