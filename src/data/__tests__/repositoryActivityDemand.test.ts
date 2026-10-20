import { describe, expect, it, vi } from 'vitest';
import { RepositoryActivityDemand } from '../repositoryActivityDemand';

describe('repository activity visibility ownership', () => {
  it('unites normalized paths from multiple views and retains a path until its last owner leaves', () => {
    const demand = new RepositoryActivityDemand();
    const first = Symbol(),
      second = Symbol();
    const listener = vi.fn();
    demand.subscribe(listener);
    demand.setVisible(first, ['C:\\Work\\Repo', 'c:/work/repo', '/first']);
    expect(demand.has('C:/Work/Repo')).toBe(true);
    demand.setVisible(second, ['c:/work/repo', '/second']);
    expect(listener).toHaveBeenCalledTimes(2);
    demand.remove(first);
    expect(demand.has('c:/work/repo')).toBe(true);
    expect(demand.has('/first')).toBe(false);
    demand.remove(second);
    expect(demand.has('c:/work/repo')).toBe(false);
    expect(demand.has('/second')).toBe(false);
  });

  it('does not notify for unchanged membership and releases subscriptions', () => {
    const demand = new RepositoryActivityDemand();
    const owner = Symbol();
    const listener = vi.fn();
    const unsubscribe = demand.subscribe(listener);
    demand.setVisible(owner, ['/a', '/b']);
    demand.setVisible(owner, ['/b', '/a', '/a']);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    demand.remove(owner);
    expect(listener).toHaveBeenCalledOnce();
  });
});
