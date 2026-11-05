import { practiceCommitHash } from '@/shared/tutorial/exampleGitIds';
type Plan = { start: number; next: number; hashes: readonly string[] };
/** Prepare a complete rewrite before consuming any fictional object IDs. */
export class DemoCommitSequence {
  private value = 5;
  reset() {
    this.value = 5;
  }
  plan(commits: readonly { hash: string }[], count: number): Plan {
    if (!Number.isInteger(count) || count < 1 || count > 1_000) throw new Error('Unsupported practice commit range.');
    const used = new Set(commits.map((commit) => commit.hash)),
      hashes: string[] = [];
    let next = this.value;
    while (hashes.length < count) {
      const hash = practiceCommitHash(next++);
      if (!used.has(hash)) {
        used.add(hash);
        hashes.push(hash);
      }
    }
    return { start: this.value, next, hashes };
  }
  publish(plan: Plan) {
    if (plan.start !== this.value) throw new Error('The practice commit sequence changed.');
    this.value = plan.next;
  }
  next(commits: readonly { hash: string }[]) {
    const plan = this.plan(commits, 1);
    this.publish(plan);
    return plan.hashes[0];
  }
}
