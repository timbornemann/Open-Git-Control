import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

type RepoCardProps = {
  children: React.ReactNode;
  className?: string;
};

type RepoCardHeaderProps = {
  title: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  toggleTitle?: string;
  actions?: React.ReactNode;
};

type RepoCardStatusProps = {
  variant?: 'neutral' | 'success' | 'warning' | 'danger';
  title: React.ReactNode;
  detail?: React.ReactNode;
  actions?: React.ReactNode;
};

export const RepoCard: React.FC<RepoCardProps> = ({ children, className }) => (
  <section className={`repo-card${className ? ` ${className}` : ''}`}>{children}</section>
);

export const RepoCardHeader: React.FC<RepoCardHeaderProps> = ({
  title,
  collapsed,
  onToggleCollapsed,
  toggleTitle,
  actions,
}) => (
  <div className="repo-card-header">
    <div className="repo-card-header-main">
      {typeof collapsed === 'boolean' && onToggleCollapsed ? (
        <button className="repo-card-toggle" onClick={onToggleCollapsed} title={toggleTitle}>
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <span className="repo-card-title">{title}</span>
        </button>
      ) : (
        <span className="repo-card-title">{title}</span>
      )}
    </div>
    {actions ? <div className="repo-card-actions">{actions}</div> : null}
  </div>
);

export const RepoCardToolbar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`repo-card-toolbar${className ? ` ${className}` : ''}`}>{children}</div>
);

export const RepoCardContent: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className, style }) => (
  <div className={`repo-card-content${className ? ` ${className}` : ''}`} style={style}>{children}</div>
);

export const RepoCardStatus: React.FC<RepoCardStatusProps> = ({ variant = 'neutral', title, detail, actions }) => (
  <div className={`repo-status repo-status-${variant}`}>
    <div className="repo-status-copy">
      <span className="repo-status-title">{title}</span>
      {detail ? <span className="repo-status-detail">{detail}</span> : null}
    </div>
    {actions ? <div className="repo-status-actions">{actions}</div> : null}
  </div>
);
