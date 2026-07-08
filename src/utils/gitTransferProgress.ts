export type GitTransferPhaseKey = 'enumerating' | 'counting' | 'compressing' | 'receiving' | 'resolving' | 'writing' | 'updating' | 'checkingOut';

export type GitTransferPhaseState = 'pending' | 'active' | 'done';

export type GitTransferPhaseProgress = {
  key: GitTransferPhaseKey;
  percent: number | null;
  current: number | null;
  total: number | null;
  amount: string | null;
  speed: string | null;
  detail: string | null;
  done: boolean;
  latestLine: string;
  observed: boolean;
  state: GitTransferPhaseState;
};

export type GitTransferProgressSummary = {
  phases: GitTransferPhaseProgress[];
  activePhase: GitTransferPhaseProgress | null;
  latestLine: string | null;
  latestDiagnostic: string | null;
  hasObservedProgress: boolean;
};

const PHASE_ORDER: GitTransferPhaseKey[] = ['enumerating', 'counting', 'compressing', 'receiving', 'resolving', 'writing', 'updating', 'checkingOut'];

const DEFAULT_VISIBLE_PHASES: GitTransferPhaseKey[] = ['receiving', 'resolving'];

const PHASE_LABELS: Array<{ key: GitTransferPhaseKey; pattern: RegExp }> = [
  { key: 'enumerating', pattern: /^enumerating objects$/i },
  { key: 'counting', pattern: /^counting objects$/i },
  { key: 'compressing', pattern: /^compressing objects$/i },
  { key: 'receiving', pattern: /^receiving objects$/i },
  { key: 'resolving', pattern: /^resolving deltas$/i },
  { key: 'writing', pattern: /^writing objects$/i },
  { key: 'updating', pattern: /^updating files$/i },
  { key: 'checkingOut', pattern: /^checking out files$/i },
];

const findPhaseKey = (label: string): GitTransferPhaseKey | null => {
  const normalized = label.trim();
  const match = PHASE_LABELS.find((entry) => entry.pattern.test(normalized));
  return match?.key ?? null;
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const createEmptyPhase = (key: GitTransferPhaseKey): GitTransferPhaseProgress => ({
  key,
  percent: null,
  current: null,
  total: null,
  amount: null,
  speed: null,
  detail: null,
  done: false,
  latestLine: '',
  observed: false,
  state: 'pending',
});

export const parseGitTransferProgressLine = (line: string): GitTransferPhaseProgress | null => {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;

  const withoutRemote = trimmed.replace(/^remote:\s*/i, '').trim();
  const phaseMatch = withoutRemote.match(/^([a-z][a-z ]+):\s*(.+)$/i);
  if (!phaseMatch) return null;

  const key = findPhaseKey(phaseMatch[1]);
  if (!key) return null;

  const detail = phaseMatch[2].trim();
  const percentMatch = detail.match(/(\d{1,3})%/);
  const countMatch = detail.match(/\((\d+)\/(\d+)\)/);
  const transferMatch = detail.match(/,\s*([^,|]+?\s(?:bytes|KiB|MiB|GiB|TiB))\s*\|\s*([^,]+\/s)/i);
  const done = /\bdone\.?$/i.test(detail) || Number(percentMatch?.[1]) >= 100;

  return {
    key,
    percent: percentMatch ? clampPercent(Number(percentMatch[1])) : null,
    current: countMatch ? Number(countMatch[1]) : null,
    total: countMatch ? Number(countMatch[2]) : null,
    amount: transferMatch ? transferMatch[1].trim() : null,
    speed: transferMatch ? transferMatch[2].trim() : null,
    detail,
    done,
    latestLine: trimmed,
    observed: true,
    state: done ? 'done' : 'active',
  };
};

export const summarizeGitTransferProgress = (
  lines: string[],
  visibleFallbackPhases: GitTransferPhaseKey[] = DEFAULT_VISIBLE_PHASES,
): GitTransferProgressSummary => {
  const phasesByKey = new Map<GitTransferPhaseKey, GitTransferPhaseProgress>();
  let latestLine: string | null = null;
  let latestDiagnostic: string | null = null;
  let latestObservedKey: GitTransferPhaseKey | null = null;
  let latestOpenObservedKey: GitTransferPhaseKey | null = null;

  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line) continue;
    latestLine = line;

    const parsed = parseGitTransferProgressLine(line);
    if (!parsed) {
      latestDiagnostic = line;
      continue;
    }

    phasesByKey.set(parsed.key, parsed);
    latestObservedKey = parsed.key;
    if (!parsed.done) {
      latestOpenObservedKey = parsed.key;
    }
  }

  const activeKey = latestOpenObservedKey ?? latestObservedKey;
  const visibleKeys = PHASE_ORDER.filter((key) => phasesByKey.has(key) || visibleFallbackPhases.includes(key));
  const activeIndex = activeKey ? PHASE_ORDER.indexOf(activeKey) : -1;

  const phases = visibleKeys.map((key) => {
    const phase = phasesByKey.get(key) ?? createEmptyPhase(key);
    const phaseIndex = PHASE_ORDER.indexOf(key);
    let state: GitTransferPhaseState = 'pending';

    if (phase.observed) {
      if (phase.done || (activeIndex >= 0 && phaseIndex < activeIndex)) {
        state = 'done';
      } else if (key === activeKey) {
        state = 'active';
      }
    }

    return {
      ...phase,
      state,
    };
  });

  const activePhase = phases.find((phase) => phase.state === 'active') ?? null;

  return {
    phases,
    activePhase,
    latestLine,
    latestDiagnostic,
    hasObservedProgress: phasesByKey.size > 0,
  };
};
