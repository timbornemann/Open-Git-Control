import { normalizeRepoPathKey } from '@/utils/repoPath';

/** View-owned visibility hints, shared by all repository surfaces in this renderer. */
export class RepositoryActivityDemand {
  private owners = new Map<symbol, Set<string>>();
  private visible = new Set<string>();
  private listeners = new Set<() => void>();

  setVisible(owner: symbol, paths: Iterable<string>) {
    const keys = new Set([...paths].map(normalizeRepoPathKey).filter(Boolean));
    if (keys.size) this.owners.set(owner, keys);
    else this.owners.delete(owner);
    const next = new Set([...this.owners.values()].flatMap((entries) => [...entries]));
    if (next.size === this.visible.size && [...next].every((key) => this.visible.has(key))) return;
    this.visible = next;
    for (const listener of this.listeners) listener();
  }

  remove(owner: symbol) {
    this.setVisible(owner, []);
  }

  has(path: string) {
    return this.visible.has(normalizeRepoPathKey(path));
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const repositoryActivityDemand = new RepositoryActivityDemand();
