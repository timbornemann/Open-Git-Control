import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EditJournal } from './commitMessageEditJournal';

export const editLockContents = (journal: EditJournal) => `Open Git Control commit message edit ${journal.id}\n`;

export function releaseEditLocks(journal: EditJournal) {
  for (const name of ['HEAD.lock', 'index.lock']) {
    const file = path.join(journal.gitDir, name);
    try {
      if (!fs.lstatSync(file).isSymbolicLink() && fs.readFileSync(file, 'utf8') === editLockContents(journal)) fs.unlinkSync(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
