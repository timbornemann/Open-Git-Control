import type { RemoteTransferOperations } from '../../src/types/remoteTransfers';
import type { RemoteTransferContext, Runner } from './remoteTransferModels';
import { remoteFetchConfiguration } from './remoteTransferValidation';
import { adoptMissingRemoteTags } from './RemoteSyncReferences';
import { redactGitSensitiveText } from './GitErrorFormatter';

export type FetchOptions = Pick<RemoteTransferOperations['fetch']['input'], 'tagsOnly' | 'includeTags' | 'background'>;
type Credentials = (environment: NodeJS.ProcessEnv, work: (environment: NodeJS.ProcessEnv, signal?: AbortSignal) => Promise<string>) => Promise<string>;

/** One credential scope and transport for all configured branch refs and safe remote tag tracking. */
export async function fetchRemoteReferences(
  repoPath: string,
  name: string,
  context: RemoteTransferContext,
  options: FetchOptions,
  git: Runner,
  credentials: Credentials,
): Promise<{ output: string }> {
  const { args, environment } = remoteFetchConfiguration(name, options);
  const output = await credentials(environment, (envOverrides, signal) =>
    git.streamOutput(repoPath, args, context.onProgress ?? (() => {}), signal, {
      envOverrides,
      ...(options.background === true ? { backgroundFetch: true } : {}),
    }),
  );
  context.ensureActive();
  if (options.includeTags) await adoptMissingRemoteTags(repoPath, name, git, context);
  context.ensureActive();
  return { output: redactGitSensitiveText(output) };
}
