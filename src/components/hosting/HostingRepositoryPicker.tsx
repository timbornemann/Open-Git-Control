import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n';
import type { HostedRepositoryRef } from '@/types/hostingDtos';

export function HostingRepositoryPicker({
  label,
  selected,
  defaultUrl,
  busy,
  onResolve,
  children,
}: {
  label: string;
  selected: HostedRepositoryRef;
  defaultUrl: string;
  busy: boolean;
  onResolve: (url: string) => void;
  children?: ReactNode;
}) {
  const { tr } = useI18n();
  const [url, setUrl] = useState(defaultUrl);
  return (
    <div className="hosting-repository-picker">
      <label>
        {label}
        <span className="hosting-source-ref">{selected.fullPath}</span>
        <TextField disabled={busy} value={url} onChange={(event) => setUrl(event.target.value)} aria-label={tr(`${label}: Web-URL`, `${label}: web URL`)} />
      </label>
      <div className="hosting-actions">
        <Button disabled={busy || !url.trim()} onClick={() => onResolve(url.trim())}>
          {tr('Repository auswählen', 'Select repository')}
        </Button>
        {children}
      </div>
    </div>
  );
}
