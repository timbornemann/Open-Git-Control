import type { GitService } from './GitService';

export type SecretScanStrictness = 'low' | 'medium' | 'high';
export type SecretScanSource = 'staged' | 'to-push' | 'tag';
type SecretSeverity = 'medium' | 'high' | 'critical';

type PatternDefinition = {
  id: string;
  minStrictness: SecretScanStrictness;
  severity: SecretSeverity;
  regex: RegExp;
};

type ParsedAllowlistRule = { kind: 'path'; value: string } | { kind: 'text'; value: string } | { kind: 'regex'; pattern: RegExp };

type DiffCandidateLine = {
  filePath: string;
  lineNumber: number;
  line: string;
  source: SecretScanSource;
};

export interface SecretScanFinding {
  id: string;
  ruleId: string;
  severity: SecretSeverity;
  source: SecretScanSource;
  filePath: string;
  lineNumber: number;
  contextLine: string;
}

export interface SecretScanResult {
  scanned: boolean;
  strictness: SecretScanStrictness;
  findings: SecretScanFinding[];
  notes: string[];
  stats: {
    checkedLines: number;
    stagedLines: number;
    toPushLines: number;
    tagLines: number;
  };
}

const STRICTNESS_RANK: Record<SecretScanStrictness, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const SECRET_PATTERNS: PatternDefinition[] = [
  {
    id: 'aws-access-key-id',
    minStrictness: 'low',
    severity: 'critical',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    id: 'github-token',
    minStrictness: 'low',
    severity: 'critical',
    regex: /\bgh[pousr]_[A-Za-z0-9_]{20,255}\b/,
  },
  {
    id: 'slack-token',
    minStrictness: 'low',
    severity: 'critical',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,255}\b/,
  },
  {
    id: 'stripe-live-key',
    minStrictness: 'low',
    severity: 'high',
    regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/,
  },
  {
    id: 'private-key-block',
    minStrictness: 'low',
    severity: 'critical',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    id: 'jwt-token',
    minStrictness: 'medium',
    severity: 'high',
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  },
  {
    id: 'credential-assignment',
    minStrictness: 'medium',
    severity: 'high',
    regex: /\b(?:api[_-]?key|secret|token|password|passwd|private[_-]?key)\b\s*[:=]\s*["'][^"']{12,}["']/i,
  },
  {
    id: 'high-entropy-assignment',
    minStrictness: 'high',
    severity: 'medium',
    regex: /\b(?:api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*["'][A-Za-z0-9+/_=-]{20,}["']/i,
  },
];

function normalizePathForMatch(filePath: string): string {
  return (filePath || '').replace(/\\/g, '/').toLowerCase();
}

function parseAllowlist(rawAllowlist: string): ParsedAllowlistRule[] {
  if (!rawAllowlist || !rawAllowlist.trim()) {
    return [];
  }

  const rules: ParsedAllowlistRule[] = [];
  const lines = rawAllowlist.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (trimmed.startsWith('path:')) {
      const value = trimmed.slice(5).trim();
      if (value) {
        rules.push({ kind: 'path', value: normalizePathForMatch(value) });
      }
      continue;
    }

    if (trimmed.startsWith('regex:')) {
      const value = trimmed.slice(6).trim();
      if (!value) {
        continue;
      }
      try {
        rules.push({ kind: 'regex', pattern: new RegExp(value, 'i') });
      } catch {
        // Ignore malformed allowlist regex entries.
      }
      continue;
    }

    rules.push({ kind: 'text', value: trimmed.toLowerCase() });
  }

  return rules;
}

function isAllowlisted(findingCandidate: { filePath: string; line: string; ruleId: string }, rules: ParsedAllowlistRule[]): boolean {
  if (rules.length === 0) {
    return false;
  }

  const normalizedPath = normalizePathForMatch(findingCandidate.filePath);
  const normalizedLine = findingCandidate.line.toLowerCase();
  const normalizedRuleId = findingCandidate.ruleId.toLowerCase();

  return rules.some((rule) => {
    if (rule.kind === 'path') {
      return normalizedPath.includes(rule.value);
    }
    if (rule.kind === 'text') {
      return normalizedPath.includes(rule.value) || normalizedLine.includes(rule.value) || normalizedRuleId.includes(rule.value);
    }
    return rule.pattern.test(findingCandidate.line) || rule.pattern.test(findingCandidate.filePath);
  });
}

function patternEnabledForStrictness(pattern: PatternDefinition, strictness: SecretScanStrictness): boolean {
  return STRICTNESS_RANK[pattern.minStrictness] <= STRICTNESS_RANK[strictness];
}

function sanitizeContextLine(line: string): string {
  const replacedQuotedValues = line.replace(/(["'])([^"'\\]{8,})(\1)/g, (_full, quote: string) => `${quote}[REDACTED]${quote}`);
  return SECRET_PATTERNS.reduce((sanitized, pattern) => {
    const flags = `${pattern.regex.flags.replace('g', '')}g`;
    return sanitized.replace(new RegExp(pattern.regex.source, flags), '[REDACTED_SECRET]');
  }, replacedQuotedValues);
}

function decodeGitQuotedPath(rawPath: string): string | null {
  const value = rawPath.trim();
  if (!value) return null;
  if (!(value.startsWith('"') && value.endsWith('"'))) return value;

  const escaped = value.slice(1, -1);
  const bytes: number[] = [];
  let decoded = '';
  const flushBytes = () => {
    if (bytes.length === 0) return;
    decoded += Buffer.from(bytes).toString('utf8');
    bytes.length = 0;
  };

  for (let index = 0; index < escaped.length; index += 1) {
    const char = escaped[index];
    if (char !== '\\') {
      flushBytes();
      decoded += char;
      continue;
    }

    const next = escaped[index + 1];
    if (!next) return null;
    if (/[0-7]/.test(next)) {
      const octal = escaped.slice(index + 1, index + 4);
      if (!/^[0-7]{3}$/.test(octal)) return null;
      bytes.push(Number.parseInt(octal, 8));
      index += 3;
      continue;
    }

    flushBytes();
    const escapes: Record<string, string> = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"' };
    decoded += escapes[next] ?? next;
    index += 1;
  }
  flushBytes();
  return decoded;
}

function parsePatchTargetPath(line: string): string | null {
  const match = line.match(/^\+\+\+\s+(.+)$/);
  if (!match) return null;
  const decoded = decodeGitQuotedPath(match[1]);
  if (!decoded || decoded === '/dev/null') return null;
  return decoded.startsWith('b/') ? decoded.slice(2) : decoded;
}

function normalizeSecretScanRevision(value: unknown, label: string): string {
  const revision = String(value || '').trim();
  if (!revision || revision.length > 255 || revision.startsWith('-') || /[\0\r\n]/.test(revision)) {
    throw new Error(`Invalid ${label} for secret scan.`);
  }
  return revision;
}

function normalizeSecretScanRemote(value: unknown): string | undefined {
  const remote = String(value || '').trim();
  if (!remote) return undefined;
  if (remote.length > 512 || remote.startsWith('-') || /[\0\r\n]/.test(remote)) {
    throw new Error('Invalid push destination remote for secret scan.');
  }
  return remote;
}

export class SecretScanService {
  constructor(private readonly gitService: GitService) {}

  async scanPushDiffs(options: {
    repoPath: string;
    strictness: SecretScanStrictness;
    allowlistText: string;
    signal?: AbortSignal;
    onProgress?: (checkedLines: number) => void;
    includeTags?: boolean;
    revisions?: string[];
    excludeRemote?: string;
  }): Promise<SecretScanResult> {
    const strictness = options.strictness;
    const allowlistRules = parseAllowlist(options.allowlistText || '');
    const notes: string[] = [];
    const findings: SecretScanFinding[] = [];
    let stagedLines = 0;
    let toPushLines = 0;
    let tagLines = 0;
    let findingLimitNoted = false;

    const scanCandidate = (candidate: DiffCandidateLine) => {
      if (options.signal?.aborted) return;
      if (candidate.source === 'staged') stagedLines += 1;
      else if (candidate.source === 'tag') tagLines += 1;
      else toPushLines += 1;
      const checkedLines = stagedLines + toPushLines + tagLines;
      if (checkedLines % 250 === 0) options.onProgress?.(checkedLines);
      for (const pattern of SECRET_PATTERNS) {
        if (!patternEnabledForStrictness(pattern, strictness)) continue;
        if (!pattern.regex.test(candidate.line)) continue;
        if (isAllowlisted({ filePath: candidate.filePath, line: candidate.line, ruleId: pattern.id }, allowlistRules)) continue;
        if (findings.length >= 1000) {
          if (!findingLimitNoted) {
            notes.push('Secret scan finding limit reached (1000); additional findings were omitted.');
            findingLimitNoted = true;
          }
          continue;
        }
        findings.push({
          id: `${candidate.source}:${candidate.filePath}:${candidate.lineNumber}:${pattern.id}:${findings.length + 1}`,
          ruleId: pattern.id,
          severity: pattern.severity,
          source: candidate.source,
          filePath: candidate.filePath,
          lineNumber: candidate.lineNumber,
          contextLine: sanitizeContextLine(candidate.line),
        });
      }
    };

    const streamDiff = async (args: string[], source: SecretScanSource) => {
      let currentFile = '';
      let currentNewLineNumber = 0;
      await this.gitService.streamCommandLinesAtPath(
        options.repoPath,
        args,
        (line) => {
          if (line.startsWith('diff --git ')) {
            // Never retain the prior file for a malformed or quoted header.
            // The following +++ line provides the authoritative target path.
            currentFile = '';
            currentNewLineNumber = 0;
            return;
          }
          const patchTargetPath = parsePatchTargetPath(line);
          if (patchTargetPath !== null) {
            currentFile = patchTargetPath;
            return;
          }
          const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
          if (hunkMatch) {
            currentNewLineNumber = Number(hunkMatch[1]) || 0;
            return;
          }
          if (!currentFile || currentNewLineNumber <= 0) return;
          if (line.startsWith('+') && !line.startsWith('+++')) {
            scanCandidate({
              filePath: currentFile,
              lineNumber: currentNewLineNumber,
              line: line.slice(1),
              source,
            });
            currentNewLineNumber += 1;
            return;
          }
          if (line.startsWith(' ')) currentNewLineNumber += 1;
        },
        options.signal,
      );
    };

    const scanCommits = async (commits: string[], source: SecretScanSource) => {
      for (const commitHash of commits) {
        if (options.signal?.aborted) {
          const aborted = new Error('Secret scan was aborted.');
          aborted.name = 'AbortError';
          throw aborted;
        }
        await streamDiff(
          ['show', '--format=', '--no-ext-diff', '--no-textconv', '--no-color', '--unified=0', '--find-renames', '--find-copies', commitHash],
          source,
        );
      }
    };

    const parseCommitList = (raw: string) =>
      raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(line));

    const normalizeRequestedRevisions = (revisions: string[] | undefined): string[] =>
      [...new Set((revisions || []).map((revision) => String(revision || '').trim()).filter(Boolean))].map((revision) =>
        normalizeSecretScanRevision(revision, 'push source revision'),
      );

    const excludedRemote = normalizeSecretScanRemote(options.excludeRemote);
    const remoteExclusionArg = excludedRemote ? `--remotes=${excludedRemote}` : '--remotes';

    const scanRequestedRevisions = async (revisions: string[]) => {
      for (const revision of revisions) {
        const commitsRaw = await this.gitService.runCommandAtPath(options.repoPath, [
          'rev-list',
          '--reverse',
          '--topo-order',
          revision,
          '--not',
          remoteExclusionArg,
        ]);
        const commits = parseCommitList(commitsRaw);
        await scanCommits(commits, 'to-push');
        notes.push(
          commits.length > 0
            ? `Scanned ${commits.length} commit(s) from requested push source ${revision}.`
            : `No unpublished commits found for requested push source ${revision}.`,
        );
      }
    };

    await streamDiff(['diff', '--cached', '--no-ext-diff', '--no-textconv', '--no-color', '--unified=0'], 'staged');
    const requestedRevisions = normalizeRequestedRevisions(options.revisions);
    if (requestedRevisions.length > 0) {
      try {
        await scanRequestedRevisions(requestedRevisions);
      } catch (error) {
        if (options.signal?.aborted || (error as any)?.name === 'AbortError') throw error;
        throw new Error('Could not determine commits for the requested push source in the secret scan.');
      }
    } else {
      try {
        const upstreamRefRaw = await this.gitService.runCommandAtPath(options.repoPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
        const upstreamRef = normalizeSecretScanRevision(upstreamRefRaw, 'upstream revision');
        if (upstreamRef) {
          const commitsRaw = await this.gitService.runCommandAtPath(options.repoPath, ['rev-list', '--reverse', '--topo-order', `${upstreamRef}..HEAD`]);
          const commits = parseCommitList(commitsRaw);
          await scanCommits(commits, 'to-push');
          notes.push(commits.length > 0 ? `Scanned ${commits.length} commit(s) ahead of ${upstreamRef}.` : `No commits found ahead of ${upstreamRef}.`);
        }
      } catch (error) {
        if (options.signal?.aborted || (error as any)?.name === 'AbortError') throw error;
        try {
          await scanRequestedRevisions(['HEAD']);
        } catch (fallbackError) {
          if (options.signal?.aborted || (fallbackError as any)?.name === 'AbortError') throw fallbackError;
          throw new Error('Could not determine commits that would be pushed for the secret scan.');
        }
      }
    }

    if (options.includeTags) {
      try {
        const tagOnlyCommitsRaw = await this.gitService.runCommandAtPath(options.repoPath, [
          'rev-list',
          '--reverse',
          '--topo-order',
          '--tags',
          '--not',
          remoteExclusionArg,
        ]);
        const tagOnlyCommits = parseCommitList(tagOnlyCommitsRaw);
        await scanCommits(tagOnlyCommits, 'tag');

        if (tagOnlyCommits.length > 0) {
          notes.push(`Tag scan checked ${tagOnlyCommits.length} commit(s) reachable from local tags but not remote refs.`);
        }
      } catch (error) {
        if (options.signal?.aborted || (error as any)?.name === 'AbortError') throw error;
        throw new Error('Could not determine tag commits that would be pushed for the secret scan.');
      }
    }

    options.onProgress?.(stagedLines + toPushLines + tagLines);

    return {
      scanned: true,
      strictness,
      findings,
      notes,
      stats: {
        checkedLines: stagedLines + toPushLines + tagLines,
        stagedLines,
        toPushLines,
        tagLines,
      },
    };
  }
}
