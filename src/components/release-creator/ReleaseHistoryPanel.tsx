import React from 'react';
import { Clock3, GitBranch, RefreshCw } from 'lucide-react';
import type { GitHubReleaseContextDto } from '@/types/githubDtos';
import { useI18n } from '@/i18n';

type ReleaseCommit = GitHubReleaseContextDto['commitsSinceLastRelease'][number];

type Props = {
  commits: ReleaseCommit[];
  commitsCount: number;
  contextLoading: boolean;
  ownerRepo: { owner: string; repo: string } | null;
  releaseSubmitting: boolean;
  onRefreshContext: () => Promise<void>;
};

export const ReleaseHistoryPanel: React.FC<Props> = ({ commits, commitsCount, contextLoading, ownerRepo, releaseSubmitting, onRefreshContext }) => {
  const { t } = useI18n();

  return (
    <aside className="release-history-panel">
      <div className="release-history-toolbar">
        <div className="release-history-toolbar-copy">
          <span className="release-eyebrow">{t('generated.components.releasecreator.history_0b0610f3')}</span>
          <strong>{t('generated.components.releasecreator.commits_since_last_release_405f45df')}</strong>
        </div>
        <button
          className="staging-tool-btn"
          onClick={() => void onRefreshContext()}
          disabled={!ownerRepo || contextLoading || releaseSubmitting}
          title={t('generated.components.releasecreator.refresh_data_a356c350')}
        >
          <RefreshCw size={12} className={contextLoading ? 'spin' : ''} />
          {contextLoading
            ? t('generated.components.releasecreator.refreshing_3a1f234f')
            : t('generated.components.layout.apimcpsettingspanel.refresh_4825b0d7')}
        </button>
      </div>
      <div className="release-history-scroll">
        {commitsCount === 0 && (
          <div className="release-empty-state">
            <GitBranch size={16} />
            {t('generated.components.commit_graph.commitgraph.no_commits_found_c43024aa')}
          </div>
        )}
        {commits.map((commit) => (
          <div key={commit.hash} className="release-history-row">
            <div className="release-history-row-subject">{commit.subject}</div>
            <div className="release-history-row-meta">
              <code>{commit.shortHash}</code>
              <span>{commit.author}</span>
              <span>
                <Clock3 size={11} /> {commit.date}
              </span>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};
