const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const privateFile = 'private-note.txt';
const original = 'Private file on disk.\n';
const draft = 'PRIVATE UNSAVED EDITOR DRAFT\n';
const message = 'PRIVATE UNFINISHED COMMIT';
const description = 'Private commit description that must survive the tutorial.';

function prepare(profile) {
  const directory = path.join(path.resolve(profile), 'private-workspace');
  assert.equal(path.dirname(directory), path.resolve(profile));
  fs.mkdirSync(directory);
  const templates = path.join(directory, 'empty-templates');
  fs.mkdirSync(templates);
  const emptyConfig = path.join(profile, 'empty-git-config');
  fs.writeFileSync(emptyConfig, '');
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: directory,
      windowsHide: true,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig },
    });
  git('init', '-b', 'main', '--template=' + templates);
  for (const [key, value] of [
    ['user.name', 'Tutorial isolation test'],
    ['user.email', 'isolation@example.invalid'],
    ['commit.gpgSign', 'false'],
    ['core.autocrlf', 'false'],
    ['gc.auto', '0'],
    ['core.fsmonitor', 'false'],
    ['core.hooksPath', templates],
  ])
    git('config', '--local', key, value);
  fs.mkdirSync(path.join(directory, '.git/info'), { recursive: true });
  fs.writeFileSync(path.join(directory, '.git/info/attributes'), '* -filter -text\n');
  fs.writeFileSync(path.join(directory, privateFile), original);
  fs.writeFileSync(path.join(directory, 'staged.txt'), 'Original staged file.\n');
  git('add', '--', privateFile, 'staged.txt');
  git('commit', '-m', 'Isolated native test baseline');
  fs.writeFileSync(path.join(directory, 'staged.txt'), 'An actual staged change.\n');
  git('add', '--', 'staged.txt');
  return {
    directory,
    stored: { repos: [{ path: directory, pinned: false, lastOpened: Date.now(), createdAt: Date.now() }], activeRepo: directory, sortBy: 'lastOpenedDesc' },
  };
}

async function verify({ parent, getTutorial, launch, close, stepReady, click, waitFor, workspace, profile, languageIndex }) {
  const regular = parent.webContents;
  const run = (code) => regular.executeJavaScript(code);
  const key = (contents, keyCode, modifiers = []) => {
    contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  };
  parent.setSize(1200, 850);
  await waitFor(regular, 'document.querySelector("[data-tutorial=open-files]")');
  await run('document.querySelector("[data-tutorial=open-files]").click()');
  await waitFor(regular, 'document.querySelector(' + JSON.stringify(`[data-file-path="${privateFile}"]`) + ')');
  await run('document.querySelector(' + JSON.stringify(`[data-file-path="${privateFile}"]`) + ').click()');
  await waitFor(regular, 'document.querySelector(".cm-content[contenteditable=true]")');
  await run('document.querySelector("[data-tutorial=open-staging]").click()');
  await waitFor(regular, 'document.querySelector("[data-tutorial=commit-message]:not(:disabled)")');
  await run(
    `(()=>{for(const [id,value] of Object.entries(${JSON.stringify({ 'commit-message': message, 'commit-description': description })})){const field=document.querySelector('[data-tutorial="'+id+'"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));}})()`,
  );
  await run('document.querySelector(".cm-content").focus()');
  key(regular, 'A', ['control']);
  await regular.insertText(draft);
  await waitFor(regular, 'document.querySelector(' + JSON.stringify(`.file-viewer[data-path="${privateFile}"][data-dirty="true"]`) + ')');
  key(regular, 'Home', ['control']);
  key(regular, 'Right');
  key(regular, 'Right', ['shift']);
  await waitFor(regular, 'document.querySelector(' + JSON.stringify('.file-viewer[data-selection-from="1"][data-selection-to="2"]') + ')');
  await run(
    'window.tutorialIsolationNodes={viewer:document.querySelector(".file-viewer"),message:document.querySelector("[data-tutorial=commit-message]"),description:document.querySelector("[data-tutorial=commit-description]")}',
  );
  // The real startup restores the active repository after probing Git. Wait for
  // that acknowledged registry mutation, rather than comparing its pending write.
  let stored;
  for (let attempt = 0; attempt < 200; attempt++) {
    stored = await run('window.electronAPI.repos.getStoredRepos()');
    if (stored.revision > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(stored.revision > 0, 'The real workspace finished restoring its active repository.');
  const refs = ['.git/HEAD', '.git/refs/heads/main', '.git/index', privateFile, 'staged.txt'];
  const files = refs.map((file) => [file, fs.readFileSync(path.join(workspace.directory, file))]);
  const nativeViews = parent.contentView.children.length;
  async function preserved() {
    assert.equal(parent.contentView.children.length, nativeViews, 'The tutorial surface was removed from the real window.');
    assert.equal(await run('window.tutorialIsolationNodes.viewer===document.querySelector(".file-viewer")'), true, 'The real editor was never unmounted.');
    assert.equal(
      await run('window.tutorialIsolationNodes.message===document.querySelector("[data-tutorial=commit-message]")'),
      true,
      'The real commit form was never unmounted.',
    );
    assert.equal(await run('Array.from(document.querySelectorAll(".cm-content .cm-line"),line=>line.textContent).join("\\n")'), draft);
    assert.equal(await run('document.querySelector(".file-viewer").dataset.dirty'), 'true');
    assert.equal(await run('document.querySelector(".file-viewer").dataset.selectionFrom'), '1');
    assert.equal(await run('document.querySelector(".file-viewer").dataset.selectionTo'), '2');
    assert.equal(await run('document.querySelector("[data-tutorial=commit-message]").value'), message);
    assert.equal(await run('document.querySelector("[data-tutorial=commit-description]").value'), description);
    for (const [file, contents] of files)
      assert.deepEqual(fs.readFileSync(path.join(workspace.directory, file)), contents, 'No real repository write: ' + file);
    assert.deepEqual(await run('window.electronAPI.repos.getStoredRepos()'), stored, 'The real repository catalog is preserved.');
  }
  await preserved();
  await launch({ chapterId: 'tree-create', stepId: 'write' });
  const practice = getTutorial();
  assert.equal(await practice.executeJavaScript('document.body.innerText.includes(' + JSON.stringify(privateFile) + ')'), false);
  assert.equal(await practice.executeJavaScript('document.body.innerText.includes(' + JSON.stringify(message) + ')'), false);
  assert.equal(await practice.executeJavaScript('document.querySelector(".cm-content").textContent'), '');
  await practice.executeJavaScript('document.querySelector(".cm-content").focus()');
  await practice.insertText(require('../src/tutorial/fixtures/tree-files.json').created[languageIndex]);
  await stepReady('save');
  await click('[data-tutorial=save-file]:not(:disabled)');
  await stepReady('close');
  await close();
  await preserved();
  await launch({ chapterId: 'search-all', stepId: 'replace-all' });
  assert.equal(await getTutorial().executeJavaScript('document.body.innerText.includes(' + JSON.stringify(privateFile) + ')'), false);
  await click('[data-dialog-action=confirm]');
  await stepReady('no-matches');
  await close();
  await preserved();
  await launch({ chapterId: 'history-forensic-regex', stepId: 'run' });
  await getTutorial().executeJavaScript(
    `(()=>{const original=Worker.prototype.postMessage;Worker.prototype.postMessage=function(data,...rest){if(data?.pattern&&Array.isArray(data.records))window.tutorialWorkerPayload=JSON.stringify(data);return original.call(this,data,...rest);};})()`,
  );
  await click('[data-tutorial=forensic-run]');
  await stepReady('changed-lines');
  assert.equal(await getTutorial().executeJavaScript('window.tutorialWorkerPayload.includes("export const greeting")'), true);
  for (const secret of [privateFile, message, draft.trim()])
    assert.equal(
      await getTutorial().executeJavaScript('window.tutorialWorkerPayload.includes(' + JSON.stringify(secret) + ')'),
      false,
      'The worker only receives sample contents.',
    );
  await close();
  await preserved();
  await launch({ chapterId: 'tree-delete', stepId: 'delete-folder' });
  await click('[data-dialog-action=confirm]');
  await stepReady('folder-result');
  const crashed = getTutorial();
  crashed.forcefullyCrashRenderer();
  for (let attempt = 0; !crashed.isDestroyed() && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(crashed.isDestroyed());
  await waitFor(regular, 'document.querySelector(".action-toast.error")');
  await preserved();
  await launch({ chapterId: 'history-forensic-regex', stepId: 'run' });
  await getTutorial().executeJavaScript(
    `(()=>{const original=Worker.prototype.postMessage;Worker.prototype.postMessage=function(data,...rest){if(data?.pattern&&Array.isArray(data.records)){window.tutorialWorkerPending=true;return;}return original.call(this,data,...rest);};})()`,
  );
  await click('[data-tutorial=forensic-run]');
  await waitFor(getTutorial(), 'window.tutorialWorkerPending && document.querySelector(".forensic-search-panel[data-search-loading=true]")');
  const pendingWorkerCrash = getTutorial();
  pendingWorkerCrash.forcefullyCrashRenderer();
  for (let attempt = 0; !pendingWorkerCrash.isDestroyed() && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(pendingWorkerCrash.isDestroyed());
  await preserved();
  assert.equal(fs.readFileSync(path.join(workspace.directory, privateFile), 'utf8'), original, 'The editor draft remains unsaved on disk.');
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(profile, 'repos.json'), 'utf8')),
    stored,
    'The persisted catalog matches the original logical snapshot.',
  );
  console.log(
    'Native real editor/commit drafts, selection, index, HEAD, worktree and catalog isolation passed after close, renderer failure and a pending practice worker.',
  );
}
async function prepareShutdown(workspace, profile, fail) {
  const { gitService } = require('../dist-electron/electron/GitService.js');
  const runner = gitService.runner;
  const close = runner.close.bind(runner);
  let release, started;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const reading = new Promise((resolve) => {
    started = resolve;
  });
  // Hold a real accepted Git read until shutdown reaches the runner. The
  // native parent checks the receipt only after Electron has exited.
  const pending = runner.streamLines(workspace.directory, ['rev-parse', 'HEAD'], async (line) => {
    if (!line.trim()) return;
    started();
    await gate;
    await new Promise((resolve) => setImmediate(resolve));
    fs.writeFileSync(path.join(profile, 'shutdown-git-drained'), line.trim());
  });
  pending.catch(fail);
  runner.close = () => {
    release();
    return close();
  };
  await reading;
}
module.exports = { prepare, verify, prepareShutdown };
