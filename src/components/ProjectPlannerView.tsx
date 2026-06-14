import React from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CircleDot,
  FolderGit2,
  Lightbulb,
  Pencil,
  Plus,
  Rocket,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import { EmptyState } from './EmptyState';
import { useProjectPlanner } from '../contexts/ProjectPlannerContext';
import { useI18n } from '../i18n';
import { PlannerItem, PlannerPriority, PlannerStatus } from '../types/projectPlanner';
import {
  ItemDialog,
  MaterializeDialog,
  PRIORITY_OPTIONS,
  ProjectDialog,
  STATUS_OPTIONS,
  usePlannerLabels,
} from './project-planner/PlannerDialogs';

const statusIcons: Record<PlannerStatus, React.ReactNode> = {
  idea: <Lightbulb size={14} />,
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
    loading,
    busy,
    error,
    createProject,
    updateProject,
    createItem,
    updateItem,
    materializeProject,
    requestCreateProject,
    requestDeleteProject,
    requestDeleteItem,
  } = useProjectPlanner();
  const { tr } = useI18n();
  const labels = usePlannerLabels();
  const [search, setSearch] = React.useState('');
  const [priorityFilter, setPriorityFilter] = React.useState<PlannerPriority | 'all'>('all');
  const [statusFilter, setStatusFilter] = React.useState<PlannerStatus | 'all'>('all');
  const [tagFilter, setTagFilter] = React.useState('all');
  const [projectDialogOpen, setProjectDialogOpen] = React.useState(false);
  const [editingProject, setEditingProject] = React.useState(false);
  const [itemDialogOpen, setItemDialogOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<PlannerItem | null>(null);
  const [materializeParent, setMaterializeParent] = React.useState<string | null>(null);
  const handledCreateProjectRequestRef = React.useRef(0);

  React.useEffect(() => {
    if (
      createProjectRequestId === 0
      || createProjectRequestId === handledCreateProjectRequestRef.current
    ) {
      return;
    }
    handledCreateProjectRequestRef.current = createProjectRequestId;
    setEditingProject(false);
    setProjectDialogOpen(true);
  }, [createProjectRequestId]);

  React.useEffect(() => {
    setSearch('');
    setPriorityFilter('all');
    setStatusFilter('all');
    setTagFilter('all');
  }, [selectedProject?.id]);

  const allTags = React.useMemo(() => (
    Array.from(new Set(itemsForSelectedProject.flatMap((item) => item.tags)))
      .sort((a, b) => a.localeCompare(b))
  ), [itemsForSelectedProject]);

  const filteredItems = React.useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return itemsForSelectedProject.filter((item) => {
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (tagFilter !== 'all' && !item.tags.includes(tagFilter)) return false;
      if (!query) return true;
      return [item.title, item.description, ...item.tags]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [itemsForSelectedProject, priorityFilter, search, statusFilter, tagFilter]);

  const openNewItem = () => {
    setEditingItem(null);
    setItemDialogOpen(true);
  };

  const handleSelectParent = async () => {
    if (!selectedProject || !window.electronAPI) return;
    const parentDirectory = await window.electronAPI.selectProjectParentDirectory();
    if (parentDirectory) setMaterializeParent(parentDirectory);
  };

  if (loading) {
    return <div className="planner-loading">{tr('Projektplanung wird geladen...', 'Loading project planning...')}</div>;
  }

  if (!selectedProject) {
    return (
      <div className="project-planner-view">
        {error && <div className="planner-error">{error}</div>}
        <EmptyState
          icon={<Lightbulb size={42} />}
          title={tr('Noch kein Projekt vorhanden', 'No project yet')}
          description={tr(
            'Lege eine zukuenftige Projektidee an oder oeffne ein Repository.',
            'Create a future project idea or open a repository.',
          )}
          action={{
            label: tr('Projektidee anlegen', 'Create project idea'),
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
              ? tr('Zukuenftiges Projekt', 'Future project')
              : tr('Repository-Projekt', 'Repository project')}
          </div>
          <h1>{selectedProject.name}</h1>
          <p>
            {selectedProject.description
              || (selectedProject.repoPath
                ? selectedProject.repoPath
                : tr('Sammle Ideen und forme daraus den naechsten Entwicklungsschritt.', 'Collect ideas and turn them into the next development step.'))}
          </p>
        </div>
        <div className="planner-hero-actions">
          <button
            className="planner-btn planner-btn-secondary"
            onClick={requestCreateProject}
            disabled={busy}
          >
            <Plus size={14} /> {tr('Neues Projekt', 'New project')}
          </button>
          <button
            className="planner-btn planner-btn-secondary"
            onClick={() => {
              setEditingProject(true);
              setProjectDialogOpen(true);
            }}
          >
            <Pencil size={14} /> {tr('Projekt bearbeiten', 'Edit project')}
          </button>
          {selectedProject.kind === 'planned' && (
            <button className="planner-btn planner-btn-secondary" onClick={() => void handleSelectParent()} disabled={busy}>
              <Rocket size={14} /> {tr('Repository starten', 'Start repository')}
            </button>
          )}
          <button className="planner-btn planner-btn-primary" onClick={openNewItem} disabled={busy}>
            <Plus size={15} /> {tr('Neuer Eintrag', 'New item')}
          </button>
        </div>
      </header>

      <div className="planner-toolbar">
        <label className="planner-search">
          <Search size={14} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr('Eintraege durchsuchen...', 'Search items...')}
          />
        </label>
        <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PlannerPriority | 'all')}>
          <option value="all">{tr('Alle Dringlichkeiten', 'All priorities')}</option>
          {PRIORITY_OPTIONS.map((priority) => (
            <option key={priority} value={priority}>{labels.priority[priority]}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PlannerStatus | 'all')}>
          <option value="all">{tr('Alle Status', 'All statuses')}</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{labels.status[status]}</option>
          ))}
        </select>
        <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
          <option value="all">{tr('Alle Tags', 'All tags')}</option>
          {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select>
        <span className="planner-result-count">
          {filteredItems.length}/{itemsForSelectedProject.length}
        </span>
      </div>

      {error && <div className="planner-error">{error}</div>}

      <div className="planner-board">
        {STATUS_OPTIONS.map((status) => {
          const statusItems = filteredItems.filter((item) => item.status === status);
          return (
            <section key={status} className={`planner-column planner-column-${status}`}>
              <div className="planner-column-header">
                <span>{statusIcons[status]} {labels.status[status]}</span>
                <strong>{statusItems.length}</strong>
              </div>
              <div className="planner-column-list">
                {statusItems.map((item) => (
                  <article
                    key={item.id}
                    className={`planner-card planner-priority-${item.priority}`}
                    onClick={() => {
                      setEditingItem(item);
                      setItemDialogOpen(true);
                    }}
                  >
                    <div className="planner-card-header">
                      <span className={`planner-priority-badge ${item.priority}`}>
                        {labels.priority[item.priority]}
                      </span>
                      <button
                        className="planner-card-delete"
                        title={tr('Eintrag loeschen', 'Delete item')}
                        onClick={(event) => {
                          event.stopPropagation();
                          requestDeleteItem(item.id);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <h3>{item.title}</h3>
                    {item.description && <p>{item.description}</p>}
                    {item.tags.length > 0 && (
                      <div className="planner-card-tags">
                        {item.tags.map((tag) => <span key={tag}><Tag size={10} /> {tag}</span>)}
                      </div>
                    )}
                    <select
                      value={item.status}
                      aria-label={tr('Status aendern', 'Change status')}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        event.stopPropagation();
                        void updateItem(item.id, { status: event.target.value as PlannerStatus });
                      }}
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>{labels.status[option]}</option>
                      ))}
                    </select>
                  </article>
                ))}
                {statusItems.length === 0 && (
                  <button className="planner-column-empty" onClick={openNewItem}>
                    <Plus size={13} /> {tr('Eintrag hinzufuegen', 'Add item')}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="planner-footer">
        <button
          className="planner-danger-link"
          onClick={() => requestDeleteProject(selectedProject.id)}
          disabled={busy}
        >
          <Archive size={13} />
          {tr('Planungsdaten dieses Projekts loeschen', 'Delete this project planning data')}
        </button>
        <button
          className="planner-link"
          onClick={requestCreateProject}
        >
          <Plus size={13} /> {tr('Zukuenftiges Projekt anlegen', 'Create future project')}
        </button>
      </footer>

      <ProjectDialog
        open={projectDialogOpen}
        project={editingProject ? selectedProject : null}
        busy={busy}
        onClose={() => setProjectDialogOpen(false)}
        onSubmit={async (input) => {
          const ok = editingProject
            ? await updateProject(selectedProject.id, input)
            : Boolean(await createProject(input));
          if (ok) setProjectDialogOpen(false);
        }}
      />

      <ItemDialog
        open={itemDialogOpen}
        item={editingItem}
        busy={busy}
        onClose={() => setItemDialogOpen(false)}
        onSubmit={async (input) => {
          const ok = editingItem
            ? await updateItem(editingItem.id, input)
            : await createItem(selectedProject.id, input);
          if (ok) setItemDialogOpen(false);
        }}
      />

      <MaterializeDialog
        open={Boolean(materializeParent)}
        project={selectedProject}
        parentDirectory={materializeParent || ''}
        busy={busy}
        onClose={() => setMaterializeParent(null)}
        onSubmit={async (folderName) => {
          if (!materializeParent) return;
          const ok = await materializeProject(selectedProject.id, materializeParent, folderName);
          if (ok) setMaterializeParent(null);
        }}
      />
    </div>
  );
};
