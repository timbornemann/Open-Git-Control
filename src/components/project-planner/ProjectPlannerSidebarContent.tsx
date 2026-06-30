import React from 'react';
import { FolderGit2, Lightbulb, Plus, Trash2 } from 'lucide-react';
import { useProjectPlanner } from '../../contexts/ProjectPlannerContext';
import { useI18n } from '../../i18n';

export const ProjectPlannerSidebarContent: React.FC = () => {
  const {
    data,
    selectedProjectId,
    selectProject,
    loading,
    busy,
    requestCreateProject,
    requestDeleteProject,
  } = useProjectPlanner();
  const { tr } = useI18n();

  const itemCountByProject = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of data.items) {
      counts.set(item.projectId, (counts.get(item.projectId) || 0) + 1);
    }
    return counts;
  }, [data.items]);

  const plannedProjects = data.projects.filter((project) => project.kind === 'planned');
  const repositoryProjects = data.projects.filter((project) => project.kind === 'repository');

  const renderProject = (project: (typeof data.projects)[number]) => (
    <div
      key={project.id}
      className={`planner-sidebar-project-row ${selectedProjectId === project.id ? 'active' : ''}`}
    >
      <button
        className="planner-sidebar-project"
        onClick={() => selectProject(project.id)}
        title={project.repoPath || project.name}
      >
        <span className="planner-sidebar-project-icon">
          {project.kind === 'planned' ? <Lightbulb size={14} /> : <FolderGit2 size={14} />}
        </span>
        <span className="planner-sidebar-project-copy">
          <strong>{project.name}</strong>
          <small>
            {itemCountByProject.get(project.id) || 0}{' '}
            {tr('Eintraege', 'items')}
          </small>
        </span>
      </button>
      {project.kind === 'planned' && (
        <button
          className="planner-sidebar-project-delete"
          onClick={() => requestDeleteProject(project.id)}
          title={tr('Projektidee loeschen', 'Delete project idea')}
          aria-label={tr(`Projektidee ${project.name} loeschen`, `Delete project idea ${project.name}`)}
          disabled={busy}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );

  if (loading) {
    return <div className="planner-sidebar-empty">{tr('Projektplanung wird geladen...', 'Loading project planning...')}</div>;
  }

  return (
    <div className="planner-sidebar-content">
      <section className="planner-sidebar-section">
        <div className="planner-sidebar-section-heading">
          <div className="planner-sidebar-section-title">{tr('Zukuenftige Projekte', 'Future projects')}</div>
          <button
            className="planner-sidebar-add-project"
            onClick={requestCreateProject}
            title={tr('Zukuenftiges Projekt anlegen', 'Create future project')}
            aria-label={tr('Zukuenftiges Projekt anlegen', 'Create future project')}
          >
            <Plus size={14} />
          </button>
        </div>
        {plannedProjects.length > 0
          ? plannedProjects.map(renderProject)
          : (
            <button className="planner-sidebar-empty-action" onClick={requestCreateProject}>
              <Plus size={13} />
              {tr('Erste Projektidee anlegen', 'Create first project idea')}
            </button>
          )}
      </section>

      <section className="planner-sidebar-section">
        <div className="planner-sidebar-section-title">{tr('Repositories', 'Repositories')}</div>
        {repositoryProjects.length > 0
          ? repositoryProjects.map(renderProject)
          : <div className="planner-sidebar-empty">{tr('Kein Repository zugeordnet.', 'No repository assigned.')}</div>}
      </section>
    </div>
  );
};
