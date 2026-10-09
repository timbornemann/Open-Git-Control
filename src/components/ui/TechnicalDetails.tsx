import { useI18n } from '@/i18n';
import { redactGitCredentials } from '@/shared/git/redaction';
import './technical-details.css';

export function TechnicalDetails({ children }: { children?: string }) {
  const { tr } = useI18n();
  if (!children) return null;
  return (
    <details className="technical-details">
      <summary>{tr('Technische Details', 'Technical details')}</summary>
      <pre>{redactGitCredentials(children)}</pre>
    </details>
  );
}
