import { CancelledError } from '@tanstack/react-query';
import { isGitCancellation } from '@/utils/gitCancellation';

export const isReadCancellation = (error: unknown) => error instanceof CancelledError || isGitCancellation(error);
