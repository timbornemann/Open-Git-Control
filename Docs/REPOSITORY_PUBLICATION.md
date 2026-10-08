# Publish an existing local repository

Open **Publish repository** in the repository sidebar, Hosting section, repository actions, local repository context menu, Remote configuration, or command palette. The Hosting workspace offers the same assistant for the active local repository. It opens a repository subpage and preserves the sidebar. Unsaved file-editor changes use the existing navigation guard.

## Three steps

1. **Hosting target:** choose the provider, server and authenticated account. Choose your personal account or organization on GitHub/Forgejo, a namespace or subgroup on GitLab, a workspace **and explicit project** on Bitbucket Cloud, or an existing Data Center project. More pages can be loaded. A manually entered target identifier is checked through the provider before creation. The local folder name is suggested; visibility starts private.
2. **Connection & content:** choose an unused remote name and transport. HTTPS with the selected app account is the default; HTTPS with system credentials and SSH keys are alternatives. The current branch and its history are selected. Expand the additional selection to publish other branches, different destination branch names, or specific tags. Uncommitted files are listed but are not included: commit them through Staging first.
3. **Publish:** review the captured commits, branches, tags, visibility and endpoint, then choose **Create and publish**. The server repository is created empty. The existing secure transfer workflow performs secret scanning, LFS uploads and credential handling. There is no force-push in the assistant.

With no existing remotes, the assistant suggests `origin`. After verified upload, the new connection becomes the Hosting/Fetch/Pull/Push default and published branches receive tracking. With existing remotes, an unused provider name is suggested and previous defaults and tracking are preserved. **Use as new primary target** is an explicit, initially unchecked option.

An unborn repository can use **Create and connect** without uploading. Create its first commit in Staging, reopen the assistant, choose **Resume setup**, review the branch, then continue. A detached HEAD requires selecting a local branch. Selection does not check out a different branch.

## Recovery and state

Completed creation, connection, upload and final setup are recorded atomically in `repository-publications.json` in the app's local user-data directory, without credentials. Pending operations appear in the assistant after reopening or restarting. Resume uses the already-created repository. Successful uploads are inspected at the selected endpoint before retrying; the transfer system retries only missing or unsuccessful refs. A failure to set the server default branch or tracking leaves setup pending instead of recreating or uploading again.

If a create request had an unknown outcome, the app first checks the server. An existing repository at that name requires explicit identity confirmation; an absent repository permits an explicit checked retry. A pre-existing name during ordinary creation is a conflict and is never automatically adopted. Cancelling preserves already completed steps. Existing remotes are never overwritten, and created server repositories and published commits are not rolled back after a later error.

Changes to the repository, account, selected refs or remote configuration stop continuation and require a new review. Form drafts stay separate by local repository and hosting account during the app session. Going back never publishes. On completion, the page shows the repository link and offers a fresh publication.

Pure server-side creation remains available through **Hosting → New repository**. This uses the same verified target selection, including explicit Bitbucket Cloud projects, without connecting or uploading a local repository. The local Planning API has no publication permissions.
