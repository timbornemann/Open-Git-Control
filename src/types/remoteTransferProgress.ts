/** A phase of one push target, never an overall push completion percentage. */
export type RemoteTransferProgressDto = {
  phase: 'lfs-upload' | 'lfs-finalizing' | 'publishing';
  remote: string;
  processedObjects?: number;
  totalObjects?: number;
  processedBytes?: number;
  totalBytes?: number;
  speed?: string;
};
