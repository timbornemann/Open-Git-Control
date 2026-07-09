import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Play, Pause, RotateCcw, FastForward } from 'lucide-react';
import { useI18n } from '@/i18n';
import { FileTimelineCanvas } from './FileTimelineCanvas';
import type { FileTimelineCommit, FileTimelineNode } from './file-timeline/types';

type FileTimelineViewProps = {
  onClose: () => void;
  commits: FileTimelineCommit[];
};

export const FileTimelineView: React.FC<FileTimelineViewProps> = ({ onClose, commits }) => {
  const { t } = useI18n();
  const [currentIndex, setCurrentIndex] = useState(commits.length > 0 ? commits.length - 1 : 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(800); // ms per step

  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Reset index when commits array changes
  useEffect(() => {
    setCurrentIndex(commits.length > 0 ? commits.length - 1 : 0);
    setIsPlaying(false);
  }, [commits]);

  // Autoplay Logic
  useEffect(() => {
    if (isPlaying) {
      playbackTimerRef.current = setInterval(() => {
        setCurrentIndex((prevIndex) => {
          if (prevIndex >= commits.length - 1) {
            setIsPlaying(false);
            return prevIndex;
          }
          return prevIndex + 1;
        });
      }, speed);
    } else {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    }

    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
      }
    };
  }, [isPlaying, commits.length, speed]);

  const activeCommit = commits[currentIndex];

  // Reconstruct the codebase file tree at the current commit index
  const fileTree = useMemo(() => {
    const root: FileTimelineNode = { name: 'root', path: '', type: 'folder', status: 'unchanged', children: new Map() };
    if (commits.length === 0) return root;

    // Build the flat list of active files up to the current index
    const activeFiles = new Map<string, 'added' | 'modified' | 'deleted' | 'renamed' | 'unchanged'>();

    for (let i = 0; i <= currentIndex; i++) {
      const commit = commits[i];
      if (!commit) continue;

      for (const change of commit.changes) {
        const isCurrent = i === currentIndex;

        if (change.status === 'added') {
          activeFiles.set(change.path, isCurrent ? 'added' : 'unchanged');
        } else if (change.status === 'modified') {
          activeFiles.set(change.path, isCurrent ? 'modified' : 'unchanged');
        } else if (change.status === 'deleted') {
          activeFiles.delete(change.path);
        } else if (change.status === 'renamed') {
          if (change.oldPath) {
            activeFiles.delete(change.oldPath);
          }
          activeFiles.set(change.path, isCurrent ? 'renamed' : 'unchanged');
        }
      }
    }

    // Build hierarchical tree
    for (const [filePath, status] of activeFiles.entries()) {
      const segments = filePath.split('/');
      let current = root;
      let currentPath = '';

      for (let j = 0; j < segments.length; j++) {
        const seg = segments[j];
        currentPath = currentPath ? `${currentPath}/${seg}` : seg;
        const isLast = j === segments.length - 1;

        if (!current.children) {
          current.children = new Map();
        }

        let child = current.children.get(seg);
        if (!child) {
          child = {
            name: seg,
            path: currentPath,
            type: isLast ? 'file' : 'folder',
            status: isLast ? status : 'unchanged',
            children: isLast ? undefined : new Map(),
          };
          current.children.set(seg, child);
        } else if (isLast) {
          child.status = status;
        }
        current = child;
      }
    }

    return root;
  }, [commits, currentIndex]);

  const handlePlayPause = () => {
    if (currentIndex >= commits.length - 1 && !isPlaying) {
      setCurrentIndex(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
  };

  const handleSkipToEnd = () => {
    setIsPlaying(false);
    setCurrentIndex(commits.length - 1);
  };

  if (commits.length === 0) {
    return (
      <div className="diff-empty-state" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <span>{t('generated.components.filetimelineview.no_commits_found_in_repository_1449958f')}</span>
        <button className="staging-btn-sm" onClick={onClose}>
          {t('generated.components.filetimelineview.back_4e004d2b')}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-darker)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Visual Canvas Area */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <FileTimelineCanvas fileTree={fileTree} activeCommit={activeCommit} />
      </div>

      {/* Control panel at the bottom */}
      <div
        style={{
          padding: '16px 20px',
          background: 'var(--bg-dark)',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Active Commit Information */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px' }}>
          {activeCommit ? (
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                <span className="topbar-chip topbar-chip-branch" style={{ fontFamily: 'monospace', fontSize: '0.75rem', padding: '1px 6px', margin: 0 }}>
                  {activeCommit.hash.substring(0, 8)}
                </span>
                <span
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {activeCommit.subject}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {activeCommit.author} • {new Date(activeCommit.date).toLocaleString()}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>-</div>
          )}

          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-accent)', whiteSpace: 'nowrap' }}>
            Commit {currentIndex + 1} / {commits.length}
          </div>
        </div>

        {/* Timeline Slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            type="range"
            min={0}
            max={commits.length - 1}
            value={currentIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentIndex(Number(e.target.value));
            }}
            style={{
              flex: 1,
              height: '6px',
              borderRadius: '3px',
              background: 'var(--border-color)',
              outline: 'none',
              cursor: 'pointer',
              accentColor: 'var(--text-accent)',
            }}
          />
        </div>

        {/* Playback Controls & Speed Selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleReset}
              className="diff-nav-btn"
              title={t('generated.components.filetimelineview.reset_to_start_e56647b1')}
              style={{ width: '32px', height: '32px' }}
            >
              <RotateCcw size={15} />
            </button>
            <button
              onClick={handlePlayPause}
              className="diff-nav-btn"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'var(--accent-primary-soft)',
                color: 'var(--text-accent)',
                border: '1px solid var(--accent-primary-border)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title={isPlaying ? t('generated.components.filetimelineview.pause_a1839c38') : t('generated.components.filetimelineview.play_55b22fd2')}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
            </button>
            <button
              onClick={handleSkipToEnd}
              className="diff-nav-btn"
              title={t('generated.components.filetimelineview.skip_to_end_8be57eb0')}
              style={{ width: '32px', height: '32px' }}
            >
              <FastForward size={15} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{t('generated.components.filetimelineview.speed_805e4a3b')}</span>
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{
                background: 'var(--bg-panel)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '5px',
                padding: '4px 8px',
                fontSize: '0.75rem',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value={1500}>{t('generated.components.filetimelineview.very_slow_1_5s_f46bec3e')}</option>
              <option value={800}>{t('generated.components.filetimelineview.normal_0_8s_4f228619')}</option>
              <option value={300}>{t('generated.components.filetimelineview.fast_0_3s_231c3abf')}</option>
              <option value={100}>{t('generated.components.filetimelineview.very_fast_0_1s_d3e91155')}</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
