import { execFile } from 'node:child_process';
import type { StorageIssue } from '../../src/shared/ipc/storageMaintenance';
import { repositoryPathKey } from './activeRepositoryAuthorization';
import { DIRECTORY_HEALTH_PROBE } from './directoryHealthProbe';

export interface RecoveryInventory {
  bytes: number;
  files: number;
  protectedPaths: Set<string>;
  retainedPaths?: Set<string>;
  issues: StorageIssue[];
}
const SCAN = `const fs=require('fs'),p=require('path'),common=process.argv[1];
${DIRECTORY_HEALTH_PROBE}
const key=v=>process.platform==='win32'?p.resolve(v).toLowerCase():p.resolve(v);
const result={bytes:0,files:0,unclear:false,hasPackedBackups:false,owners:[],pending:[],completed:[]};
const id=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,oid=/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
function safe(file) { let next=common; if(fs.lstatSync(next).isSymbolicLink())throw Error('redirected'); for(const part of p.relative(common,file).split(p.sep).filter(Boolean)){next=p.join(next,part);if(fs.lstatSync(next).isSymbolicLink())throw Error('redirected');} }
try {
 const health=directoryHealth(common);
 if(health==='missing'){process.stdout.write(JSON.stringify(result));process.exit(0);}
 if(health!=='available')throw Error('unreachable');
 safe(common);fs.readdirSync(common);
 const dir=p.join(common,'ogc-commit-message-edits');
 if(fs.existsSync(dir)) {
  safe(dir);
  for(const name of fs.readdirSync(dir)) {
   const file=p.join(dir,name);safe(file);const stat=fs.lstatSync(file);
   if(!stat.isFile()){result.unclear=true;continue;}
   result.bytes+=stat.size;result.files++;
   try {
    if(stat.size>16*1024*1024)throw Error('oversized');
    const j=JSON.parse(fs.readFileSync(file,'utf8')),relative=typeof j.gitDir==='string'?p.relative(key(common),key(j.gitDir)):'invalid';
    if(j.version!==1||!id.test(j.id)||name!==j.id+'.json'||!oid.test(j.oldHead)||!Number.isSafeInteger(j.createdAt)||j.createdAt<0||typeof j.repoPath!=='string'||!p.isAbsolute(j.repoPath)||typeof j.commonDir!=='string'||key(j.commonDir)!==key(common)||(relative&&!/^worktrees[/\\\\][^/\\\\]+$/.test(relative))||typeof j.branch!=='string'||!j.branch.startsWith('refs/heads/')||!['preparing','published','cleaned'].includes(j.state))throw Error('unsupported');
    result.owners.push(j.repoPath);(j.state==='cleaned'?result.completed:result.pending).push(j.repoPath);
   } catch {result.unclear=true;}
  }
 }
 const refs=p.join(common,'refs','ogc','commit-reword');
 if(fs.existsSync(refs)){safe(refs);for(const name of fs.readdirSync(refs)){const file=p.join(refs,name);safe(file);const stat=fs.lstatSync(file);if(stat.isFile()){result.bytes+=stat.size;result.files++;}else result.unclear=true;}}
 const packed=p.join(common,'packed-refs');
 if(fs.existsSync(packed)){safe(packed);if(fs.statSync(packed).size>16*1024*1024)throw Error('oversized reference index');result.hasPackedBackups=/^[a-f0-9]+ refs\\/ogc\\/commit-reword\\//m.test(fs.readFileSync(packed,'utf8'));if(result.hasPackedBackups&&!result.owners.length)result.unclear=true;}
}catch{result.unclear=true;}
for(const field of ['owners','pending','completed'])result[field]=[...new Set(result[field])].slice(0,1000);
process.stdout.write(JSON.stringify(result));`;

/** Read-only scans run in bounded child processes, including previously observed missing worktrees. */
export async function inventoryRecovery(directories: Record<string, string>): Promise<RecoveryInventory> {
  const result: RecoveryInventory = { bytes: 0, files: 0, protectedPaths: new Set(), retainedPaths: new Set(), issues: [] };
  const owners = new Map<string, string[]>();
  for (const [repo, directory] of Object.entries(directories)) owners.set(directory, [...(owners.get(directory) || []), repo]);
  const entries = [...owners.entries()];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(2, entries.length) }, async () => {
      while (next < entries.length) {
        const [common, repos] = entries[next++];
        const value = await new Promise<{
          bytes: number;
          files: number;
          unclear: boolean;
          hasPackedBackups: boolean;
          pending: string[];
          completed: string[];
        } | null>((resolve) => {
          execFile(
            process.execPath,
            ['-e', SCAN, common],
            { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 10_000, maxBuffer: 1024 ** 2 },
            (error, stdout) => {
              try {
                resolve(error ? null : JSON.parse(stdout));
              } catch {
                resolve(null);
              }
            },
          );
        });
        result.bytes += value?.bytes || 0;
        result.files += value?.files || 0;
        if (!value || value.unclear || value.files || value.hasPackedBackups)
          for (const repo of [...repos, ...(value?.pending || []), ...(value?.completed || [])]) result.retainedPaths!.add(repositoryPathKey(repo));
        if (!value || value.unclear || value.pending.length) {
          for (const repo of [...repos, ...(value?.pending || [])]) result.protectedPaths.add(repositoryPathKey(repo));
          result.issues.push({ category: 'recovery', path: common, reason: 'open-recovery-operation' });
        }
        if (value?.completed.length) result.issues.push({ category: 'recovery', path: common, reason: 'completed-recovery-operation' });
      }
    }),
  );
  return result;
}
