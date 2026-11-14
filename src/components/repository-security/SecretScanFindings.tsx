import { FileCode2, LockKeyhole } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { SecretScanFindingDto } from '@/types/gitDtos';
import './secretScanFindings.css';

const RULE_LABELS: Record<string, string> = {
  'openai-project-api-key': 'OpenAI Project API Key',
  'openai-service-account-api-key': 'OpenAI Service Account API Key',
  'anthropic-api-key': 'Anthropic API Key',
  'google-api-key': 'Google API Key',
  'groq-api-key': 'Groq API Key',
  'openrouter-api-key': 'OpenRouter API Key',
  'hugging-face-access-token': 'Hugging Face Access Token',
  'replicate-api-token': 'Replicate API Token',
  'xai-api-key': 'xAI API Key',
  'perplexity-api-key': 'Perplexity API Key',
  'together-ai-api-key': 'Together AI API Key',
  'fireworks-ai-api-key': 'Fireworks AI API Key',
  'aws-access-key-id': 'AWS Access Key ID',
  'github-token': 'GitHub Token',
  'github-fine-grained-pat': 'GitHub Token (fine-grained)',
  'slack-token': 'Slack Token',
  'stripe-live-key': 'Stripe Live Key',
  'jwt-token': 'JSON Web Token (JWT)',
};

/** Only backend-redacted context is displayed. Missing redaction fails closed. */
function MaskedContext({ finding }: { finding: SecretScanFindingDto }) {
  const { tr } = useI18n();
  // A PEM header can share a physical line with escaped key material. Keep the
  // entire line hidden even if an older scan only redacted the header itself.
  const contextLine = finding.ruleId === 'private-key-block' ? '[REDACTED_SECRET]' : finding.contextLine;
  const marker = contextLine.search(/\[REDACTED(?:_SECRET)?\]/);
  if (marker < 0) return <span className="secret-scan-finding__unavailable">{tr('Keine sichere Vorschau verfügbar.', 'No safe preview available.')}</span>;

  // Keep the finding in view, including when a minified line has a large prefix.
  const start = Math.max(0, marker - 100);
  const end = Math.min(contextLine.length, marker + 160);
  const preview = `${start ? '…' : ''}${contextLine.slice(start, end)}${end < contextLine.length ? '…' : ''}`;
  return preview.split(/(\[REDACTED(?:_SECRET)?\])/).map((part, index) =>
    /^\[REDACTED(?:_SECRET)?\]$/.test(part) ? (
      <span className="secret-scan-finding__mask" key={index}>
        {tr('••• Secret verborgen •••', '••• Secret hidden •••')}
      </span>
    ) : (
      part
    ),
  );
}

export function SecretScanFindings({ findings }: { findings: SecretScanFindingDto[] }) {
  const { tr } = useI18n();
  const files = new Map<string, SecretScanFindingDto[]>();
  for (const finding of findings) {
    const group = files.get(finding.filePath) ?? [];
    group.push(finding);
    files.set(finding.filePath, group);
  }
  const sourceLabels = {
    staged: tr('Index · für Commit vorgemerkt', 'Index · staged for commit'),
    'to-push': tr('Zu pushende Commit-Historie', 'Outgoing commit history'),
    tag: tr('Tag-Historie', 'Tag history'),
  };
  const severityLabels = { medium: tr('Mittel', 'Medium'), high: tr('Hoch', 'High'), critical: tr('Kritisch', 'Critical') };
  const ruleLabel = (ruleId: string) => {
    if (ruleId === 'private-key-block') return tr('Privater Schlüssel', 'Private key');
    if (['credential-assignment', 'high-entropy-assignment', 'configuration-secret-assignment'].includes(ruleId)) {
      return tr('Mögliche Zugangsdaten', 'Possible credentials');
    }
    return RULE_LABELS[ruleId] ?? ruleId;
  };

  return (
    <ol className="secret-scan-files" aria-label={tr('Fundstellen nach Datei', 'Findings by file')}>
      {[...files].map(([filePath, matches]) => {
        const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
        return (
          <li className="secret-scan-file" key={filePath}>
            <div className="secret-scan-file__header">
              <FileCode2 size={17} aria-hidden="true" />
              <code>
                <span>{filePath.slice(0, lastSlash + 1)}</span>
                <strong>{filePath.slice(lastSlash + 1)}</strong>
              </code>
              <span className="secret-scan-file__count">
                {tr(`${matches.length} Treffer`, `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`)}
              </span>
            </div>
            <ol className="secret-scan-file__findings">
              {[...matches]
                .sort((a, b) => a.lineNumber - b.lineNumber)
                .map((finding) => (
                  <li className="secret-scan-finding" key={finding.id}>
                    <div className="secret-scan-finding__location">
                      <strong>{tr(`Zeile ${finding.lineNumber}`, `Line ${finding.lineNumber}`)}</strong>
                      <span>{sourceLabels[finding.source]}</span>
                      <span className={`secret-scan-finding__severity secret-scan-finding__severity--${finding.severity}`}>
                        {tr('Risiko:', 'Risk:')} {severityLabels[finding.severity]}
                      </span>
                    </div>
                    <div className="secret-scan-finding__rule" title={finding.ruleId}>
                      <LockKeyhole size={13} aria-hidden="true" />
                      {ruleLabel(finding.ruleId)}
                    </div>
                    <pre className="secret-scan-finding__context">
                      <span className="secret-scan-finding__line-number" aria-hidden="true">
                        {finding.lineNumber}
                      </span>
                      <code>
                        <MaskedContext finding={finding} />
                      </code>
                    </pre>
                  </li>
                ))}
            </ol>
          </li>
        );
      })}
    </ol>
  );
}
