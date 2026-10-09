import { Activity, Flame, GitCompare, LayoutDashboard, Link2, Users, type LucideIcon } from 'lucide-react';
import { useI18n } from '@/i18n';
import { analyticsSections, selectAnalyticsTab, useAnalyticsTab, type AnalyticsTab } from './analyticsNavigationState';
import './analyticsSidebar.css';

const icons: Record<AnalyticsTab, LucideIcon> = {
  overview: LayoutDashboard,
  hotspots: Flame,
  contributions: Users,
  churn: Activity,
  coupling: Link2,
  comparison: GitCompare,
};

export function AnalyticsNavigation({ repoPath }: { repoPath: string | null }) {
  const { tr } = useI18n();
  const tab = useAnalyticsTab(repoPath);
  return (
    <nav className="analytics-sidebar-nav" aria-label={tr('Auswertungen', 'Analyses')}>
      {analyticsSections(tr).map(({ id, label }) => {
        const Icon = icons[id];
        return (
          <button
            key={id}
            type="button"
            className={`analytics-sidebar-link${tab === id ? ' is-active' : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => selectAnalyticsTab(repoPath, id)}
            disabled={!repoPath}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
