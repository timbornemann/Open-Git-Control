import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_REPOSITORY_PLANNING_BYTES,
  readRepositoryPlanningFile,
  readRepositoryPlanningFileAsync,
  writeRepositoryPlanningFile,
} from '../repositoryPlanningFile';

describe('repository planning size limits', () => {
  let directory: string;
  let file: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-planning-limit-'));
    file = path.join(directory, 'planning.json');
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it('rejects oversized committed data in both load paths and preserves it', async () => {
    fs.writeFileSync(file, '');
    fs.truncateSync(file, MAX_REPOSITORY_PLANNING_BYTES + 1);
    expect(() => readRepositoryPlanningFile(file, directory)).toThrow('too large');
    await expect(readRepositoryPlanningFileAsync(file, directory)).rejects.toThrow('too large');
    expect(fs.statSync(file).size).toBe(MAX_REPOSITORY_PLANNING_BYTES + 1);
  });

  it('refuses to replace saved planning with data the reader cannot load', () => {
    fs.writeFileSync(file, 'original');
    const data = { version: 1 as const, projects: [], items: [] };
    Object.assign(data, { items: [{ description: 'x'.repeat(MAX_REPOSITORY_PLANNING_BYTES) }] });
    expect(() => writeRepositoryPlanningFile(file, data)).toThrow('too large');
    expect(fs.readFileSync(file, 'utf8')).toBe('original');
  });
});
