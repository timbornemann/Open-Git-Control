import { describe, expect, it } from 'vitest';
import {
  buildLicenseDocuments,
  buildLicenseTemplate,
  buildOpenGitControlReadme,
  getLicenseTemplateRequirements,
  isLicenseTemplateId,
  LICENSE_TEMPLATE_OPTIONS,
  licenseTemplateRequiresCopyrightHolder,
} from '@/shared/licenseTemplates';
import { BUNDLED_LICENSES } from '@/shared/generated/bundledLicenseTexts';

describe('license templates', () => {
  it('builds complete holder-based templates with the supplied attribution', () => {
    const license = buildLicenseTemplate('MIT', 'Example Organization', 2026);

    expect(license).toContain('MIT License');
    expect(license).toContain('Copyright (c) 2026 Example Organization');
    expect(license).toContain('Permission is hereby granted');
  });

  it('does not require a holder for the Unlicense', () => {
    expect(licenseTemplateRequiresCopyrightHolder('Unlicense')).toBe(false);
    expect(buildLicenseTemplate('Unlicense')).toContain('public domain');
  });

  it('fills the official ISC template without retaining its source front matter', () => {
    const license = buildLicenseTemplate('ISC', 'Example Organization', 2026);

    expect(licenseTemplateRequiresCopyrightHolder('ISC')).toBe(true);
    expect(license).toContain('Copyright (c) 2026 Example Organization');
    expect(license).not.toContain('[fullname]');
    expect(license).not.toContain('spdx-id: ISC');
  });

  it('keeps the Apache license text intact and creates its completed application notice separately', () => {
    const documents = buildLicenseDocuments('Apache-2.0', { copyrightHolder: 'Example Organization', year: 2026 });
    const apache = documents.find((document) => document.path === 'LICENSE')?.content;
    const notice = documents.find((document) => document.path === 'NOTICE')?.content;

    expect(licenseTemplateRequiresCopyrightHolder('Apache-2.0')).toBe(true);
    expect(apache).toContain('Version 2.0, January 2004');
    expect(apache).toContain('Copyright [yyyy] [name of copyright owner]');
    expect(notice).toContain('Copyright 2026 Example Organization');
    expect(notice).not.toContain('[yyyy]');
  });

  it('creates a completed GNU application notice without modifying the GPL document', () => {
    const documents = buildLicenseDocuments('GPL-3.0-only', {
      copyrightHolder: 'Example Organization',
      programName: 'Example App',
      programDescription: 'manages example data',
      year: 2026,
    });
    const license = documents.find((document) => document.path === 'LICENSE')?.content;
    const notice = documents.find((document) => document.path === 'NOTICE')?.content;

    expect(license).toContain("<one line to give the program's name and a brief idea of what it does.>");
    expect(notice).toContain('Example App — manages example data');
    expect(notice).toContain('Copyright (C) 2026 Example Organization');
    expect(notice).not.toContain('<year>');
    expect(getLicenseTemplateRequirements('GPL-3.0-only')).toEqual(
      expect.objectContaining({ requiresCopyrightHolder: true, requiresProgramName: true, requiresProgramDescription: true, createsApplicationNotice: true }),
    );
  });

  it('validates template identifiers and generates the Open Git Control README starter', () => {
    expect(isLicenseTemplateId('BSD-2-Clause')).toBe(true);
    expect(isLicenseTemplateId('GPL-3.0')).toBe(false);
    expect(LICENSE_TEMPLATE_OPTIONS.map((option) => option.value)).toEqual(
      expect.arrayContaining(['Apache-2.0', 'GPL-3.0-only', 'MPL-2.0', 'BSD-3-Clause', 'CC0-1.0']),
    );
    expect(buildOpenGitControlReadme('Example\nProject')).toContain('# Example Project');
    expect(buildOpenGitControlReadme('Example Project')).toContain('Open Git Control');
  });

  it('keeps every bundled license on its audited application path', () => {
    const inlineCopyrightLicenses = new Set(['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC']);
    const applicationNoticeLicenses = new Set(['Apache-2.0', 'GPL-2.0-only', 'GPL-3.0-only', 'LGPL-3.0-only', 'AGPL-3.0-only']);

    for (const template of BUNDLED_LICENSES) {
      const documents = buildLicenseDocuments(template.id, {
        copyrightHolder: 'Example Organization',
        programName: 'Example App',
        programDescription: 'manages example data',
        year: 2026,
      });
      const license = documents.find((document) => document.path === 'LICENSE')?.content;
      const notice = documents.find((document) => document.path === 'NOTICE')?.content;

      expect(license).toBeDefined();
      if (inlineCopyrightLicenses.has(template.id)) {
        expect(license).not.toMatch(/<(?:year|owner|copyright holders)>|\[(?:year|fullname)\]/);
      } else {
        expect(license).toBe(template.text);
      }

      if (applicationNoticeLicenses.has(template.id)) {
        expect(notice).toBeDefined();
        expect(notice).not.toMatch(/<(?:year|name of author|program)>|\[(?:yyyy|name of copyright owner)\]/);
      } else {
        expect(notice).toBeUndefined();
      }
    }
  });
});
