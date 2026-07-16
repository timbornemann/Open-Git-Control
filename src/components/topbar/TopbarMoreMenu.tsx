import React from 'react';
import type { RepositoryRunActionId, RepositoryRunConfigStateDto, RepositoryRunStateDto } from '@/types/repositoryRun';
import { useI18n } from '@/i18n';
import { RepositoryRunMenuItems } from './RepositoryRunMenu';

export type TopbarMoreMenuView = 'more' | 'moreMerge' | 'moreRun';

type MoreOption = {
  label: string;
  hint: string;
  action: () => void;
};

type Props = {
  view: TopbarMoreMenuView;
  setView: (view: TopbarMoreMenuView | null) => void;
  activeRepo: string | null;
  isGitActionRunning: boolean;
  branchCount: number;
  isTimelineLoading: boolean;
  pullOptions: MoreOption[];
  pushOptions: MoreOption[];
  renderMergePicker: () => React.ReactNode;
  onClearMergeQuery: () => void;
  onStageCommit: () => void;
  onOpenTimeline?: () => void;
  onOpenReleaseCreator: () => void;
  activeRunConfig: RepositoryRunConfigStateDto | null;
  repositoryRun: RepositoryRunStateDto | null;
  onStartRepositoryRun: (action: RepositoryRunActionId) => Promise<boolean>;
  onStopRepositoryRun: () => Promise<boolean>;
  onOpenRunConsole: () => void;
  onOpenRunSettings: () => void;
};

export const TopbarMoreMenu: React.FC<Props> = ({
  view,
  setView,
  activeRepo,
  isGitActionRunning,
  branchCount,
  isTimelineLoading,
  pullOptions,
  pushOptions,
  renderMergePicker,
  onClearMergeQuery,
  onStageCommit,
  onOpenTimeline,
  onOpenReleaseCreator,
  activeRunConfig,
  repositoryRun,
  onStartRepositoryRun,
  onStopRepositoryRun,
  onOpenRunConsole,
  onOpenRunSettings,
}) => {
  const { t } = useI18n();

  if (view === 'moreMerge') {
    return (
      <div className="topbar-dropdown topbar-more-dropdown">
        <button
          type="button"
          className="topbar-dropdown-item topbar-more-back"
          onClick={() => {
            onClearMergeQuery();
            setView('more');
          }}
        >
          <span className="topbar-dropdown-item-label">{t('generated.components.topbar.topbaractions.back_to_actions_db752816')}</span>
        </button>
        <div className="topbar-dropdown-sep" />
        {renderMergePicker()}
      </div>
    );
  }

  if (view === 'moreRun') {
    return (
      <div className="topbar-dropdown topbar-more-dropdown">
        <button type="button" className="topbar-dropdown-item topbar-more-back" onClick={() => setView('more')}>
          <span className="topbar-dropdown-item-label">{t('generated.components.topbar.topbaractions.back_to_actions_db752816')}</span>
        </button>
        <div className="topbar-dropdown-sep" />
        <RepositoryRunMenuItems
          activeRunConfig={activeRunConfig}
          repositoryRun={repositoryRun}
          onStart={onStartRepositoryRun}
          onStop={onStopRepositoryRun}
          onOpenConsole={onOpenRunConsole}
          onOpenSettings={onOpenRunSettings}
          onClose={() => setView(null)}
        />
      </div>
    );
  }

  const runOption = (option: MoreOption) => {
    setView(null);
    option.action();
  };

  return (
    <div className="topbar-dropdown topbar-more-dropdown">
      <div className="topbar-dropdown-header">{t('generated.components.topbar.topbaractions.more_actions_a53b5e21')}</div>
      <button
        className="topbar-dropdown-item"
        onClick={() => {
          setView(null);
          onStageCommit();
        }}
        disabled={!activeRepo}
      >
        <span className="topbar-dropdown-item-label">{t('generated.components.topbar.topbaractions.stage_commit_77275475')}</span>
        <span className="topbar-dropdown-item-hint">{t('generated.components.topbar.topbaractions.open_working_directory_48559e72')}</span>
      </button>
      <button className="topbar-dropdown-item" onClick={() => setView('moreMerge')} disabled={!activeRepo || isGitActionRunning || branchCount === 0}>
        <span className="topbar-dropdown-item-label">{t('generated.components.topbar.topbaractions.merge_branch_8c3efbb0')}</span>
        <span className="topbar-dropdown-item-hint">{t('generated.components.topbar.topbaractions.choose_branch_and_merge_mode_9fea8d11')}</span>
      </button>
      <button className="topbar-dropdown-item" data-topbar-more-run onClick={() => setView('moreRun')} disabled={!activeRepo}>
        <span className="topbar-dropdown-item-label">Run</span>
      </button>
      <button
        className="topbar-dropdown-item"
        onClick={() => {
          setView(null);
          onOpenTimeline?.();
        }}
        disabled={!activeRepo || isTimelineLoading}
      >
        <span className="topbar-dropdown-item-label">{t('generated.components.topbar.topbaractions.timeline_b35c2fb1')}</span>
      </button>
      <button
        className="topbar-dropdown-item"
        onClick={() => {
          setView(null);
          onOpenReleaseCreator();
        }}
        disabled={!activeRepo}
      >
        <span className="topbar-dropdown-item-label">{t('generated.components.layout.sidebar.githubconnectedcontent.create_release_f0fffb84')}</span>
      </button>
      <div className="topbar-dropdown-sep" />
      <div className="topbar-dropdown-header">{t('generated.components.topbar.topbaractions.pull_options_021c5024')}</div>
      {pullOptions.map((option) => (
        <button key={`more-${option.label}`} className="topbar-dropdown-item" onClick={() => runOption(option)} disabled={!activeRepo || isGitActionRunning}>
          <span className="topbar-dropdown-item-label">{option.label}</span>
          <span className="topbar-dropdown-item-hint">{option.hint}</span>
        </button>
      ))}
      <div className="topbar-dropdown-sep" />
      <div className="topbar-dropdown-header">{t('generated.components.topbar.topbaractions.push_options_f825b016')}</div>
      {pushOptions.map((option) => (
        <button key={`more-${option.label}`} className="topbar-dropdown-item" onClick={() => runOption(option)} disabled={!activeRepo || isGitActionRunning}>
          <span className="topbar-dropdown-item-label">{option.label}</span>
          <span className="topbar-dropdown-item-hint">{option.hint}</span>
        </button>
      ))}
    </div>
  );
};
