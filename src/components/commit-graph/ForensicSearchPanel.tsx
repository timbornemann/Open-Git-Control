import React from 'react';
import { DiffRequest } from '../../types/diff';
import { GraphNode } from '../../utils/graphLayout';

export type ForensicSearchType = 'string' | 'regex' | 'line';
export type SearchPanel = 'commits' | 'forensic';

type ForensicSearchPanelProps = {
  activeSearchPanel: SearchPanel;
  setActiveSearchPanel: (value: SearchPanel) => void;
  forensicType: ForensicSearchType;
  setForensicType: (value: ForensicSearchType) => void;
  forensicSearchTypeLabels: Record<ForensicSearchType, string>;
  forensicPath: string;
  setForensicPath: (value: string) => void;
  forensicPathSuggestions: string[];
  forensicValue: string;
  setForensicValue: (value: string) => void;
  forensicStartLine: string;
  setForensicStartLine: (value: string) => void;
  forensicEndLine: string;
  setForensicEndLine: (value: string) => void;
  forensicLoading: boolean;
  forensicError: string | null;
  forensicResults: GraphNode[];
  runForensicSearch: () => Promise<void>;
  onSelectCommit?: (hash: string | null) => void;
  onOpenDiff?: (request: DiffRequest) => void;
  tr: (deText: string, enText: string) => string;
};

export const ForensicSearchPanel: React.FC<ForensicSearchPanelProps> = ({
  activeSearchPanel,
  setActiveSearchPanel,
  forensicType,
  setForensicType,
  forensicSearchTypeLabels,
  forensicPath,
  setForensicPath,
  forensicPathSuggestions,
  forensicValue,
  setForensicValue,
  forensicStartLine,
  setForensicStartLine,
  forensicEndLine,
  setForensicEndLine,
  forensicLoading,
  forensicError,
  forensicResults,
  runForensicSearch,
  onSelectCommit,
  onOpenDiff,
  tr,
}) => (
  <div style={{ borderBottom: '1px solid var(--border-color)', padding: '8px', display: activeSearchPanel === 'forensic' ? 'flex' : 'none', flexDirection: 'column', gap: '8px', background: 'var(--bg-dark)' }}>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        {tr('Suchmodus:', 'Search mode:')}
        <select
          value={activeSearchPanel}
          onChange={(e) => {
            const mode = e.target.value as SearchPanel;
            setActiveSearchPanel(mode);
          }}
          style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '5px 8px', fontSize: '0.78rem' }}
        >
          <option value="commits">{tr('Commit-Suche', 'Commit search')}</option>
          <option value="forensic">{tr('Forensische Historie', 'Forensic history')}</option>
        </select>
      </label>
      <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        {tr('Forensik-Modus:', 'Forensics mode:')}
        <select
          value={forensicType}
          onChange={(e) => {
            setForensicType(e.target.value as ForensicSearchType);
          }}
          style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '5px 8px', fontSize: '0.78rem' }}
        >
          {(Object.keys(forensicSearchTypeLabels) as ForensicSearchType[]).map((type) => (
            <option key={type} value={type}>{forensicSearchTypeLabels[type]}</option>
          ))}
        </select>
      </label>
    </div>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      <input
        type="text"
        value={forensicPath}
        onChange={(e) => setForensicPath(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void runForensicSearch(); }}
        list="forensic-path-suggestions"
        placeholder={tr('Dateipfad (z.B. src/components/commit-graph/CommitGraph.tsx)', 'File path (e.g. src/components/commit-graph/CommitGraph.tsx)')}
        style={{ flex: 1, minWidth: 260, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem' }}
      />
      <datalist id="forensic-path-suggestions">
        {forensicPathSuggestions.map((pathValue) => (
          <option key={pathValue} value={pathValue} />
        ))}
      </datalist>
      {forensicType === 'line' ? (
        <>
          <input type="number" min={1} value={forensicStartLine} onChange={(e) => setForensicStartLine(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runForensicSearch(); }} placeholder={tr('Startzeile', 'Start line')} style={{ width: 120, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem' }} />
          <input type="number" min={1} value={forensicEndLine} onChange={(e) => setForensicEndLine(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void runForensicSearch(); }} placeholder={tr('Endzeile', 'End line')} style={{ width: 120, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 8px', fontSize: '0.8rem' }} />
        </>
      ) : (
        <input
          type="text"
          value={forensicValue}
          onChange={(e) => setForensicValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void runForensicSearch(); }}
          placeholder={forensicType === 'regex' ? tr('Regex-Muster (git -G)', 'Regex pattern (git -G)') : tr('Suchstring im Dateiinhalt (git -S)', 'Search string in file content (git -S)')}
          style={{ flex: 1, minWidth: 220, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.8rem' }}
        />
      )}
      <button onClick={() => void runForensicSearch()} disabled={forensicLoading} style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.78rem', cursor: 'pointer' }}>
        {forensicLoading ? tr('Suche...', 'Searching...') : tr('Forensisch suchen', 'Run forensic search')}
      </button>
    </div>
    {forensicError && <div style={{ fontSize: '0.76rem', color: 'var(--status-danger)' }}>{forensicError}</div>}
    {forensicResults.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: 180, overflowY: 'auto' }}>
        {forensicResults.map((node) => (
          <div key={`forensic-${node.commit.hash}`} style={{ border: '1px solid var(--border-color)', borderRadius: 6, backgroundColor: 'var(--bg-panel)', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => onSelectCommit?.(node.commit.hash)} style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'monospace' }}>{node.commit.abbrevHash}</button>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{node.commit.subject}</span>
            <button onClick={() => onOpenDiff?.({ source: 'commit', path: forensicPath.trim(), commitHash: node.commit.hash, title: `${node.commit.abbrevHash} - ${forensicPath.trim()}` })} style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', borderRadius: 4, padding: '3px 6px', fontSize: '0.72rem', cursor: 'pointer' }}>{tr('Diff', 'Diff')}</button>
          </div>
        ))}
      </div>
    )}
  </div>
);
