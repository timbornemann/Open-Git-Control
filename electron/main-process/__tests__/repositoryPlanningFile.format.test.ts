import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { check, format, getFileInfo, resolveConfig } from 'prettier';
import { readRepositoryPlanningFile, writeRepositoryPlanningFile } from '../repositoryPlanningFile';
import type { ProjectPlannerData } from '../../../src/types/projectPlanner';

const projectRoot = path.resolve(__dirname, '../../..');
const checkedInPath = path.join(projectRoot, '.Open-Git-Control', 'planning.json');
const prefix = path.join(os.tmpdir(), 'ogc-planning-format-');

describe('application-written planning files and the CI formatter', () => {
  let directory: string;
  let file: string;
  let data: ProjectPlannerData;
  beforeEach(() => {
    directory = fs.mkdtempSync(prefix);
    file = path.join(directory, '.Open-Git-Control', 'planning.json');
    fs.mkdirSync(path.dirname(file));
    data = {
      version: 1,
      projects: [{ id: 'project', name: 'Project', description: '', kind: 'repository', repoPath: directory, createdAt: 1, updatedAt: 1 }],
      items: [
        {
          id: 'todo',
          projectId: 'project',
          title: 'Aufgabe "prüfen"',
          description: 'Zeile eins\nZeile zwei: äöü',
          priority: 'medium',
          status: 'planned',
          tags: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
  });
  afterEach(() => {
    if (path.dirname(directory) !== path.dirname(prefix) || !path.basename(directory).startsWith(path.basename(prefix)))
      throw new Error('Unexpected fixture path.');
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const expectFormatted = async () => {
    const source = fs.readFileSync(file, 'utf8');
    const options = { ...(await resolveConfig(checkedInPath)), filepath: checkedInPath };
    expect(await check(source, options)).toBe(true);
    expect(await format(source, options)).toBe(source);
    expect(source.endsWith('\n')).toBe(true);
    return source;
  };

  it.each([
    { label: 'no tags', tags: [] },
    { label: 'one short tag', tags: ['Bug'] },
    { label: 'several short tags', tags: ['Bug', 'Planned'] },
    { label: 'a long tag list', tags: Array.from({ length: 20 }, (_, i) => `Tag with a longer name ${i}`) },
  ])('writes formatter-compatible JSON for $label', async ({ tags }) => {
    data.items[0].tags = tags;
    writeRepositoryPlanningFile(file, data);
    const source = await expectFormatted();
    const { repoPath: _localPath, ...project } = data.projects[0];
    expect(JSON.parse(source)).toEqual({ version: 1, projects: [project], items: data.items });
  });

  it('remains formatted when todos are added and edited while preserving shared workflow references', async () => {
    data.items[0].tags = ['Bug'];
    data.items[0].references = {
      activeWorkflowId: 'work',
      branches: [
        {
          id: 'work',
          projectId: 'project',
          name: 'feature/task',
          baseRef: 'refs/heads/main',
          baseSha: 'a'.repeat(40),
          startedAt: 1,
          automationPaused: false,
          previousNames: ['feature/old-name'],
        },
      ],
      pullRequests: [],
    };
    writeRepositoryPlanningFile(file, data);
    const loaded = readRepositoryPlanningFile(file, directory);
    const { references: _previousWork, ...todo } = loaded.items[0];
    loaded.items.push({ ...todo, id: 'another', title: 'New todo', tags: [] });
    loaded.items[0] = { ...loaded.items[0], title: 'Edited todo', updatedAt: 2 };
    writeRepositoryPlanningFile(file, loaded);
    await expectFormatted();
    expect(readRepositoryPlanningFile(file, directory).items).toEqual(loaded.items);
  });

  it('keeps planning files checked and limits the JSON formatting rule to generated repository planning documents', async () => {
    data.items[0].tags = ['Bug'];
    writeRepositoryPlanningFile(file, data);
    const source = fs.readFileSync(file, 'utf8');
    for (const target of [checkedInPath, path.join(projectRoot, 'packages', 'example', '.Open-Git-Control', 'planning.json')]) {
      const options = await resolveConfig(target);
      expect(await check(source, { ...options, filepath: target })).toBe(true);
      expect((await getFileInfo(target, { ignorePath: path.join(projectRoot, '.prettierignore') })).ignored).toBe(false);
    }
    const other = path.join(projectRoot, 'ordinary.json');
    const options = await resolveConfig(other);
    expect(await format('{"tags":["Bug"]}', { ...options, filepath: other })).toContain('"tags": ["Bug"]');
  });
});
