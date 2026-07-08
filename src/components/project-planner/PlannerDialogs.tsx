import React from 'react';
import { DialogFrame } from '@/components/DialogFrame';
import { useI18n } from '@/i18n';
import type { PlannerItem, PlannerItemInput, PlannerPriority, PlannerProject, PlannerProjectInput, PlannerStatus } from '@/types/projectPlanner';

export const PRIORITY_OPTIONS: PlannerPriority[] = ['low', 'medium', 'high', 'urgent'];
export const STATUS_OPTIONS: PlannerStatus[] = ['idea', 'bug', 'planned', 'in-progress', 'blocked', 'done'];

export const usePlannerLabels = () => {
  const { t } = useI18n();
  return {
    priority: {
      low: t('generated.components.layout.sidebar.settingssidebarcontent.low_2022a61e'),
      medium: t('generated.components.layout.sidebar.settingssidebarcontent.medium_6e6180fd'),
      high: t('generated.components.layout.sidebar.settingssidebarcontent.high_6d0c6aff'),
      urgent: t('generated.components.project_planner.plannerdialogs.urgent_1e7d8210'),
    } satisfies Record<PlannerPriority, string>,
    status: {
      idea: t('generated.components.project_planner.plannerdialogs.idea_8f08cc5e'),
      bug: t('generated.components.project_planner.plannerdialogs.bug_970a244c'),
      planned: t('generated.components.project_planner.plannerdialogs.planned_2c496928'),
      'in-progress': t('generated.components.project_planner.plannerdialogs.in_progress_ba4f6a4f'),
      blocked: t('generated.components.project_planner.plannerdialogs.blocked_eaee57eb'),
      done: t('generated.components.project_planner.plannerdialogs.done_ee246846'),
    } satisfies Record<PlannerStatus, string>,
  };
};

type ProjectDialogProps = {
  open: boolean;
  project?: PlannerProject | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: PlannerProjectInput) => Promise<void>;
  onDelete?: () => void;
};

export const ProjectDialog: React.FC<ProjectDialogProps> = ({ open, project, busy, onClose, onSubmit, onDelete }) => {
  const { t } = useI18n();
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
      title={
        project
          ? t('generated.components.project_planner.plannerdialogs.edit_project_624b2ea6')
          : t('generated.components.project_planner.plannerdialogs.create_future_project_293a417d')
      }
      onClose={onClose}
      onConfirm={submit}
      onEnter={submit}
      confirmLabel={project ? t('generated.components.input.save_b6a0ea4a') : t('generated.components.project_planner.plannerdialogs.create_project_244f58ca')}
      confirmDisabled={!name.trim() || busy}
      onSecondaryAction={project && onDelete ? onDelete : undefined}
      secondaryActionLabel={
        project?.kind === 'planned'
          ? t('generated.components.project_planner.plannerdialogs.delete_project_idea_b471802f')
          : t('generated.components.project_planner.plannerdialogs.delete_planning_data_2c761284')
      }
      secondaryActionVariant="danger"
    >
      <div className="planner-dialog-form">
        <label>
          {t('generated.components.project_planner.plannerdialogs.project_name_fb06a7bb')}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('generated.components.project_planner.plannerdialogs.for_example_mobile_companion_app_9f18678f')}
            maxLength={160}
          />
        </label>
        <label>
          {t('generated.components.commitdetails.description_3f0f0c88')}
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('generated.components.project_planner.plannerdialogs.vision_audience_or_initial_guardrails_8d681fc0')}
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
  defaultStatus?: PlannerStatus;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: PlannerItemInput) => Promise<void>;
};

export const ItemDialog: React.FC<ItemDialogProps> = ({ open, item, defaultStatus = 'idea', busy, onClose, onSubmit }) => {
  const { t } = useI18n();
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
    setStatus(item?.status || defaultStatus);
    setTags(item?.tags.join(', ') || '');
  }, [defaultStatus, item, open]);

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
      title={
        item
          ? t('generated.components.project_planner.plannerdialogs.edit_item_5d102720')
          : t('generated.components.project_planner.plannerdialogs.create_item_9a1874f7')
      }
      onClose={onClose}
      onConfirm={submit}
      onEnter={submit}
      confirmLabel={item ? t('generated.components.input.save_b6a0ea4a') : t('generated.components.project_planner.plannerdialogs.create_item_c50c05a1')}
      confirmDisabled={!title.trim() || busy}
    >
      <div className="planner-dialog-form">
        <label>
          {t('generated.components.project_planner.plannerdialogs.title_e7ae79b8')}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('generated.components.project_planner.plannerdialogs.what_needs_to_be_done_or_captured_812c2844')}
            maxLength={240}
          />
        </label>
        <label>
          {t('generated.components.project_planner.plannerdialogs.description_927bf8ec')}
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('generated.components.project_planner.plannerdialogs.context_acceptance_criteria_open_questions_0952dcde')}
            rows={7}
            maxLength={20000}
          />
        </label>
        <div className="planner-dialog-grid">
          <label>
            {t('generated.components.project_planner.plannerdialogs.priority_f20eedda')}
            <select value={priority} onChange={(event) => setPriority(event.target.value as PlannerPriority)}>
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {labels.priority[option]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('generated.components.layout.apimcpsettingspanel.status_b853ab43')}
            <select value={status} onChange={(event) => setStatus(event.target.value as PlannerStatus)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {labels.status[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t('generated.components.project_planner.plannerdialogs.tags_d3c9e52d')}
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Bug, Feature, UI" />
          <small>{t('generated.components.project_planner.plannerdialogs.separate_multiple_tags_with_commas_94bb76c8')}</small>
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

const suggestedFolderName = (name: string): string =>
  name
    .trim()
    // eslint-disable-next-line no-control-regex -- Windows folder names must reject ASCII control characters.
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[. -]+$/g, '')
    .slice(0, 100);

export const MaterializeDialog: React.FC<MaterializeDialogProps> = ({ open, project, parentDirectory, busy, onClose, onSubmit }) => {
  const { t } = useI18n();
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
      title={t('generated.components.project_planner.plannerdialogs.start_project_as_repository_2d895341')}
      onClose={onClose}
      onConfirm={submit}
      onEnter={submit}
      confirmLabel={t('generated.components.project_planner.plannerdialogs.create_folder_and_run_git_init_f47f7430')}
      confirmDisabled={!folderName.trim() || busy}
    >
      <div className="planner-dialog-form">
        <div className="planner-materialize-path">
          <span>{t('generated.components.project_planner.plannerdialogs.parent_directory_fc09e1a6')}</span>
          <code>{parentDirectory}</code>
        </div>
        <label>
          {t('generated.components.project_planner.plannerdialogs.new_project_folder_933846ff')}
          <input value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={100} />
        </label>
        <p className="planner-dialog-note">
          {t('generated.components.project_planner.plannerdialogs.the_folder_will_be_created_and_git_initialized_inside_it_b120d566')}
        </p>
      </div>
    </DialogFrame>
  );
};
