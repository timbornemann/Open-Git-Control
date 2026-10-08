# Hosting, accounts and Git endpoints

Open-Git-Control separates native Git transport from hosting APIs. The Hosting area supports GitHub (including Enterprise), Forgejo, GitLab.com and self-managed GitLab, Bitbucket Cloud, and Bitbucket Data Center. Several accounts and servers can stay connected at the same time. Other Git servers remain usable through their Git URLs.

## Connect an account

Open **Hosting → Accounts & servers → Add connection**. In the account dialog, choose a provider and enter the server URL, including any port or installation base path. Add a descriptive name to distinguish accounts on the same server. Expand **API address and browser sign-in** to override the API URL or configure your own OAuth application. Authenticate with a token or the configured browser login. Existing accounts can be edited from their connection rows.

Credentials are stored with Electron's OS encryption. If secure storage is unavailable, credentials remain in memory for this app session. Tokens and OAuth client secrets are never returned to the renderer after authentication. Account logout invalidates pending operations, refreshes, caches and Git credential sessions for that account.

| Provider              | Browser login configuration                                                                                                                          | Token / Git authentication                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| GitHub                | OAuth client ID with Device Flow enabled; enter the displayed code in the browser. `gh` login can also be imported after checking its username.      | PAT; GitHub account username for HTTPS Git.                                                                     |
| Forgejo               | Public OAuth application, registered loopback callback, PKCE S256.                                                                                   | Personal token; actual account username for Git.                                                                |
| GitLab                | Public OAuth application, exact registered callback, PKCE S256.                                                                                      | Personal token or OAuth token; `oauth2` username for Git OAuth.                                                 |
| Bitbucket Cloud       | Your own OAuth consumer key and secret with the configured callback.                                                                                 | Scoped API token; Git uses `x-bitbucket-api-token-auth`, OAuth uses `x-token-auth`. App passwords are obsolete. |
| Bitbucket Data Center | Administrator-created incoming application link and your own client credentials. HTTP desktop callbacks require an explicit administrator allowance. | Personal access token and account username; token login remains available when desktop OAuth is unavailable.    |

Grant only the features you intend to use. Repository reading, writing, change requests, CI and releases can require separate scopes. Bitbucket Cloud catalog discovery requires workspace access in addition to account and repository reading (`read:workspace:bitbucket`, `read:user:bitbucket`, `read:repository:bitbucket` for API tokens; `account` and `repository` for OAuth). OAuth client secrets are supplied locally by the user; the application distributes no shared secret.

For HTTPS transfers, a temporary Git credential helper asks a Main-process broker for credentials bound to the selected account and endpoint. Credentials are neither written into remote URLs nor passed as Git command arguments. SSH URLs and existing system credentials remain usable. Configure SSH aliases by manually binding the actual remote URL to a repository web URL in **Remote configuration**.

## Browse repositories

The **Repositories** catalog uses compact rows with provider/account identity, visibility, branch and matching local clones. Search and filter by provider or account, pin repositories, and load additional catalog pages. **New repository** and **Open repository by URL** open account-specific dialogs.

Opening a repository shows its own full-width detail page with **Overview**, provider-specific **Pull Requests / Merge Requests**, **CI** and **Releases / Tags** sections. The catalog is replaced while viewing details. **All repositories** returns to the same search, filters, pins and scroll position. The overview shows the server, account, clone URLs and local clones; PRs/MRs, CI and publication continue to use the explicitly selected repository and account.

## Repositories with several endpoints

Use **Publish repository** to create an empty hosting repository, add a separate account-bound remote and upload selected local branches and tags through a guided workflow. Existing defaults stay intact unless explicitly replaced. Interrupted setup can be resumed without creating another repository. See [the repository publication assistant](REPOSITORY_PUBLICATION.md).

Add backup servers as separate named remotes, for example `forgejo` and `github-backup`. Existing multiple `pushurl` values are preserved and shown. Fetch URLs and push URLs are managed separately. Repository paths and IDs belong to their connection; equal names or numeric IDs on different servers do not refer to the same repository.

Each local repository has independent selections:

1. **Fetch and pull sources:** separate source selections. Pull uses one remote and one branch. A one-time pull does not change tracking. Use **Set as upstream** to change it explicitly.
2. **Push targets:** select remotes, optional target branches, and explicit tags. Save the selection as a push profile. Backup pushes leave upstream tracking intact.
3. **Hosting target:** select the account and repository used for PRs/MRs, CI and releases. Ambiguous accounts and SSH aliases require an explicit binding.

With one remote, normal Push, Pull and Fetch start directly. With several remotes, the first manual operation asks for its source or destinations and whether to **Save and run** or **Ask every time**. These modes are independent for Fetch, Pull and Push and belong to the local repository. Changed URLs, removed destinations or changed account bindings require a new selection. Ordinary pushes include no tags; use the explicit tag action to publish tags. Force-with-lease and secret-scan findings still require approval.

Open **Remote configuration** from the repository actions menu, local repository context menu or command palette. Edit sources, branch mappings, push profiles, selection modes, remote URLs and hosting/credential bindings there. Preferences are applied with **Save**; unsaved drafts stay separate for each repository during the app session. Opening or saving this page never starts a transfer. Settings are local to the app and are not written into a versioned repository file.

The page explains the current destinations for Fetch, Pull and Push. With a single remote, these are automatic and need no setup. Branch mappings, profiles and hosting credentials are optional expandable sections. With several remotes, **Use saved selection** also saves the displayed default source or checked push targets. Changes to remote names and URLs apply immediately; selection and account preferences apply on **Save**.

Pull uses the selected source's tracking branch when applicable, otherwise the current branch name. Explicitly different destination branches belong to their local branch, so changing branches does not reuse an unrelated fixed target. Automatic background Fetch never asks: it uses a valid remembered Fetch source, or the existing Git default when the mode is Ask every time or no decision exists. An invalid remembered source pauses background Fetch until corrected.

Before every push the immutable plan captures the source commit, selected tags, destination refs, endpoint configuration and account generations. Normal pushes proceed after the configured secret checks without another summary confirmation. Targets execute sequentially. A failed server does not prevent other selected targets from running; cancellation or a changed context stops the remaining targets. Results show partial success. Retry checks actual endpoint refs and addresses unsuccessful targets only. Successful pushes are never rolled back. Force-with-lease checks each endpoint's own expected commit. Secret-scan approval belongs to the full reviewed plan.

An incomplete secret scan blocks execution and offers **Retry check** with expandable check details. Retrying an initial scan prepares and checks a fresh immutable plan; retrying an incomplete check of a failed push keeps that push's original plan and unsuccessful targets.

Secret checks query the current advertised branches and tags at **every selected push URL**, using that endpoint's account. Local tracking refs never establish the scan baseline. All missing commits reachable from the captured branch and explicitly selected tags are inspected, including intermediate commits that introduce and later remove a secret. Commits shared by several destinations or tags are checked once. A synchronized push skips history inspection; staged changes retain their existing check. The notification reports the actual commit count and progress.

If the endpoint cannot be queried, its advertisement is invalid, or required remote objects are unavailable locally, the check falls back to the captured source's full history and reports the reason in the notification and check details. Fetching that endpoint can make the objects available for subsequent incremental checks. An incomplete shallow history cannot be approved as a complete scan. Remote baselines are checked again before approving or executing the push; a changed baseline, repository, branch, remote configuration or account invalidates the check. These reads do not update tracking refs, tags or upstream settings. Reachability follows [Git's revision traversal](https://git-scm.com/docs/git-rev-list) using [fresh remote advertisements](https://git-scm.com/docs/git-ls-remote).

Git installations supporting process-local `pushurl` reset allow individual destinations of an existing multi-URL remote to be addressed while retaining its remote name and hooks. The app probes this capability without changing Git configuration. Older Git versions can perform normal grouped pushes followed by per-endpoint verification; targeted retries and force pushes require separate named remotes. A group using several explicitly selected hosting accounts also requires separate named remotes on those Git versions. SSH and system credentials remain available for grouped pushes.

## Feature differences

| Provider              | CI                                                                                                                                                                                     | Publication                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| GitHub                | Actions, jobs, steps, logs, artifacts, dispatch, cancellation, rerun.                                                                                                                  | Native releases, drafts, prereleases, assets.                            |
| Forgejo 15            | Actions runs and manual dispatch; additional CI details link to the website.                                                                                                           | Native releases, drafts, prereleases, assets.                            |
| Forgejo 16            | Adds jobs, logs, artifacts and cancellation. The public API has no rerun operation.                                                                                                    | Native releases, drafts, prereleases, assets.                            |
| GitLab                | Pipelines, jobs, traces, artifacts, dispatch, cancellation, retry. `job:<id>` starts an existing manual job; a pipeline start creates a new pipeline. Inputs are sent as CI variables. | Releases and asset links. Draft and prerelease fields are unavailable.   |
| Bitbucket Cloud       | Pipelines, steps, logs, start and stop. A new start is a new run. Artifacts are accessed through the provider website.                                                                 | Tags and separate Downloads files; native releases are unavailable.      |
| Bitbucket Data Center | External build statuses and build links. CI controls require a separate CI-system connector.                                                                                           | Tags and local release notes; native release publication is unavailable. |

Unavailable APIs, disabled CI, missing permissions and unreachable servers are reported separately. Lists support pagination. Logs are rendered as bounded plain text; large logs link back to the provider. Artifact and asset transfers have a 512 MiB limit. Merge methods follow repository/server configuration, and a merge checks the reviewed head SHA (and Data Center's version).

**Start a new run** offers workflow suggestions from a matching local clone, with the configured name and source file in a dropdown. Saved inactive clones can be read without switching repositories. GitHub reads manually dispatchable YAML in `.github/workflows`. Forgejo prefers `.forgejo/workflows` and falls back to the GitHub directory only when the Forgejo directory is absent. Bitbucket Cloud reads custom selectors and the default pipeline in `bitbucket-pipelines.yml`. GitLab offers the pipeline from `.gitlab-ci.yml`; local job names are not remote job IDs. **Enter manually** remains available, and **Refresh local workflows** picks up file changes without closing the form or replacing a manual draft. The chosen configuration must also exist on the selected ref at the provider. Detection stays local, does not follow includes or linked files, and bounds YAML sizes and alias expansion; unreadable files are reported through notifications.

**Release** in the local repository opens the full creator as a repository subpage. Hosting uses the same creator through **Create release** and activates a selected local clone first. The creator offers version suggestions, target revision, AI options, Markdown notes, commit history and supported release/asset options. Drafts remain session-local and are separated by local repository, account, namespace and endpoint.

Release context uses tags from the selected endpoint, including their actual remote OIDs; same-named local tags from backups do not replace the notes baseline. Missing historical bases produce a bounded recent-commit view with a warning; connection or permission failures stay errors. Release inspection verifies only the selected endpoint. Publish its already available commit, or confirm **Push and create release** to transfer the captured release branch without checking it out and inspect again. Release transfers keep their explicit destination and do not use a general backup profile. Local or remote tags pointing to another commit block publication. Uploads start after release creation; the created release and each file's state remain visible when an upload fails, and retry uploads only pending files. GitLab uploads become release asset links; Bitbucket Downloads are separate files. AI release notes and local Markdown export are available regardless of native release support.

## Migration and project services

Remote preferences migrate atomically to version 2. Existing sources, push profiles and account bindings remain available as suggestions; several remotes require an explicit selection mode before normal transfers can start directly. Git configuration is preserved.

Migration imports legacy GitHub credentials and settings into a versioned hosting connection. A legacy token without a host is assigned only to GitHub.com. Catalogs and pins are matched to the verified server/account identity. Existing Git configuration is not rewritten. App updates and Open-Git-Control feedback remain attached to this project's GitHub.com repository, independently of the active hosting target. The local Planning API gains no hosting or Git write permissions.

## API references

- [GitHub Actions](https://docs.github.com/en/rest/actions/workflow-runs)
- [Forgejo 16](https://forgejo.org/2026-07-release-v16-0/) and [OAuth](https://forgejo.org/docs/latest/user/authentication/oauth2-provider/)
- [GitLab pipelines](https://docs.gitlab.com/api/pipelines/), [jobs](https://docs.gitlab.com/api/jobs/), [releases](https://docs.gitlab.com/api/releases/), [OAuth](https://docs.gitlab.com/api/oauth2/)
- [Bitbucket Cloud pipelines](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-pipelines/), [downloads](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-downloads/), [OAuth](https://developer.atlassian.com/cloud/bitbucket/rest/intro/)
- [Bitbucket Data Center CI](https://confluence.atlassian.com/bitbucketserver104/integrated-ci-cd-1822592123.html) and [OAuth](https://confluence.atlassian.com/bitbucketserver/bitbucket-oauth-2-0-provider-api-1108483661.html)
- [Git remotes](https://git-scm.com/docs/git-remote)
