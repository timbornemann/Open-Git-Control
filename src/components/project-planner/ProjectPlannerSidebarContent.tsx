import React from 'react';
import { FolderGit2, Lightbulb, Plus, Trash2 } from 'lucide-react';
import { useProjectPlanner } from '@/contexts/ProjectPlannerContext';
import { useI18n } from '@/i18n';
import '@/styles/project-planner.css';

export const ProjectPlannerSidebarContent: React.FC = () => {
  const { data, selectedProjectId, selectProject, loading, busy, requestCreateProject, requestDeleteProject } = useProjectPlanner();
  const { t, tr } = useI18n();

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
    <div key={project.id} className={`planner-sidebar-project-row ${selectedProjectId === project.id ? 'active' : ''}`}>
      <button className="planner-sidebar-project" onClick={() => selectProject(project.id)} title={project.repoPath || project.name}>
        <span className="planner-sidebar-project-icon">{project.kind === 'planned' ? <Lightbulb size={14} /> : <FolderGit2 size={14} />}</span>
        <span className="planner-sidebar-project-copy">
          <strong>{project.name}</strong>
          <small>
            {itemCountByProject.get(project.id) || 0} {t('generated.components.project_planner.projectplannersidebarcontent.items_8845c47b')}
          </small>
        </span>
      </button>
      {project.kind === 'planned' && (
        <button
          className="planner-sidebar-project-delete"
          onClick={() => requestDeleteProject(project.id)}
          title={t('generated.components.project_planner.plannerdialogs.delete_project_idea_b471802f')}
          aria-label={tr(`Projektidee ${project.name} loeschen`, `Delete project idea ${project.name}`)}
          disabled={busy}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="planner-sidebar-empty">{t('generated.components.project_planner.projectplannersidebarcontent.loading_project_planning_77574995')}</div>
    );
  }

  return (
    <div className="planner-sidebar-content">
      <section className="planner-sidebar-section">
        <div className="planner-sidebar-section-heading">
          <div className="planner-sidebar-section-title">{t('generated.components.project_planner.projectplannersidebarcontent.future_projects_b6bb9724')}</div>
          <button
            className="planner-sidebar-add-project"
            onClick={requestCreateProject}
            title={t('generated.components.project_planner.plannerdialogs.create_future_project_293a417d')}
            aria-label={t('generated.components.project_planner.plannerdialogs.create_future_project_293a417d')}
          >
            <Plus size={14} />
          </button>
        </div>
        {plannedProjects.length > 0 ? (
          plannedProjects.map(renderProject)
        ) : (
          <button className="planner-sidebar-empty-action" onClick={requestCreateProject}>
            <Plus size={13} />
            {t('generated.components.project_planner.projectplannersidebarcontent.create_first_project_idea_f9346c77')}
          </button>
        )}
      </section>

      <section className="planner-sidebar-section">
        <div className="planner-sidebar-section-title">{t('generated.components.project_planner.projectplannersidebarcontent.repositories_1c8342c2')}</div>
        {repositoryProjects.length > 0 ? (
          repositoryProjects.map(renderProject)
        ) : (
          <div className="planner-sidebar-empty">{t('generated.components.project_planner.projectplannersidebarcontent.no_repository_assigned_0fef515d')}</div>
        )}
      </section>
    </div>
  );
};
