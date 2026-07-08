# Contributing to Open-Git-Control

Language: **English** | Deutsche Version: [Docs/community/de/beitraege.md](Docs/community/de/beitraege.md)

Thank you for helping improve Open-Git-Control. This project welcomes bug reports, feature requests, questions, documentation improvements, tests, and focused code changes.

## How to Contribute

- Use the structured GitHub issue forms for bugs, feature requests, questions, and documentation reports.
- Search existing issues before opening a new one.
- Keep pull requests focused on one problem or feature.
- Do not report security vulnerabilities in public issues. Use GitHub private vulnerability reporting instead.

## Development Setup

Requirements:

- Git installed and available in `PATH`
- Node.js 20 and npm
- GitHub CLI (`gh`) only if you want to test the one-click GitHub login flow
- Ollama or a Gemini API key only if you want to test AI features

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run dev
```

Useful scripts:

| Script                   | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `npm run build:electron` | Compile Electron main/preload process              |
| `npm run build`          | Run TypeScript, Vite build, and Electron build     |
| `npm run test`           | Run unit tests                                     |
| `npm run test:coverage`  | Run tests with coverage gates                      |
| `npm run test:ci`        | Run the CI-style compile, coverage, and build flow |
| `npm run dist`           | Build a local package for the current platform     |

## Project Layout

- `src/` contains the React renderer, UI components, hooks, utilities, and renderer tests.
- `electron/` contains the Electron main process, preload bridge, Git/GitHub services, security logic, and main-process tests.
- `scripts/` contains release, README, and test helper scripts.
- `.github/workflows/` contains CI and release automation.
- `Docs/` contains screenshots used by the READMEs.

## Pull Request Workflow

1. Create a branch from the default branch.
2. Make the smallest useful change.
3. Add or update tests when behavior changes.
4. Update both English and German documentation when user-facing behavior or setup changes.
5. Run the relevant checks locally.
6. Open a pull request with the template filled out.

Commit messages should follow the style already used in the repository, for example:

- `feat(scope): add new behavior`
- `fix(scope): correct broken behavior`
- `docs(scope): update documentation`
- `test(scope): cover behavior`
- `chore(scope): maintain project setup`

## Testing Expectations

- For app behavior changes, run at least `npm run test` and any focused tests for the changed area.
- For changes touching shared Electron, Git, GitHub, security, parsing, or settings logic, run `npm run test:coverage` or `npm run test:ci` when practical.
- For documentation-only or GitHub-template changes, app tests are not required, but links and YAML syntax should be checked.
- If you cannot run a relevant check, explain that in the pull request.

## UI and Documentation Changes

- Match the existing UI style and interaction patterns.
- Include screenshots or short screen recordings for visible UI changes.
- Keep English and German documentation in sync for user-facing changes.
- Do not edit generated release download links by hand unless you are intentionally updating release documentation. The release workflow refreshes them.

## Security

Do not open public issues for vulnerabilities, leaked secrets, or bypasses in security-sensitive flows. Use GitHub private vulnerability reporting as described in [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contribution will be licensed under the same license as the project: GNU General Public License v3.0.
