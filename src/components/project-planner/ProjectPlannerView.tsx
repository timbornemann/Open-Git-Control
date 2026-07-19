import React from 'react';
import { AlertTriangle, Bug, CheckCircle2, CircleDot, Copy, FolderGit2, Lightbulb, Pencil, Plus, Rocket, Search, Sparkles, Tag } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { useSettingsContext, useUIContext } from '@/contexts/AppStateContext';
import { useProjectPlanner } from '@/contexts/ProjectPlannerContext';
import { useI18n } from '@/i18n';
import type { PlannerItem, PlannerPriority, PlannerStatus } from '@/types/projectPlanner';
import { ItemDialog, MaterializeDialog, PRIORITY_OPTIONS, ProjectDialog, STATUS_OPTIONS, usePlannerLabels } from './PlannerDialogs';
import { appClient } from '@/services/appClient';
import { usePlannerAiActions, type PlannerCommitMessageItem } from './usePlannerAiActions';
import { PlannerItemContextMenu, type PlannerItemContextMenuState } from './PlannerItemContextMenu';
import '@/styles/project-planner.css';

const statusIcons: Record<PlannerStatus, React.ReactNode> = {
  idea: <Lightbulb size={14} />,
  bug: <Bug size={14} />,
  planned: <CircleDot size={14} />,
  'in-progress': <Rocket size={14} />,
  blocked: <AlertTriangle size={14} />,
  done: <CheckCircle2 size={14} />,
};

export const ProjectPlannerView: React.FC = () => {
  const {
    selectedProject,
    itemsForSelectedProject,
    createProjectRequestId,
    projectActionRequest,
    loading,
    busy,
    createProject,
    updateProject,
    createItem,
    updateItem,
    materializeProject,
    requestCreateProject,
    requestDeleteProject,
    requestDeleteItem,
    activateRepositoryProject,
    notify,
  } = useProjectPlanner();
  const { t, tr } = useI18n();
  const settingsState = useSettingsContext();
  const { setConfirmDialog } = useUIContext();
  const labels = usePlannerLabels();
  const [search, setSearch] = React.useState('');
  const [priorityFilter, setPriorityFilter] = React.useState<PlannerPriority | 'all'>('all');
  const [statusFilter, setStatusFilter] = React.useState<PlannerStatus | 'all'>('all');
  const [tagFilter, setTagFilter] = React.useState('all');
  const [projectDialogOpen, setProjectDialogOpen] = React.useState(false);
  const [editingProject, setEditingProject] = React.useState(false);
  const [itemDialogOpen, setItemDialogOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<PlannerItem | null>(null);
  const [newItemStatus, setNewItemStatus] = React.useState<PlannerStatus>('idea');
  const [itemContextMenu, setItemContextMenu] = React.useState<PlannerItemContextMenuState | null>(null);
  const [materializeParent, setMaterializeParent] = React.useState<string | null>(null);
  const handledCreateProjectRequestRef = React.useRef(createProjectRequestId);
  const handledProjectActionRequestRef = React.useRef(projectActionRequest?.requestId || 0);
  const selectedProjectIdRef = React.useRef(selectedProject?.id || null);
  const projectDialogProjectIdRef = React.useRef<string | null>(null);
  const itemDialogProjectIdRef = React.useRef<string | null>(null);
  const materializeProjectIdRef = React.useRef<string | null>(null);
  const markItemsDone = React.useCallback(
    async (items: PlannerCommitMessageItem[]) => {
      for (const item of items) {
        if (item.id && (item.persistedStatus ?? item.status) !== 'done') {
          await updateItem(item.id, { status: 'done' });
        }
      }
    },
    [updateItem],
  );
  const plannerAiActions = usePlannerAiActions({
    project: selectedProject,
    settings: settingsState.settings,
    activateRepositoryProject,
    markItemsDone,
    notify,
    setConfirmDialog,
  });
  selectedProjectIdRef.current = selectedProject?.id || null;

  React.useEffect(() => {
    if (createProjectRequestId === 0 || createProjectRequestId === handledCreateProjectRequestRef.current) {
      return;
    }
    handledCreateProjectRequestRef.current = createProjectRequestId;
    projectDialogProjectIdRef.current = null;
    setEditingProject(false);
    setProjectDialogOpen(true);
  }, [createProjectRequestId]);

  React.useEffect(() => {
    if (!projectActionRequest || projectActionRequest.requestId === handledProjectActionRequestRef.current) return;
    handledProjectActionRequestRef.current = projectActionRequest.requestId;
    if (projectActionRequest.action === 'create-item') {
      itemDialogProjectIdRef.current = projectActionRequest.projectId;
      setEditingItem(null);
      setNewItemStatus('idea');
      setItemDialogOpen(true);
      return;
    }

    projectDialogProjectIdRef.current = projectActionRequest.projectId;
    setEditingProject(true);
    setProjectDialogOpen(true);
  }, [projectActionRequest]);

  React.useLayoutEffect(() => {
    setSearch('');
    setPriorityFilter('all');
    setStatusFilter('all');
    setTagFilter('all');
    setProjectDialogOpen(false);
    setEditingProject(false);
    setItemDialogOpen(false);
    setEditingItem(null);
    setItemContextMenu(null);
    setMaterializeParent(null);
    projectDialogProjectIdRef.current = null;
    itemDialogProjectIdRef.current = null;
    materializeProjectIdRef.current = null;
  }, [selectedProject?.id]);

  const allTags = React.useMemo(
    () => Array.from(new Set(itemsForSelectedProject.flatMap((item) => item.tags))).sort((a, b) => a.localeCompare(b)),
    [itemsForSelectedProject],
  );

  const filteredItems = React.useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return itemsForSelectedProject.filter((item) => {
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (tagFilter !== 'all' && !item.tags.includes(tagFilter)) return false;
      if (!query) return true;
      return [item.title, item.description, ...item.tags].some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [itemsForSelectedProject, priorityFilter, search, statusFilter, tagFilter]);

  const liveEditingItem = React.useMemo(
    () => (editingItem ? itemsForSelectedProject.find((item) => item.id === editingItem.id) || null : null),
    [editingItem, itemsForSelectedProject],
  );

  React.useLayoutEffect(() => {
    if (!itemDialogOpen || !editingItem) return;
    const projectId = itemDialogProjectIdRef.current;
    // An external API/MCP update may edit or move the item while this dialog
    // contains an older draft. Close it instead of silently overwriting newer
    // data with stale form fields.
    if (!liveEditingItem || liveEditingItem.projectId !== projectId || liveEditingItem.updatedAt !== editingItem.updatedAt) {
      itemDialogProjectIdRef.current = null;
      setItemDialogOpen(false);
      setEditingItem(null);
    }
  }, [editingItem, itemDialogOpen, liveEditingItem]);

  const openNewItem = (status: PlannerStatus = 'idea') => {
    itemDialogProjectIdRef.current = selectedProjectIdRef.current;
    setEditingItem(null);
    setNewItemStatus(status);
    setItemDialogOpen(true);
  };

  const handleSelectParent = async () => {
    if (!selectedProject || !appClient.isAvailable()) return;
    const projectId = selectedProject.id;
    const parentDirectory = await appClient.selectProjectParentDirectory();
    if (selectedProjectIdRef.current === projectId && parentDirectory) {
      materializeProjectIdRef.current = projectId;
      setMaterializeParent(parentDirectory);
    }
  };

  if (loading) {
    return <div className="planner-loading">{t('generated.components.project_planner.projectplannersidebarcontent.loading_project_planning_77574995')}</div>;
  }

  if (!selectedProject) {
    return (
      <div className="project-planner-view">
        <EmptyState
          icon={<Lightbulb size={42} />}
          title={t('generated.components.project_planner.projectplannerview.no_project_yet_bd4bb891')}
          description={t('generated.components.project_planner.projectplannerview.create_a_future_project_idea_or_open_a_repository_4dc6e28f')}
          action={{
            label: t('generated.components.project_planner.projectplannerview.create_project_idea_1befeb81'),
            onClick: requestCreateProject,
          }}
        />
        <ProjectDialog
          open={projectDialogOpen}
          busy={busy}
          onClose={() => setProjectDialogOpen(false)}
          onSubmit={async (input) => {
            const created = await createProject(input);
            if (created) setProjectDialogOpen(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="project-planner-view">
      <header className="planner-hero">
        <div className="planner-hero-copy">
          <div className="planner-project-kind">
            {selectedProject.kind === 'planned' ? <Lightbulb size={14} /> : <FolderGit2 size={14} />}
            {selectedProject.kind === 'planned'
              ? t('generated.components.project_planner.projectplannerview.future_project_fcee88b5')
              : t('generated.components.project_planner.projectplannerview.repository_project_3cee5d74')}
          </div>
          <h1>{selectedProject.name}</h1>
          <p>
            {selectedProject.description ||
              (selectedProject.repoPath
                ? selectedProject.repoPath
                : t('generated.components.project_planner.projectplannerview.collect_ideas_and_turn_them_into_the_next_development_st_bef17224'))}
          </p>
        </div>
        <div className="planner-hero-actions">
          <button
            className="planner-btn planner-btn-secondary"
            onClick={() => {
              projectDialogProjectIdRef.current = selectedProject.id;
              setEditingProject(true);
              setProjectDialogOpen(true);
            }}
          >
            <Pencil size={14} /> {t('generated.components.project_planner.plannerdialogs.edit_project_624b2ea6')}
          </button>
          {selectedProject.kind === 'planned' && (
            <button className="planner-btn planner-btn-secondary" onClick={() => void handleSelectParent()} disabled={busy}>
              <Rocket size={14} /> {t('generated.components.project_planner.projectplannerview.start_repository_28af9dd3')}
            </button>
          )}
          <button className="planner-btn planner-btn-primary" onClick={() => openNewItem()} disabled={busy}>
            <Plus size={15} /> {t('generated.components.project_planner.projectplannerview.new_item_bd553a03')}
          </button>
        </div>
      </header>

      <div className="planner-toolbar">
        <label className="planner-search">
          <Search size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('generated.components.project_planner.projectplannerview.search_items_31c15ae9')}
          />
        </label>
        <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PlannerPriority | 'all')}>
          <option value="all">{t('generated.components.project_planner.projectplannerview.all_priorities_cd27ede5')}</option>
          {PRIORITY_OPTIONS.map((priority) => (
            <option key={priority} value={priority}>
              {labels.priority[priority]}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PlannerStatus | 'all')}>
          <option value="all">{t('generated.components.project_planner.projectplannerview.all_statuses_f6555111')}</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {labels.status[status]}
            </option>
          ))}
        </select>
        <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
          <option value="all">{t('generated.components.project_planner.projectplannerview.all_tags_ab4762d7')}</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <span className="planner-result-count">
          {filteredItems.length}/{itemsForSelectedProject.length}
        </span>
      </div>

      <div className="planner-board">
        {STATUS_OPTIONS.map((status) => {
          const statusItems = filteredItems.filter((item) => item.status === status);
          return (
            <section key={status} className={`planner-column planner-column-${status}`}>
              <div className="planner-column-header">
                <span>
                  {statusIcons[status]} {labels.status[status]}
                </span>
                <div className="planner-column-header-actions">
                  <strong>{statusItems.length}</strong>
                  <button
                    className="planner-column-add"
                    onClick={() => void plannerAiActions.copyStatusPrompt(statusItems)}
                    disabled={statusItems.length === 0}
                    title={tr(
                      `Sichtbare Eintraege aus "${labels.status[status]}" als Agent-Prompt kopieren`,
                      `Copy visible "${labels.status[status]}" items as an agent prompt`,
                    )}
                    aria-label={tr(`Agent-Prompt fuer "${labels.status[status]}" kopieren`, `Copy agent prompt for "${labels.status[status]}"`)}
                  >
                    <Copy size={13} />
                  </button>
                  {selectedProject.repoPath && (
                    <button
                      className="planner-column-add"
                      onClick={() => plannerAiActions.generateCommitMessageForStatus(statusItems)}
                      disabled={statusItems.length === 0 || plannerAiActions.isAiCommitGenerating}
                      title={tr(
                        `KI-Commit-Nachricht aus sichtbaren Eintraegen in "${labels.status[status]}" erstellen`,
                        `Create an AI commit message from visible "${labels.status[status]}" items`,
                      )}
                      aria-label={tr(
                        `KI-Commit-Nachricht fuer "${labels.status[status]}" erstellen`,
                        `Create AI commit message for "${labels.status[status]}"`,
                      )}
                    >
                      <Sparkles size={13} />
                    </button>
                  )}
                  <button
                    className="planner-column-add"
                    onClick={() => openNewItem(status)}
                    disabled={busy}
                    title={tr(`Eintrag in "${labels.status[status]}" anlegen`, `Create item in "${labels.status[status]}"`)}
                    aria-label={tr(`Eintrag in "${labels.status[status]}" anlegen`, `Create item in "${labels.status[status]}"`)}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
              <div className="planner-column-list">
                {statusItems.map((item) => (
                  <article
                    key={item.id}
                    className={`planner-card planner-priority-${item.priority}`}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setItemContextMenu({ x: event.clientX, y: event.clientY, item });
                    }}
                    onClick={() => {
                      itemDialogProjectIdRef.current = selectedProject.id;
                      setEditingItem(item);
                      setItemDialogOpen(true);
                    }}
                  >
                    <div className="planner-card-header">
                      <span className={`planner-priority-badge ${item.priority}`}>{labels.priority[item.priority]}</span>
                    </div>
                    <h3>{item.title}</h3>
                    {item.description && <p>{item.description}</p>}
                    {item.tags.length > 0 && (
                      <div className="planner-card-tags">
                        {item.tags.map((tag) => (
                          <span key={tag}>
                            <Tag size={10} /> {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
                {statusItems.length === 0 && (
                  <button className="planner-column-empty" onClick={() => openNewItem(status)}>
                    <Plus size={13} /> {t('generated.components.project_planner.projectplannerview.add_item_d9f7598d')}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <PlannerItemContextMenu
        contextMenu={itemContextMenu}
        busy={busy}
        canGenerateCommitMessage={Boolean(selectedProject.repoPath)}
        isAiCommitGenerating={plannerAiActions.isAiCommitGenerating}
        onClose={() => setItemContextMenu(null)}
        onCopyAgentPrompt={(item) => void plannerAiActions.copyItemPrompt(item)}
        onGenerateCommitMessage={(item) => plannerAiActions.generateCommitMessageForItem(item)}
        onChangePriority={(itemId, priority) => void updateItem(itemId, { priority })}
        onChangeStatus={(itemId, status) => void updateItem(itemId, { status })}
        onDelete={requestDeleteItem}
      />

      <ProjectDialog
        open={projectDialogOpen}
        project={editingProject ? selectedProject : null}
        busy={busy}
        onClose={() => {
          projectDialogProjectIdRef.current = null;
          setProjectDialogOpen(false);
        }}
        onDelete={
          editingProject
            ? () => {
                const projectId = projectDialogProjectIdRef.current;
                if (!projectId || projectId !== selectedProjectIdRef.current) return;
                projectDialogProjectIdRef.current = null;
                setProjectDialogOpen(false);
                requestDeleteProject(projectId);
              }
            : undefined
        }
        onSubmit={async (input) => {
          const projectId = projectDialogProjectIdRef.current;
          if (editingProject && (!projectId || projectId !== selectedProjectIdRef.current)) return;
          const ok = editingProject ? await updateProject(projectId!, input) : Boolean(await createProject(input));
          if (ok) {
            projectDialogProjectIdRef.current = null;
            setProjectDialogOpen(false);
          }
        }}
      />

      <ItemDialog
        open={itemDialogOpen}
        item={editingItem}
        defaultStatus={newItemStatus}
        busy={busy}
        onClose={() => {
          itemDialogProjectIdRef.current = null;
          setItemDialogOpen(false);
        }}
        onSubmit={async (input) => {
          const projectId = itemDialogProjectIdRef.current;
          if (!projectId || projectId !== selectedProjectIdRef.current) return;
          if (editingItem && (!liveEditingItem || liveEditingItem.projectId !== projectId || liveEditingItem.updatedAt !== editingItem.updatedAt)) {
            itemDialogProjectIdRef.current = null;
            setItemDialogOpen(false);
            setEditingItem(null);
            return;
          }
          const ok = editingItem ? await updateItem(editingItem.id, input) : await createItem(projectId, input);
          if (ok) {
            itemDialogProjectIdRef.current = null;
            setItemDialogOpen(false);
          }
        }}
        onCopyAgentPrompt={(item) => void plannerAiActions.copyItemPrompt(item)}
        onGenerateCommitMessage={selectedProject.repoPath ? (item) => plannerAiActions.generateCommitMessageForItem(item) : undefined}
        isAiCommitGenerating={plannerAiActions.isAiCommitGenerating}
      />

      <MaterializeDialog
        open={Boolean(materializeParent)}
        project={selectedProject}
        parentDirectory={materializeParent || ''}
        busy={busy}
        onClose={() => {
          materializeProjectIdRef.current = null;
          setMaterializeParent(null);
        }}
        onSubmit={async (folderName) => {
          const projectId = materializeProjectIdRef.current;
          if (!materializeParent || !projectId || projectId !== selectedProjectIdRef.current) return;
          const ok = await materializeProject(projectId, materializeParent, folderName);
          if (ok) {
            materializeProjectIdRef.current = null;
            setMaterializeParent(null);
          }
        }}
      />
    </div>
  );
};
