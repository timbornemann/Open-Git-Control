import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { getPathMock } = vi.hoisted(() => ({
  getPathMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: getPathMock },
}));

import { writeProjectPlannerData } from '../main-process/projectPlannerStore';

describe('projectPlannerStore persistence', () => {
  let temporaryDirectory = '';

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-project-planner-'));
    getPathMock.mockReturnValue(temporaryDirectory);
  });

  afterEach(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('does not reuse the former shared temporary filename', () => {
    const storePath = path.join(temporaryDirectory, 'project-planner.json');
    const foreignTemporaryPath = `${storePath}.tmp`;
    fs.writeFileSync(foreignTemporaryPath, 'owned by another process', 'utf8');

    writeProjectPlannerData({ version: 1, projects: [], items: [] });

    expect(JSON.parse(fs.readFileSync(storePath, 'utf8'))).toEqual({ version: 1, projects: [], items: [] });
    expect(fs.readFileSync(foreignTemporaryPath, 'utf8')).toBe('owned by another process');
    expect(fs.readdirSync(temporaryDirectory).filter((entry) => entry.endsWith('.tmp'))).toEqual(['project-planner.json.tmp']);
  });
});
