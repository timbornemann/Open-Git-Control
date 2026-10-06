import type { HostedRepository, HostingConnection } from '../../src/types/hostingDtos';
import type { HostingOperations } from '../../src/shared/ipc/contracts/hosting';
import type { HostingAdapter } from './HostingAdapter';
import type { HostingCatalogStore } from './HostingCatalogStore';

type Context = {
  connection: (id: string) => HostingConnection;
  generation: (id: string) => number;
  authenticatedAdapter: (id: string) => Promise<HostingAdapter>;
};

/** Disk previews are independent of authentication and network refreshes. */
export class HostingRepositoryCatalog {
  private readonly scans = new Map<string, { generation: number; cursor: string | null; items: HostedRepository[] }>();
  constructor(
    private readonly store: HostingCatalogStore,
    private readonly context: Context,
  ) {}

  cached(connectionId: string): HostingOperations['cachedRepositories']['output'] {
    const connection = this.context.connection(connectionId);
    return { items: connection.hasCredentials ? (this.store.read(connection) ?? []) : [], nextCursor: null, stale: true };
  }

  async repositories(params: HostingOperations['repositories']['input']): Promise<HostingOperations['repositories']['output']> {
    const id = params.connectionId;
    const generation = this.context.generation(id);
    try {
      const adapter = await this.context.authenticatedAdapter(id);
      const page = await adapter.repositories(params);
      if (generation !== this.context.generation(id)) throw new Error('The hosting account changed while loading repositories.');
      if (!params.search) {
        const scan = !params.cursor ? { generation, cursor: null as string | null, items: [] as HostedRepository[] } : this.scans.get(id);
        if (scan && scan.generation === generation && (!params.cursor || scan.cursor === params.cursor)) {
          scan.items.push(...page.items);
          scan.cursor = page.nextCursor;
          this.scans.set(id, scan);
          const previous = page.nextCursor ? this.cached(id).items : [];
          const items = [...new Map([...previous, ...scan.items].map((repo) => [repo.ref.repositoryId, repo])).values()];
          // Cache every successful page, including accounts with more than one
          // page that the user has not fully expanded yet.
          this.store.write(this.context.connection(id), items);
          if (!page.nextCursor) this.scans.delete(id);
        }
      }
      return page;
    } catch (error) {
      if (generation !== this.context.generation(id)) throw error;
      const cached = this.cached(id).items;
      if (!cached.length || params.cursor) throw error;
      const search = (params.search || '').toLowerCase();
      return { items: cached.filter((repo) => `${repo.fullName} ${repo.description || ''}`.toLowerCase().includes(search)), nextCursor: null, stale: true };
    }
  }
}
