import React from 'react';
import { DialogFrame } from '../DialogFrame';
import { useI18n } from '../../i18n';
import {
  PlannerItem,
  PlannerItemInput,
  PlannerPriority,
  PlannerProject,
  PlannerProjectInput,
  PlannerStatus,
} from '../../types/projectPlanner';

export const PRIORITY_OPTIONS: PlannerPriority[] = ['low', 'medium', 'high', 'urgent'];
export const STATUS_OPTIONS: PlannerStatus[] = ['idea', 'planned', 'in-progress', 'blocked', 'done'];

export const usePlannerLabels = () => {
  const { tr } = useI18n();
  return {
    priority: {
      low: tr('Niedrig', 'Low'),
      medium: tr('Mittel', 'Medium'),
      high: tr('Hoch', 'High'),
      urgent: tr('Dringend', 'Urgent'),
    } satisfies Record<PlannerPriority, string>,
    status: {
      idea: tr('Idee', 'Idea'),
      planned: tr('Geplant', 'Planned'),
      'in-progress': tr('In Arbeit', 'In progress'),
      blocked: tr('Blockiert', 'Blocked'),
      done: tr('Erledigt', 'Done'),
    } satisfies Record<PlannerStatus, string>,
  };
};

type ProjectDialogProps = {
  open: boolean;
  project?: PlannerProject | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: PlannerProjectInput) => Promise<void>;
};

export const ProjectDialog: React.FC<ProjectDialogProps> = ({
  open,
  project,
  busy,
  onClose,
  onSubmit,
}) => {
  const { tr } = useI18n();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setName(project?.name || '');
    setDescription(project?.description || '');
  }, [open, project]);

  const submit = () => {
    if (!name.trim() || busy) return;
    void onSubmit({ name: name.trim(), description: description.trim() });
  };

  return (
    <DialogFrame
      open={open}
      title={project ? tr('Projekt bearbeiten', 'Edit project') : tr('Zukuenftiges Projekt anlegen', 'Create future project')}
      onClose={onClose}
      onConfirm={submit}
      onEnter={submit}
      confirmLabel={project ? tr('Speichern', 'Save') : tr('Projekt anlegen', 'Create project')}
      confirmDisabled={!name.trim() || busy}
    >
      <div className="planner-dialog-form">
        <label>
          {tr('Projektname', 'Project name')}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={tr('Zum Beispiel: Mobile Companion App', 'For example: Mobile companion app')}
            maxLength={160}
          />
        </label>
        <label>
          {tr('Beschreibung', 'Description')}
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={tr('Vision, Zielgruppe oder erste Leitplanken...', 'Vision, audience, or initial guardrails...')}
            rows={5}
            maxLength={8000}
          />
        </label>
      </div>
    </DialogFrame>
  );
};

type ItemDialogProps = {
  open: boolean;
  item?: PlannerItem | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: PlannerItemInput) => Promise<void>;
};

export const ItemDialog: React.FC<ItemDialogProps> = ({
  open,
  item,
  busy,
  onClose,
  onSubmit,
}) => {
  const { tr } = useI18n();
  const labels = usePlannerLabels();
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [priority, setPriority] = React.useState<PlannerPriority>('medium');
  const [status, setStatus] = React.useState<PlannerStatus>('idea');
  const [tags, setTags] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setTitle(item?.title || '');
    setDescription(item?.description || '');
    setPriority(item?.priority || 'medium');
    setStatus(item?.status || 'idea');
    setTags(item?.tags.join(', ') || '');
  }, [item, open]);

  const submit = () => {
    if (!title.trim() || busy) return;
    void onSubmit({
      title: title.trim(),
      description: description.trim(),
      priority,
      status,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
  };

  return (
    <DialogFrame
      open={open}
      title={item ? tr('Eintrag bearbeiten', 'Edit item') : tr('Neuen Eintrag anlegen', 'Create item')}
      onClose={onClose}
      onConfirm={submit}
      onEnter={submit}
      confirmLabel={item ? tr('Speichern', 'Save') : tr('Eintrag anlegen', 'Create item')}
      confirmDisabled={!title.trim() || busy}
    >
      <div className="planner-dialog-form">
        <label>
          {tr('Ueberschrift', 'Title')}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={tr('Was soll getan oder festgehalten werden?', 'What needs to be done or captured?')}
            maxLength={240}
          />
        </label>
        <label>
          {tr('Freitextbeschreibung', 'Description')}
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={tr('Kontext, Akzeptanzkriterien, offene Fragen...', 'Context, acceptance criteria, open questions...')}
            rows={7}
            maxLength={20000}
          />
        </label>
        <div className="planner-dialog-grid">
          <label>
            {tr('Dringlichkeit', 'Priority')}
            <select value={priority} onChange={(event) => setPriority(event.target.value as PlannerPriority)}>
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>{labels.priority[option]}</option>
              ))}
            </select>
          </label>
          <label>
            {tr('Status', 'Status')}
            <select value={status} onChange={(event) => setStatus(event.target.value as PlannerStatus)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{labels.status[option]}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {tr('Tags', 'Tags')}
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="Bug, Feature, UI"
          />
          <small>{tr('Mehrere Tags mit Kommas trennen.', 'Separate multiple tags with commas.')}</small>
        </label>
      </div>
    </DialogFrame>
  );
};

type MaterializeDialogProps = {
  open: boolean;
  project: PlannerProject | null;
  parentDirectory: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (folderName: string) => Promise<void>;
};

const suggestedFolderName = (name: string): string => (
  name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[. -]+$/g, '')
    .slice(0, 100)
);

export const MaterializeDialog: React.FC<MaterializeDialogProps> = ({
  open,
  project,
  parentDirectory,
  busy,
  onClose,
  onSubmit,
}) => {
  const { tr } = useI18n();
  const [folderName, setFolderName] = React.useState('');

  React.useEffect(() => {
    if (open) setFolderName(suggestedFolderName(project?.name || ''));
  }, [open, project]);

  const submit = () => {
    if (!folderName.trim() || busy) return;
    void onSubmit(folderName.trim());
  };

  return (
    <DialogFrame
      open={open}
      title={tr('Projekt als Repository starten', 'Start project as repository')}
      onClose={onClose}
      onConfirm={submit}
      onEnter={submit}
      confirmLabel={tr('Ordner erstellen und git init', 'Create folder and run git init')}
      confirmDisabled={!folderName.trim() || busy}
    >
      <div className="planner-dialog-form">
        <div className="planner-materialize-path">
          <span>{tr('Zielverzeichnis', 'Parent directory')}</span>
          <code>{parentDirectory}</code>
        </div>
        <label>
          {tr('Neuer Projektordner', 'New project folder')}
          <input
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            maxLength={100}
          />
        </label>
        <p className="planner-dialog-note">
          {tr(
            'Der Ordner wird neu angelegt, darin wird Git initialisiert. Alle bisherigen Eintraege bleiben diesem Projekt zugeordnet.',
            'The folder will be created and Git initialized inside it. All existing items remain assigned to this project.',
          )}
        </p>
      </div>
    </DialogFrame>
  );
};
