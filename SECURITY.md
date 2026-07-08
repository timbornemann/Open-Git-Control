# Security Policy

Language: **English** | Deutsche Version: [Docs/community/de/sicherheit.md](Docs/community/de/sicherheit.md)

Open-Git-Control handles local repositories, GitHub authentication, optional AI provider keys, release publishing flows, and local planning API tokens. Please report security issues privately.

## Supported Versions

Security fixes target the latest stable release and the default branch. Older releases may receive fixes only when the issue is severe and the fix can be applied safely.

## Reporting a Vulnerability

Do not open a public GitHub issue for security vulnerabilities, leaked secrets, token handling problems, local API bypasses, unsafe Git command execution, or similar issues.

Use GitHub private vulnerability reporting:

[Report a vulnerability privately](https://github.com/timbornemann/Open-Git-Control/security/advisories/new)

If that page is unavailable, use the repository Security tab and choose the private vulnerability reporting flow.

## What to Include

Please include:

- affected Open-Git-Control version or commit
- operating system
- clear reproduction steps
- expected and actual impact
- whether credentials, local files, repositories, or GitHub data may be exposed
- any relevant screenshots, logs, or proof-of-concept details

Avoid including real tokens, private repository contents, or third-party secrets in the report.

## Disclosure

Maintainers will review the report, ask follow-up questions if needed, and coordinate a fix before public disclosure. Please give the project reasonable time to investigate and release a fix before sharing details publicly.
