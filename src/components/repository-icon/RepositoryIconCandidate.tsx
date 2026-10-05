import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { loadRepositoryIconPreview } from '@/services/repositoryIconPreview';
export function RepositoryIconCandidate({ repoPath, path, selected, onSelect }: { repoPath: string; path: string; selected: boolean; onSelect: () => void }) {
  const { tr } = useI18n();
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !ref.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void loadRepositoryIconPreview(repoPath, path)
      .then((preview) => {
        if (active) setImage(preview.dataUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [repoPath, path, visible]);
  return (
    <button
      ref={ref}
      type="button"
      className={`repository-icon-candidate${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
      title={path}
    >
      <span className="repository-icon-candidate__image">
        {image ? <img src={image} alt="" /> : <span>{failed ? tr('Keine Vorschau', 'No preview') : '…'}</span>}
      </span>
      <span className="repository-icon-candidate__path">{path}</span>
    </button>
  );
}
