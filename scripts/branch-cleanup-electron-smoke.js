const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/** Exercise the real sidebar, preload, main-process plan and confirmation against the isolated smoke-test repository. */
async function verifyBranchCleanup(window, profile, applicationPath, captureReadyPage) {
  const { GitRunner } = require(path.join(applicationPath, 'dist-electron/electron/git/GitRunner.js'));
  const git = new GitRunner();
  const repo = path.join(profile, 'repository');
  const branch = `cleanup-smoke-${process.pid}`;
  await git.run(repo, ['branch', branch]);
  const waitFor = async (expression) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (await window.webContents.executeJavaScript(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const details = await window.webContents.executeJavaScript(
      'document.querySelector(".branch-cleanup-dialog")?.textContent || document.body.textContent.slice(-1200)',
    );
    throw new Error('Native branch cleanup did not reach its expected state: ' + details);
  };
  const preferences = await window.webContents.executeJavaScript(`window.electronAPI.git.getBranchCleanupPreferences(${JSON.stringify(repo)})`);
  assert.ok(preferences.success && preferences.data.protectedPatterns.includes('main'));
  await waitFor(`Boolean(document.querySelector('button[aria-label="Branch actions"]'))`);
  await window.webContents.executeJavaScript(`(document.querySelector('button[aria-label="Branch actions"]').click(), true)`);
  await waitFor('Boolean(document.querySelector(".sidebar-actions-menu [role=menuitem]"))');
  assert.ok(await window.webContents.executeJavaScript('!document.querySelector(".branch-cleanup-dialog")'), 'Opening the menu must not start cleanup.');
  await window.webContents.executeJavaScript('(document.querySelector(".sidebar-actions-menu [role=menuitem]").click(), true)');
  await waitFor('Boolean(document.querySelector(".branch-cleanup-candidate")) && !document.querySelector(".branch-cleanup-progress")');
  const selected = await window.webContents.executeJavaScript(`(() => {
    const rows = [...document.querySelectorAll('.branch-cleanup-candidate')];
    const candidate = rows.find(row => row.querySelector('strong').textContent === ${JSON.stringify(branch)});
    const main = rows.find(row => row.querySelector('strong').textContent === 'main');
    return Boolean(candidate?.querySelector('input').checked && main?.querySelector('input').disabled);
  })()`);
  assert.ok(selected, 'The temporary merged branch is preselected and main is blocked.');
  const screenshotDirectory = process.env.OGC_STARTUP_TEST_SCREENSHOT_DIR;
  if (screenshotDirectory) {
    assert.ok(path.isAbsolute(screenshotDirectory));
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    fs.writeFileSync(path.join(screenshotDirectory, 'branch-cleanup.png'), (await captureReadyPage(window)).toPNG());
  }
  assert.ok((await git.run(repo, ['for-each-ref', '--format=%(refname)', `refs/heads/${branch}`])).trim(), 'Inspection must leave the branch intact.');
  await window.webContents.executeJavaScript('(document.querySelector(".dialog-footer .dialog-btn-danger").click(), true)');
  await waitFor('Boolean(document.querySelector(".branch-cleanup-results .deleted")) && !document.querySelector(".branch-cleanup-progress")');
  assert.equal((await git.run(repo, ['for-each-ref', '--format=%(refname)', `refs/heads/${branch}`])).trim(), '');
  await window.webContents.executeJavaScript(
    '([...document.querySelectorAll(".dialog-footer button")].find(button => button.textContent === "Done").click(), true)',
  );
  await waitFor('!document.querySelector(".branch-cleanup-dialog")');
  console.log('Native branch cleanup menu, protected main, snapshot review and confirmed deletion passed.');
}

module.exports = { verifyBranchCleanup };
