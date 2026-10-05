import type { HostingCapabilities, HostingProvider } from '@/types/hostingDtos';

const ciLabels: Record<HostingProvider, string> = {
  github: 'GitHub Actions',
  forgejo: 'Forgejo Actions',
  gitlab: 'GitLab CI/CD',
  'bitbucket-cloud': 'Bitbucket Pipelines',
  'bitbucket-data-center': 'CI / build status',
};

export function hostingRepositoryLabels(
  provider: HostingProvider | undefined,
  capabilities: HostingCapabilities | null | undefined,
  tr: (de: string, en: string) => string,
) {
  const releases = capabilities?.releases ?? (provider === 'bitbucket-cloud' ? 'downloads' : provider === 'bitbucket-data-center' ? 'tags' : 'native');
  return {
    changes: capabilities?.changeRequestLabel ?? (provider === 'gitlab' ? 'Merge Requests' : 'Pull Requests'),
    ci: capabilities?.ciLabel ?? (provider === 'bitbucket-data-center' ? tr('CI / Buildstatus', ciLabels[provider]) : provider ? ciLabels[provider] : 'CI'),
    releases: releases === 'downloads' ? tr('Tags & Downloads', 'Tags & downloads') : releases === 'tags' ? tr('Tags & Notes', 'Tags & notes') : 'Releases',
  };
}
