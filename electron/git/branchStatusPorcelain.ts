import type { RepositoryHead } from '../../src/shared/ipc/branchRecovery';
import { recoveryOid, validLocalRef } from './branchRecoveryRepository';

/** Keep v1 -z records for the existing status consumers, including rename order. */
export function parseBranchStatus(raw: string): { head: RepositoryHead | null; status: string } {
  const fields = raw.split('\0');
  const paths: string[] = [];
  let oid = '';
  let branch = '';
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    if (field.startsWith('# branch.oid ')) oid = field.slice(13);
    if (field.startsWith('# branch.head ')) branch = field.slice(14);
    if (field.startsWith('? ')) paths.push(`?? ${field.slice(2)}`);
    const type = field[0];
    if (type !== '1' && type !== '2' && type !== 'u') continue;
    const metadataFields = type === '1' ? 8 : type === '2' ? 9 : 10;
    let pathStart = 0;
    for (let part = 0; part < metadataFields; part++) {
      pathStart = field.indexOf(' ', pathStart) + 1;
      if (!pathStart) throw new Error('Invalid Git status record.');
    }
    const code = field.slice(2, 4).replace(/\./g, ' ');
    paths.push(`${code} ${field.slice(pathStart)}`);
    if (type === '2') paths.push(fields[++index] ?? '');
  }
  const ref = `refs/heads/${branch}`;
  return {
    head: recoveryOid(oid) ? { kind: 'ready', oid, ...(branch && branch !== '(detached)' && validLocalRef(ref) ? { ref } : {}) } : null,
    status: paths.length ? `${paths.join('\0')}\0` : '',
  };
}
