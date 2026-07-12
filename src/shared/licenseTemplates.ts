import { BUNDLED_LICENSES, type BundledLicenseId } from './generated/bundledLicenseTexts';

export const LICENSE_TEMPLATE_IDS = ['none', ...BUNDLED_LICENSES.map((license) => license.id)] as const;

export type LicenseTemplateId = 'none' | BundledLicenseId;

export type LicenseTemplateValues = {
  copyrightHolder?: string;
  programName?: string;
  programDescription?: string;
  year?: number;
};

export type LicenseTemplateRequirements = {
  requiresCopyrightHolder: boolean;
  requiresProgramName: boolean;
  requiresProgramDescription: boolean;
  createsApplicationNotice: boolean;
};

export type GeneratedLicenseDocument = {
  path: 'LICENSE' | 'NOTICE';
  content: string;
};

const GNU_LICENSE_IDS = new Set<Exclude<LicenseTemplateId, 'none'>>(['GPL-2.0-only', 'GPL-3.0-only', 'LGPL-3.0-only', 'AGPL-3.0-only']);
const APPLICATION_NOTICE_LICENSE_IDS = new Set<Exclude<LicenseTemplateId, 'none'>>(['Apache-2.0', ...GNU_LICENSE_IDS]);
const INLINE_COPYRIGHT_TEMPLATE_IDS = new Set<Exclude<LicenseTemplateId, 'none'>>(['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC']);

export const isLicenseTemplateId = (value: unknown): value is LicenseTemplateId =>
  value === 'none' || (typeof value === 'string' && BUNDLED_LICENSES.some((license) => license.id === value));

export const getLicenseTemplateRequirements = (license: LicenseTemplateId): LicenseTemplateRequirements => {
  const createsApplicationNotice = license !== 'none' && APPLICATION_NOTICE_LICENSE_IDS.has(license);
  const usesGnuApplicationNotice = license !== 'none' && GNU_LICENSE_IDS.has(license);
  return {
    requiresCopyrightHolder: license !== 'none' && (INLINE_COPYRIGHT_TEMPLATE_IDS.has(license) || createsApplicationNotice),
    requiresProgramName: usesGnuApplicationNotice,
    requiresProgramDescription: usesGnuApplicationNotice,
    createsApplicationNotice,
  };
};

export const licenseTemplateRequiresCopyrightHolder = (license: LicenseTemplateId): boolean => getLicenseTemplateRequirements(license).requiresCopyrightHolder;

export const LICENSE_TEMPLATE_OPTIONS: Array<{ value: LicenseTemplateId; label: string }> = [
  { value: 'none', label: 'No license' },
  ...BUNDLED_LICENSES.map(({ id, label }) => ({ value: id, label })),
];

const fillOfficialCopyrightPlaceholders = (text: string, year: number, holder: string): string =>
  text
    .replaceAll('<year>', String(year))
    .replaceAll('<copyright holders>', holder)
    .replaceAll('<owner>', holder)
    .replaceAll('<owner or organization>', holder)
    .replaceAll('[year]', String(year))
    .replaceAll('[fullname]', holder);

const getTemplate = (license: Exclude<LicenseTemplateId, 'none'>) => {
  const template = BUNDLED_LICENSES.find((candidate) => candidate.id === license);
  if (!template) throw new Error('Unknown license template.');
  return template;
};

const requireValue = (value: string | undefined, field: 'copyright holder' | 'program name' | 'program description'): string => {
  const trimmed = value?.trim() || '';
  if (!trimmed) throw new Error(`A ${field} is required for the selected license.`);
  return trimmed;
};

const buildApacheApplicationNotice = (text: string, year: number, holder: string): string => {
  const noticeStart = text.indexOf('Copyright [yyyy] [name of copyright owner]');
  if (noticeStart < 0) throw new Error('The Apache application notice could not be found in the bundled license text.');
  return text.slice(noticeStart).replaceAll('[yyyy]', String(year)).replaceAll('[name of copyright owner]', holder);
};

const buildGnuApplicationNotice = (
  license: Exclude<LicenseTemplateId, 'none'>,
  text: string,
  year: number,
  holder: string,
  programName: string,
  programDescription: string,
): string => {
  const noticeStart = text.indexOf('     This program');
  const noticeEndMarker = license === 'GPL-2.0-only' ? ' Also add information on how to contact you' : '\n\nAlso add information on how to contact you';
  const noticeEnd = text.indexOf(noticeEndMarker, noticeStart);
  if (noticeStart < 0 || noticeEnd < 0) throw new Error('The GNU application notice could not be found in the bundled license text.');

  const officialNotice = text.slice(noticeStart, noticeEnd).replace(/^ {5}/gm, '').trim();
  return `${programName} — ${programDescription}\nCopyright (C) ${year} ${holder}\n\n${officialNotice}\n`;
};

const buildApplicationNotice = (license: Exclude<LicenseTemplateId, 'none'>, values: LicenseTemplateValues): string | null => {
  const requirements = getLicenseTemplateRequirements(license);
  if (!requirements.createsApplicationNotice) return null;

  const template = getTemplate(license);
  const year = values.year ?? new Date().getFullYear();
  const holder = requireValue(values.copyrightHolder, 'copyright holder');
  if (license === 'Apache-2.0') return buildApacheApplicationNotice(template.text, year, holder);

  return buildGnuApplicationNotice(
    license,
    template.text,
    year,
    holder,
    requireValue(values.programName, 'program name'),
    requireValue(values.programDescription, 'program description'),
  );
};

export const buildLicenseTemplate = (license: Exclude<LicenseTemplateId, 'none'>, copyrightHolder = '', year = new Date().getFullYear()): string => {
  const template = getTemplate(license);
  const requirements = getLicenseTemplateRequirements(license);
  const holder = requirements.requiresCopyrightHolder ? requireValue(copyrightHolder, 'copyright holder') : copyrightHolder.trim();

  return INLINE_COPYRIGHT_TEMPLATE_IDS.has(license) ? fillOfficialCopyrightPlaceholders(template.text, year, holder) : template.text;
};

export const buildLicenseDocuments = (license: Exclude<LicenseTemplateId, 'none'>, values: LicenseTemplateValues = {}): GeneratedLicenseDocument[] => {
  const year = values.year ?? new Date().getFullYear();
  const documents: GeneratedLicenseDocument[] = [{ path: 'LICENSE', content: buildLicenseTemplate(license, values.copyrightHolder, year) }];
  const applicationNotice = buildApplicationNotice(license, { ...values, year });
  if (applicationNotice) documents.push({ path: 'NOTICE', content: applicationNotice });
  return documents;
};

export const buildOpenGitControlReadme = (repositoryName: string): string => {
  const title = repositoryName.replace(/[\r\n]+/g, ' ').trim() || 'My Project';
  return `# ${title}

Welcome to **${title}**.

This repository was initialized with [Open Git Control](https://github.com/timbornemann/Open-Git-Control), a desktop app for organizing and controlling Git repositories.

## Getting started

- Describe the goal of this project.
- Add installation and development instructions.
- Document important decisions and contribution guidelines.

## License

Add a license that fits this project before publishing it.
`;
};
