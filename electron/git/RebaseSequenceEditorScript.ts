/** Runs in Git's private sequence-editor process, without application globals. */
export const REBASE_SEQUENCE_EDITOR_SCRIPT = String.raw`const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const target = process.argv[2];
const source = process.env.OGC_REBASE_TODO_FILE || '';
if (!target || !source) process.exit(1);
const todoLines = JSON.parse(fs.readFileSync(source, 'utf8'));
const rewordPattern = /^reword\s+([0-9a-f]{7,64})\s+(.+)$/i;
const refs = [...new Set(todoLines.map(line => line.match(rewordPattern)?.[1]).filter(Boolean))];
const messages = new Map();
const privateNames = ['ELECTRON_RUN_AS_NODE', 'OGC_GIT_BROKER_KEY', 'OGC_GIT_BROKER_PORT'];
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !privateNames.includes(name.toUpperCase())));
// Bound Windows argument lengths and read immutable messages inside the active Git operation.
for (let start = 0; start < refs.length; start += 64) {
  const output = execFileSync('git', [
    '-c', 'i18n.logOutputEncoding=UTF-8', '-c', 'log.showSignature=false',
    'show', '-s', '--no-notes', '--no-color', '--format=%H%x00%B%x00',
    ...refs.slice(start, start + 64),
  ], { env: gitEnv, encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  const fields = output.split('\0');
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const hash = fields[index].trim().toLowerCase();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(hash)) throw new Error('Could not read an original reword commit message.');
    messages.set(hash, fields[index + 1]);
  }
}
const rebaseStateDir = path.dirname(target);
const output = [];
let rewordIndex = 0;
for (const line of todoLines) {
  const match = line.match(rewordPattern);
  if (!match) { output.push(line); continue; }
  const candidates = [...messages.keys()].filter(hash => hash.startsWith(match[1].toLowerCase()));
  if (candidates.length !== 1) throw new Error('Could not resolve an original reword commit message.');
  const previous = messages.get(candidates[0]);
  const firstBreak = previous.indexOf('\n');
  const message = match[2].trim() + (firstBreak >= 0 ? previous.slice(firstBreak) : '\n');
  const fileName = 'ogc-reword-' + rewordIndex + '.txt';
  fs.writeFileSync(path.join(rebaseStateDir, fileName), message, { encoding: 'utf8', mode: 0o600 });
  output.push('pick ' + match[1] + ' ' + match[2].trim());
  output.push('exec git commit --amend --cleanup=verbatim -F "$(git rev-parse --git-path rebase-merge)/' + fileName + '"');
  rewordIndex += 1;
}
fs.writeFileSync(target, output.join('\n') + '\n', 'utf8');
`;
