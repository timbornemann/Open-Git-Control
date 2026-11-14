import { Fragment, type ReactNode } from 'react';
import { AlertTriangle, ArrowRight, HelpCircle, Eye } from 'lucide-react';
import type { DialogContextItem } from '@/app/state/contracts';
import { useI18n } from '@/i18n';
import { Button } from './ui/Button';
import './dialogSections.css';

export function DialogMessage({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  const Icon = danger ? AlertTriangle : HelpCircle;
  return (
    <div className={`dialog-decision-message${danger ? ' dialog-decision-message--warning' : ''}`}>
      <Icon size={20} aria-hidden="true" />
      <p className="dialog-message">{children}</p>
    </div>
  );
}

export function DialogContext({ items, action }: { items: DialogContextItem[]; action?: { label: string; onClick: () => void } }) {
  const { tr } = useI18n();
  if (!items.length && !action) return null;
  return (
    <section className="dialog-decision-context" aria-label={tr('Details zur Aktion', 'Action details')}>
      <div className="dialog-decision-section-heading">
        <h4>{tr('Details zur Aktion', 'Action details')}</h4>
        {action && (
          <Button size="xs" icon={<Eye size={13} aria-hidden="true" />} onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
      {items.length > 0 && (
        <dl className="dialog-context-list">
          {items.map((item, index) => (
            <Fragment key={`${item.label}-${index}`}>
              <dt>{item.label}</dt>
              <dd data-dialog-context-value={item.value}>{item.value}</dd>
            </Fragment>
          ))}
        </dl>
      )}
    </section>
  );
}

export function DialogImpact({ irreversible, consequences }: { irreversible: boolean; consequences?: string }) {
  const { tr } = useI18n();
  if (!irreversible && !consequences) return null;
  const Icon = irreversible ? AlertTriangle : ArrowRight;
  return (
    <section
      className={`dialog-impact dialog-decision-impact${irreversible ? ' dialog-decision-impact--warning' : ''}`}
      data-dialog-irreversible={irreversible}
    >
      <Icon size={17} aria-hidden="true" />
      <div>
        <h4>
          {irreversible ? tr('Nicht automatisch rückgängig zu machen', 'Cannot be undone automatically') : tr('Was danach passiert', 'What happens next')}
        </h4>
        {consequences && <p>{consequences}</p>}
      </div>
    </section>
  );
}
