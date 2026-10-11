import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import type { RepositoryHealth } from '../../src/shared/ipc/storageMaintenance';
import { toolExecutable } from '../system-tools/toolRuntime';
import { DIRECTORY_HEALTH_PROBE } from './directoryHealthProbe';

// Filesystem calls on disconnected Windows shares can block. Keep them out of the main process.
const PROBE = `const fs=require('fs'),p=require('path'),cp=require('child_process'),target=process.argv[1],git=process.argv[2];
${DIRECTORY_HEALTH_PROBE}
let result=directoryHealth(target),commonDirectory;
if(result==='available') {
 try {
  const dotGit=p.join(target,'.git');
  let dotGitEntry;try {dotGitEntry=fs.lstatSync(dotGit);} catch(error) {if(error.code!=='ENOENT')throw error;}
  if(dotGitEntry?.isSymbolicLink())fs.statSync(fs.realpathSync(dotGit));
  result=(fs.existsSync(dotGit)||(fs.existsSync(p.join(target,'HEAD'))&&fs.existsSync(p.join(target,'objects'))))?'available':'invalid';
  if(result==='available') { try {const common=cp.execFileSync(git,['-C',target,'rev-parse','--git-common-dir'],{timeout:5000,windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); commonDirectory=fs.realpathSync(p.resolve(target,common));} catch(error) {result=error.code==='ENOENT'?'git-unavailable':(['ETIMEDOUT','EACCES','EPERM'].includes(error.code)||/permission denied|access is denied/i.test(String(error.stderr)))?'unreachable':'invalid';} }
 } catch {result='unreachable';}
}
process.stdout.write(JSON.stringify({health:result,commonDirectory}));`;

const commonDirectories = new Map<string, string>();
/** Only successful isolated probes populate this map; this accessor never touches a drive. */
export const probedCommonDirectory = (repo: string) => commonDirectories.get(repositoryPathKey(repo));

export function probeRepositoryHealth(repoPath: string): Promise<RepositoryHealth> {
  let git: string;
  try {
    git = toolExecutable('git');
  } catch {
    return Promise.resolve('git-unavailable');
  }
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['-e', PROBE, repoPath, git],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 8192,
      },
      (error, stdout) => {
        try {
          if (error) throw error;
          const value = JSON.parse(stdout) as { health: RepositoryHealth; commonDirectory?: string };
          if (!['available', 'missing', 'invalid', 'git-unavailable', 'unreachable'].includes(value.health)) throw new Error('Invalid probe.');
          if (value.health === 'available' && typeof value.commonDirectory === 'string' && path.isAbsolute(value.commonDirectory)) {
            if (commonDirectories.size >= 10_000) commonDirectories.delete(commonDirectories.keys().next().value!);
            commonDirectories.set(repositoryPathKey(repoPath), value.commonDirectory);
          }
          resolve(value.health);
        } catch {
          resolve('unreachable');
        }
      },
    );
  });
}
