import type { HunkExample } from '@/shared/tutorial/types';

const head =
  '# OGC-Lernprojekt\n\nGreeting: Hello!\nAuthor: Team\nStatus: Draft\n\n## Working together\nKeep changes focused.\nReview the diff before staging.\nUse a branch for each task.\nKeep useful commit messages.\nRun the project checks.\nDiscuss changes with the team.\nKeep shared documentation current.\n\n## Next steps\n- Check files\n- Create a commit\n';
const greeting = (text: string) => text.replace('Greeting: Hello!', 'Greeting: Welcome!');
const author = (text: string) => text.replace('Author: Team', 'Author: Learning team');
const first = (text: string) => author(greeting(text)).replace('Status: Draft', 'Status: Ready');
const last = (text: string) => text.replace('- Check files', '- Compare changes');
export const HUNK_CONTENT = {
  head,
  greeting: greeting(head),
  'first-two': author(greeting(head)),
  first: first(head),
  last: last(head),
  all: last(first(head)),
} satisfies Record<HunkExample, string>;
