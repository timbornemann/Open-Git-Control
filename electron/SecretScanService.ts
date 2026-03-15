import type { GitService } from './GitService';

export type SecretScanStrictness = 'low' | 'medium' | 'high';
export type SecretScanSource = 'staged' | 'to-push';
type SecretSeverity = 'medium' | 'high' | 'critical';

type PatternDefinition = {
  id: string;
  minStrictness: SecretScanStrictness;
  severity: SecretSeverity;
  regex: RegExp;
};

type ParsedAllowlistRule =
  | { kind: 'path'; value: string }
  | { kind: 'text'; value: string }
  | { kind: 'regex'; pattern: RegExp };

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
  };
}

const STRICTNESS_RANK: Record<SecretScanStrictness, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const DEFAULT_IGNORED_PATH_PARTS = [
  'node_modules/',
  'dist/',
  'coverage/',
  '.min.js',
  '.min.css',
  '.map',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

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

function shouldIgnorePath(filePath: string): boolean {
  const normalized = normalizePathForMatch(filePath);
  return DEFAULT_IGNORED_PATH_PARTS.some((segment) => normalized.includes(segment));
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

function isAllowlisted(
  findingCandidate: { filePath: string; line: string; ruleId: string },
  rules: ParsedAllowlistRule[],
): boolean {
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
      return (
        normalizedPath.includes(rule.value)
        || normalizedLine.includes(rule.value)
        || normalizedRuleId.includes(rule.value)
      );
    }
    return rule.pattern.test(findingCandidate.line) || rule.pattern.test(findingCandidate.filePath);
  });
}

function patternEnabledForStrictness(pattern: PatternDefinition, strictness: SecretScanStrictness): boolean {
  return STRICTNESS_RANK[pattern.minStrictness] <= STRICTNESS_RANK[strictness];
}

function sanitizeContextLine(line: string): string {
  const replacedQuotedValues = line.replace(
    /(["'])([^"'\\]{8,})(\1)/g,
    (_full, quote: string) => `${quote}[REDACTED]${quote}`,
  );

  return replacedQuotedValues
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,255}\b/g, '[REDACTED_TOKEN]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]')
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,255}\b/g, '[REDACTED_SLACK_TOKEN]');
}

function parseAddedLinesFromDiff(diff: string, source: SecretScanSource): DiffCandidateLine[] {
  const lines = (diff || '').split(/\r?\n/);
  const candidates: DiffCandidateLine[] = [];

  let currentFile = '';
  let currentNewLineNumber = 0;

  for (const rawLine of lines) {
    const line = rawLine || '';
    const diffFileMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffFileMatch) {
      currentFile = diffFileMatch[2] || diffFileMatch[1] || '';
      currentNewLineNumber = 0;
      continue;
    }

    const plusFileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (plusFileMatch) {
      currentFile = plusFileMatch[1] || currentFile;
      continue;
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentNewLineNumber = Number(hunkMatch[1]) || 0;
      continue;
    }

    if (!currentFile || currentNewLineNumber <= 0) {
      continue;
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      candidates.push({
        filePath: currentFile,
        lineNumber: currentNewLineNumber,
        line: line.slice(1),
        source,
      });
      currentNewLineNumber += 1;
      continue;
    }

    if (line.startsWith(' ')) {
      currentNewLineNumber += 1;
      continue;
    }
  }

  return candidates;
}

export class SecretScanService {
  constructor(private readonly gitService: GitService) {}

  async scanPushDiffs(options: { strictness: SecretScanStrictness; allowlistText: string }): Promise<SecretScanResult> {
    const strictness = options.strictness;
    const allowlistRules = parseAllowlist(options.allowlistText || '');
    const notes: string[] = [];

    const stagedDiff = await this.gitService.runCommand(['diff', '--cached', '--no-color', '--unified=0']);
    const stagedCandidates = parseAddedLinesFromDiff(stagedDiff, 'staged');

    let toPushCandidates: DiffCandidateLine[] = [];
    try {
      const upstreamRef = await this.gitService.runCommand(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
      if (upstreamRef) {
        const outgoingDiff = await this.gitService.runCommand(['diff', '--no-color', '--unified=0', `${upstreamRef}..HEAD`]);
        toPushCandidates = parseAddedLinesFromDiff(outgoingDiff, 'to-push');
      }
    } catch {
      notes.push('No upstream tracking branch available, to-push scan skipped.');
    }

    const allCandidates = [...stagedCandidates, ...toPushCandidates];
    const findings: SecretScanFinding[] = [];

    for (const candidate of allCandidates) {
      if (shouldIgnorePath(candidate.filePath)) {
        continue;
      }

      for (const pattern of SECRET_PATTERNS) {
        if (!patternEnabledForStrictness(pattern, strictness)) {
          continue;
        }

        if (!pattern.regex.test(candidate.line)) {
          continue;
        }

        if (
          isAllowlisted(
            { filePath: candidate.filePath, line: candidate.line, ruleId: pattern.id },
            allowlistRules,
          )
        ) {
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
    }

    return {
      scanned: true,
      strictness,
      findings,
      notes,
      stats: {
        checkedLines: allCandidates.length,
        stagedLines: stagedCandidates.length,
        toPushLines: toPushCandidates.length,
      },
    };
  }
}
