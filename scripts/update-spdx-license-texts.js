/*
 * Downloads the exact license texts bundled by the application from pinned,
 * official license sources. The generated module is checked in so the desktop
 * application never needs network access to create a LICENSE file.
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const SPDX_VERSION = '3.28.0';
const SPDX_SOURCE_BASE_URL = `https://raw.githubusercontent.com/spdx/license-list-data/v${SPDX_VERSION}/text`;
const CHOOSE_A_LICENSE_COMMIT = '96f824b1ecf078cf6351dcdfaf837ecb203bc6de';
const CHOOSE_A_LICENSE_SOURCE_BASE_URL = `https://raw.githubusercontent.com/github/choosealicense.com/${CHOOSE_A_LICENSE_COMMIT}/_licenses`;
const OUTPUT_PATH = path.resolve(__dirname, '../src/shared/generated/bundledLicenseTexts.ts');

const LICENSES = [
  { id: 'MIT', label: 'MIT License', requiresCopyrightHolder: true, sourceUrl: `${SPDX_SOURCE_BASE_URL}/MIT.txt` },
  { id: 'Apache-2.0', label: 'Apache License 2.0', requiresCopyrightHolder: false, sourceUrl: `${SPDX_SOURCE_BASE_URL}/Apache-2.0.txt` },
  { id: 'GPL-3.0-only', label: 'GNU General Public License v3.0 only', requiresCopyrightHolder: false, sourceUrl: `${SPDX_SOURCE_BASE_URL}/GPL-3.0-only.txt` },
  { id: 'GPL-2.0-only', label: 'GNU General Public License v2.0 only', requiresCopyrightHolder: false, sourceUrl: `${SPDX_SOURCE_BASE_URL}/GPL-2.0-only.txt` },
  {
    id: 'LGPL-3.0-only',
    label: 'GNU Lesser General Public License v3.0 only',
    requiresCopyrightHolder: false,
    sourceUrl: `${SPDX_SOURCE_BASE_URL}/LGPL-3.0-only.txt`,
  },
  {
    id: 'AGPL-3.0-only',
    label: 'GNU Affero General Public License v3.0 only',
    requiresCopyrightHolder: false,
    sourceUrl: `${SPDX_SOURCE_BASE_URL}/AGPL-3.0-only.txt`,
  },
  { id: 'MPL-2.0', label: 'Mozilla Public License 2.0', requiresCopyrightHolder: false, sourceUrl: `${SPDX_SOURCE_BASE_URL}/MPL-2.0.txt` },
  { id: 'EPL-2.0', label: 'Eclipse Public License 2.0', requiresCopyrightHolder: false, sourceUrl: `${SPDX_SOURCE_BASE_URL}/EPL-2.0.txt` },
  { id: 'BSD-2-Clause', label: 'BSD 2-Clause "Simplified" License', requiresCopyrightHolder: true, sourceUrl: `${SPDX_SOURCE_BASE_URL}/BSD-2-Clause.txt` },
  {
    id: 'BSD-3-Clause',
    label: 'BSD 3-Clause "New" or "Revised" License',
    requiresCopyrightHolder: true,
    sourceUrl: `${SPDX_SOURCE_BASE_URL}/BSD-3-Clause.txt`,
  },
  {
    id: 'ISC',
    label: 'ISC License',
    requiresCopyrightHolder: true,
    sourceUrl: `${CHOOSE_A_LICENSE_SOURCE_BASE_URL}/isc.txt`,
    extractLicenseText: (source) => {
      const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
      if (!match) throw new Error('Could not extract the ISC license text from the official source.');
      return match[1];
    },
  },
  { id: 'BSL-1.0', label: 'Boost Software License 1.0', requiresCopyrightHolder: false, sourceUrl: `${SPDX_SOURCE_BASE_URL}/BSL-1.0.txt` },
  { id: 'Zlib', label: 'zlib License', requiresCopyrightHolder: false, sourceUrl: `${SPDX_SOURCE_BASE_URL}/Zlib.txt` },
  { id: 'CC0-1.0', label: 'Creative Commons Zero v1.0 Universal', requiresCopyrightHolder: false, sourceUrl: `${SPDX_SOURCE_BASE_URL}/CC0-1.0.txt` },
  { id: 'Unlicense', label: 'The Unlicense', requiresCopyrightHolder: false, sourceUrl: `${SPDX_SOURCE_BASE_URL}/Unlicense.txt` },
];

const download = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Could not download ${url}: HTTP ${response.statusCode}`));
          return;
        }
        response.setEncoding('utf8');
        let text = '';
        response.on('data', (chunk) => {
          text += chunk;
        });
        response.on('end', () => resolve(text));
      })
      .on('error', reject);
  });

const main = async () => {
  const downloadedLicenses = await Promise.all(
    LICENSES.map(async ({ extractLicenseText, ...license }) => {
      const source = await download(license.sourceUrl);
      const text = extractLicenseText ? extractLicenseText(source) : source;
      if (!text.trim()) throw new Error(`Downloaded license text for ${license.id} is empty.`);
      return { ...license, text };
    }),
  );

  const generatedModule = [
    '/*',
    ' * GENERATED FILE - DO NOT EDIT MANUALLY.',
    ` * Sources: SPDX License List Data v${SPDX_VERSION} and GitHub Choose a License (${CHOOSE_A_LICENSE_COMMIT}).`,
    ' * Each template stores its immutable source URL for auditing.',
    ' * Regenerate with: npm run licenses:update',
    ' */',
    '',
    'export const BUNDLED_LICENSES = [',
    ...downloadedLicenses.map(
      ({ id, label, requiresCopyrightHolder, sourceUrl, text }) =>
        `  { id: ${JSON.stringify(id)}, label: ${JSON.stringify(label)}, requiresCopyrightHolder: ${requiresCopyrightHolder}, sourceUrl: ${JSON.stringify(sourceUrl)}, text: ${JSON.stringify(text)} },`,
    ),
    '] as const;',
    '',
    "export type BundledLicenseId = (typeof BUNDLED_LICENSES)[number]['id'];",
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, generatedModule, 'utf8');
  process.stdout.write(`Downloaded ${downloadedLicenses.length} license texts.\n`);
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
