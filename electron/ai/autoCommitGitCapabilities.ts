import type {
  CommitAtPathCapable,
  CommitForPathsCapable,
  CommitMessageCapable,
  StagePathsCapable,
} from './aiServiceTypes';
import { isObjectRecord } from './jsonResponse';

export const hasStagePaths = (value: unknown): value is StagePathsCapable => (
  isObjectRecord(value) && typeof value.stagePaths === 'function'
);

export const hasCommitWithMessageForPaths = (value: unknown): value is CommitForPathsCapable => (
  isObjectRecord(value) && typeof value.commitWithMessageForPaths === 'function'
);

export const hasCommitWithMessageAtPath = (value: unknown): value is CommitAtPathCapable => (
  isObjectRecord(value)
  && typeof value.commitWithMessageAtPath === 'function'
  && typeof value.getRepoPath === 'function'
);

export const hasCommitWithMessage = (value: unknown): value is CommitMessageCapable => (
  isObjectRecord(value) && typeof value.commitWithMessage === 'function'
);
