module.exports = {
  endOfLine: 'auto',
  printWidth: 160,
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  // Match the canonical JSON.stringify output of the repository planning writer.
  overrides: [
    {
      files: '**/.Open-Git-Control/planning.json',
      options: { parser: 'json-stringify', tabWidth: 2, useTabs: false },
    },
  ],
};
