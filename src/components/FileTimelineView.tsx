import React, { useEffect, useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, FastForward } from 'lucide-react';
import { useI18n } from '@/i18n';
import { FileTimelineCanvas } from './FileTimelineCanvas';
import { FileTimelineTreeReader } from './file-timeline/fileTimelineTree';
import { readTimelineSession, rememberTimelineSession } from './file-timeline/fileTimelineSession';
import type { FileTimelineCommit } from './file-timeline/types';
import './file-timeline/fileTimeline.css';

type FileTimelineViewProps = {
  commits: FileTimelineCommit[];
  visibleCommitHashes?: ReadonlySet<string>;
  pathFilter?: string;
  contextKey?: string;
};

export const FileTimelineView: React.FC<FileTimelineViewProps> = React.memo(({ commits, visibleCommitHashes, pathFilter = '', contextKey = '' }) => {
  const { t, tr, locale } = useI18n();
  const indices = useMemo(
    () => commits.map((commit, index) => (!visibleCommitHashes || visibleCommitHashes.has(commit.hash) ? index : -1)).filter((index) => index >= 0),
    [commits, visibleCommitHashes],
  );
  const positions = useMemo(() => new Map(indices.map((index, position) => [commits[index].hash, position])), [commits, indices]);
  const [selectedHash, setSelectedHash] = useState(() => readTimelineSession(contextKey)?.selectedHash ?? commits[indices.at(-1) ?? 0]?.hash ?? '');
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(800);
  const position = positions.get(selectedHash) ?? Math.max(0, indices.length - 1);
  const currentIndex = indices[position] ?? 0;
  const activeCommit = commits[currentIndex];
  const reader = useMemo(() => new FileTimelineTreeReader(commits), [commits]);
  const fileTree = useMemo(() => reader.tree(currentIndex, pathFilter), [reader, currentIndex, pathFilter]);

  useEffect(() => {
    if (activeCommit) rememberTimelineSession(contextKey, { selectedHash: activeCommit.hash });
  }, [contextKey, activeCommit]);
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setSelectedHash((previous) => {
        const current = positions.get(previous) ?? Math.max(0, indices.length - 1);
        if (current >= indices.length - 1) {
          setIsPlaying(false);
          return previous;
        }
        return commits[indices[current + 1]].hash;
      });
    }, speed);
    return () => clearInterval(timer);
  }, [isPlaying, positions, indices, commits, speed]);
  const selectPosition = (next: number) => {
    setIsPlaying(false);
    if (commits[indices[next]]) setSelectedHash(commits[indices[next]].hash);
  };
  if (!indices.length)
    return (
      <div className="file-timeline-empty" role="status">
        {commits.length
          ? tr('Keine Commits passen zu diesen Filtern auf der ausgewählten Elternlinie.', 'No commits match these filters on the selected parent line.')
          : t('generated.components.filetimelineview.no_commits_found_in_repository_1449958f')}
      </div>
    );
  return (
    <div className="file-timeline">
      <div className="file-timeline-map">
        <FileTimelineCanvas fileTree={fileTree} activeCommit={activeCommit} contextKey={contextKey} />
      </div>
      <div className="file-timeline-controls">
        <div className="file-timeline-commit">
          <div className="file-timeline-commit-description">
            <code>{activeCommit.hash.slice(0, 8)}</code>
            <strong title={activeCommit.subject}>{activeCommit.subject}</strong>
            <span>
              {activeCommit.author} · {new Date(activeCommit.date).toLocaleString(locale)}
            </span>
          </div>
          <span className="file-timeline-position">
            Commit {position + 1} / {indices.length.toLocaleString(locale)}
          </span>
        </div>
        <input
          className="file-timeline-slider"
          aria-label={tr('Commit auswählen', 'Select commit')}
          type="range"
          min={0}
          max={indices.length - 1}
          value={position}
          onChange={(event) => selectPosition(Number(event.target.value))}
        />
        <div className="file-timeline-playback">
          <div className="file-timeline-playback-buttons">
            <button className="icon-btn" aria-label={tr('Zum ersten Commit', 'First commit')} onClick={() => selectPosition(0)}>
              <RotateCcw size={16} />
            </button>
            <button
              className="icon-btn file-timeline-play"
              aria-label={isPlaying ? tr('Pause', 'Pause') : tr('Abspielen', 'Play')}
              onClick={() => {
                if (!isPlaying && position >= indices.length - 1) selectPosition(0);
                setIsPlaying(!isPlaying);
              }}
            >
              {isPlaying ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <button className="icon-btn" aria-label={tr('Zum letzten Commit', 'Last commit')} onClick={() => selectPosition(indices.length - 1)}>
              <FastForward size={16} />
            </button>
          </div>
          <div className="file-timeline-legend" aria-label={tr('Änderungsarten', 'Change types')}>
            <span className="is-added">{tr('Neu', 'Added')}</span>
            <span className="is-modified">{tr('Geändert', 'Modified')}</span>
            <span className="is-renamed">{tr('Umbenannt', 'Renamed')}</span>
          </div>
          <label className="file-timeline-speed">
            {t('generated.components.filetimelineview.speed_805e4a3b')}
            <select className="ui-field" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              <option value={1500}>{t('generated.components.filetimelineview.very_slow_1_5s_f46bec3e')}</option>
              <option value={800}>{t('generated.components.filetimelineview.normal_0_8s_4f228619')}</option>
              <option value={300}>{t('generated.components.filetimelineview.fast_0_3s_231c3abf')}</option>
              <option value={100}>{t('generated.components.filetimelineview.very_fast_0_1s_d3e91155')}</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
});
