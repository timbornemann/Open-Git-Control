import { useState } from 'react';
import { useI18n } from '@/i18n';
import { useRepositoryIcon } from './useRepositoryIcon';
import '@/styles/repository-icons.css';
export function RepositoryIcon({ repoPath, name, size = 26, className = '' }: { repoPath: string; name: string; size?: number; className?: string }) {
  const state = useRepositoryIcon(repoPath);
  const { locale } = useI18n();
  const [failed, setFailed] = useState<string | null>(null);
  const image = state?.thumbnail?.dataUrl;
  return (
    <span className={`repository-icon ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      {image && failed !== image ? (
        <img src={image} alt="" width={size} height={size} onError={() => setFailed(image)} />
      ) : (
        <span className="repository-activity-initial">{Array.from(name).slice(0, 2).join('').toLocaleUpperCase(locale)}</span>
      )}
    </span>
  );
}
