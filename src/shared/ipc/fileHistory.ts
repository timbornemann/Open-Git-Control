export type FileHistoryOptionsDto = {
  /** Include later changes on the current branch, following renames forward. */
  includeFuture?: boolean;
  offset?: number;
};
