import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SCAN_TARGETS = ['src', 'electron', 'scripts', 'README.md', 'package.json', '.github'];
const TEXT_FILE_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.tsx', '.yml', '.yaml']);
const MOJIBAKE_PATTERN = /(?:\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00e2[\u0080-\u00bf]{1,2}|\ufffd)/;

const collectTextFiles = (targetPath: string): string[] => {
  if (!existsSync(targetPath)) return [];
  const stats = statSync(targetPath);
  if (stats.isFile()) {
    return TEXT_FILE_EXTENSIONS.has(path.extname(targetPath).toLowerCase()) ? [targetPath] : [];
  }
  if (!stats.isDirectory()) return [];

  return readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-electron' || entry.name === 'coverage') {
      return [];
    }
    return collectTextFiles(path.join(targetPath, entry.name));
  });
};

describe('source encoding hygiene', () => {
  it('does not contain common UTF-8 mojibake markers', () => {
    const offenders = SCAN_TARGETS.flatMap((target) => collectTextFiles(path.join(ROOT, target)))
      .map((filePath) => ({
        filePath,
        text: readFileSync(filePath, 'utf8'),
      }))
      .filter(({ text }) => MOJIBAKE_PATTERN.test(text))
      .map(({ filePath }) => path.relative(ROOT, filePath).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });
});
