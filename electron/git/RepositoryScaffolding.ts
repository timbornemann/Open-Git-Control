import * as fs from 'fs';
import * as path from 'path';
import {
  buildLicenseDocuments,
  buildOpenGitControlReadme,
  getLicenseTemplateRequirements,
  isLicenseTemplateId,
  type LicenseTemplateId,
} from '../../src/shared/licenseTemplates';
import { resolveRepositoryPathForCreate } from './RepositoryPathSafety';

export type RepositoryInitializationOptions = {
  createReadme: boolean;
  license: LicenseTemplateId;
  copyrightHolder: string;
  programName: string;
  programDescription: string;
};

const MAX_COPYRIGHT_HOLDER_LENGTH = 160;
const MAX_PROGRAM_NAME_LENGTH = 160;
const MAX_PROGRAM_DESCRIPTION_LENGTH = 400;

const normalizeTemplateValue = (candidate: Record<string, unknown>, key: string, maxLength: number, label: string): string => {
  const value = typeof candidate[key] === 'string' ? candidate[key].trim() : '';
  if (value.length > maxLength || /[\r\n\0]/.test(value)) throw new Error(`${label} is invalid.`);
  return value;
};

export const normalizeRepositoryInitializationOptions = (value: unknown): RepositoryInitializationOptions => {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const licenseValue = candidate.license ?? 'none';
  if (!isLicenseTemplateId(licenseValue)) {
    throw new Error('Invalid license template.');
  }

  const copyrightHolder = normalizeTemplateValue(candidate, 'copyrightHolder', MAX_COPYRIGHT_HOLDER_LENGTH, 'Copyright holder');
  const programName = normalizeTemplateValue(candidate, 'programName', MAX_PROGRAM_NAME_LENGTH, 'Program name');
  const programDescription = normalizeTemplateValue(candidate, 'programDescription', MAX_PROGRAM_DESCRIPTION_LENGTH, 'Program description');
  const requirements = getLicenseTemplateRequirements(licenseValue);
  if (requirements.requiresCopyrightHolder && !copyrightHolder) {
    throw new Error('A copyright holder is required for the selected license.');
  }
  if (requirements.requiresProgramName && !programName) throw new Error('A program name is required for the selected license.');
  if (requirements.requiresProgramDescription && !programDescription) throw new Error('A program description is required for the selected license.');

  return {
    createReadme: candidate.createReadme === true,
    license: licenseValue,
    copyrightHolder,
    programName,
    programDescription,
  };
};

const writeIfMissing = (targetPath: string, content: string): boolean => {
  try {
    fs.writeFileSync(targetPath, content, { encoding: 'utf8', flag: 'wx' });
    return true;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
};

export const scaffoldInitializedRepository = (repoPath: string, options: RepositoryInitializationOptions): string[] => {
  const createdFiles: string[] = [];
  if (!options.createReadme && options.license === 'none') return createdFiles;
  const repositoryName = path.basename(fs.realpathSync(repoPath));

  if (options.createReadme) {
    const readmePath = resolveRepositoryPathForCreate(repoPath, 'README.md', 'README path');
    if (writeIfMissing(readmePath, buildOpenGitControlReadme(repositoryName))) createdFiles.push('README.md');
  }

  if (options.license !== 'none') {
    const documents = buildLicenseDocuments(options.license, {
      copyrightHolder: options.copyrightHolder,
      programName: options.programName,
      programDescription: options.programDescription,
    });
    for (const document of documents) {
      const documentPath = resolveRepositoryPathForCreate(repoPath, document.path, `${document.path} path`);
      if (writeIfMissing(documentPath, document.content)) createdFiles.push(document.path);
    }
  }

  return createdFiles;
};
