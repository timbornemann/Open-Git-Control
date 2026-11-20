import type { BranchHeadProblem } from '../shared/ipc/branchRecovery';

export type IpcSuccessResult<T> = {
  success: true;
  data: T;
  error?: never;
};

export type IpcErrorResult = {
  success: false;
  error: string;
  data?: never;
  headProblem?: BranchHeadProblem;
};

export type IpcResult<T> = IpcSuccessResult<T> | IpcErrorResult;
