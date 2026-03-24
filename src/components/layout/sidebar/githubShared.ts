type TranslateFn = (de: string, en: string) => string;

export const getCiBadgeStyles = (badge: string, tr: TranslateFn) => {
  if (badge === 'success') {
    return {
      color: 'var(--status-success)',
      backgroundColor: 'var(--status-success-soft)',
      borderColor: 'var(--status-success-border)',
      label: tr('CI: Erfolgreich', 'CI: Success'),
    };
  }
  if (badge === 'failure') {
    return {
      color: 'var(--status-danger)',
      backgroundColor: 'var(--status-danger-soft)',
      borderColor: 'var(--status-danger-border)',
      label: tr('CI: Fehlgeschlagen', 'CI: Failed'),
    };
  }
  if (badge === 'pending') {
    return {
      color: 'var(--status-warning)',
      backgroundColor: 'var(--status-warning-soft)',
      borderColor: 'var(--status-warning-border)',
      label: tr('CI: Ausstehend', 'CI: Pending'),
    };
  }
  return {
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-dark)',
    borderColor: 'var(--border-color)',
    label: tr('CI: Unbekannt', 'CI: Unknown'),
  };
};

export const formatDuration = (startedAt?: string | null, finishedAt?: string | null, emptySymbol = '-'): string => {
  if (!startedAt || !finishedAt) return emptySymbol;
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return emptySymbol;
  const totalSec = Math.round((end - start) / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${String(sec).padStart(2, '0')}s`;
};
