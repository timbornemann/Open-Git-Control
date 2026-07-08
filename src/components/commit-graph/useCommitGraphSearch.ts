import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GraphLayout } from '../../utils/graphLayout';
import type { SearchPanel } from './ForensicSearchPanel';

export type SearchScope = 'all' | 'subject' | 'author' | 'hash' | 'refs';

type UseCommitGraphSearchParams = {
  layout: GraphLayout | null;
  selectedHash?: string | null;
  onSelectCommit?: (hash: string | null) => void;
  tr: (deText: string, enText: string) => string;
};

export const useCommitGraphSearch = ({
  layout,
  selectedHash,
  onSelectCommit,
  tr,
}: UseCommitGraphSearchParams) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [activeSearchPanel, setActiveSearchPanel] = useState<SearchPanel>('commits');
  const [matchCursor, setMatchCursor] = useState(0);

  const searchScopeLabels = useMemo<Record<SearchScope, string>>(() => ({
    all: tr('Alles', 'All'),
    subject: tr('Nachricht', 'Message'),
    author: tr('Autor', 'Author'),
    hash: tr('Hash', 'Hash'),
    refs: tr('Refs', 'Refs'),
  }), [tr]);

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const matchedNodes = useMemo(() => {
    if (!layout || !normalizedSearch) return [];

    return layout.nodes.filter(node => {
      const { abbrevHash, hash, author, subject, refs } = node.commit;
      const inHash = abbrevHash.toLowerCase().includes(normalizedSearch) || hash.toLowerCase().includes(normalizedSearch);
      const inAuthor = author.toLowerCase().includes(normalizedSearch);
      const inSubject = subject.toLowerCase().includes(normalizedSearch);
      const inRefs = refs.some(ref => ref.toLowerCase().includes(normalizedSearch));

      if (searchScope === 'hash') return inHash;
      if (searchScope === 'author') return inAuthor;
      if (searchScope === 'subject') return inSubject;
      if (searchScope === 'refs') return inRefs;

      return inHash || inAuthor || inSubject || inRefs;
    });
  }, [layout, normalizedSearch, searchScope]);

  const matchedHashSet = useMemo(() => new Set(matchedNodes.map(node => node.commit.hash)), [matchedNodes]);

  useEffect(() => {
    setMatchCursor(0);
  }, [normalizedSearch, searchScope]);

  useEffect(() => {
    if (!selectedHash || matchedNodes.length === 0) return;
    const idx = matchedNodes.findIndex(node => node.commit.hash === selectedHash);
    if (idx >= 0) {
      setMatchCursor(idx);
    }
  }, [selectedHash, matchedNodes]);

  const jumpToMatch = useCallback((step: 1 | -1) => {
    if (matchedNodes.length === 0) return;

    const nextIndex = (matchCursor + step + matchedNodes.length) % matchedNodes.length;
    setMatchCursor(nextIndex);

    const hash = matchedNodes[nextIndex].commit.hash;
    onSelectCommit?.(hash);

    requestAnimationFrame(() => {
      const row = document.querySelector('[data-commit-hash="' + hash + '"]') as HTMLElement | null;
      row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [matchCursor, matchedNodes, onSelectCommit]);

  return {
    searchQuery,
    setSearchQuery,
    searchScope,
    setSearchScope,
    activeSearchPanel,
    setActiveSearchPanel,
    searchScopeLabels,
    normalizedSearch,
    matchedNodes,
    matchedHashSet,
    jumpToMatch,
  };
};
