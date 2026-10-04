import type { HostingAdapterFactory } from '../HostingAdapter';
import { GitHubAdapter, ForgejoAdapter } from './GitHubAdapter';
import { GitLabAdapter } from './GitLabAdapter';
import { BitbucketCloudAdapter } from './BitbucketCloudAdapter';
import { BitbucketDataCenterAdapter } from './BitbucketDataCenterAdapter';

export const createHostingAdapter: HostingAdapterFactory = (connection, credentials) => {
  switch (connection.provider) {
    case 'github':
      return new GitHubAdapter(connection, credentials);
    case 'forgejo':
      return new ForgejoAdapter(connection, credentials);
    case 'gitlab':
      return new GitLabAdapter(connection, credentials);
    case 'bitbucket-cloud':
      return new BitbucketCloudAdapter(connection, credentials);
    case 'bitbucket-data-center':
      return new BitbucketDataCenterAdapter(connection, credentials);
    default:
      throw new Error('Unsupported hosting provider.');
  }
};
export { GitHubAdapter, ForgejoAdapter, GitLabAdapter, BitbucketCloudAdapter, BitbucketDataCenterAdapter };
export { HostingHttpError, HostingHttpTransport } from './HostingHttpTransport';
