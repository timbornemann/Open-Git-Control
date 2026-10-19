/** `git config --null --list` separates key/value with LF and records with NUL. */
export function gitConfigurationEntries(raw: string): Array<[string, string]> {
  return raw
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const end = entry.indexOf('\n');
      if (end < 0) return [entry, ''];
      return [entry.slice(0, end), entry.slice(end + 1)];
    });
}

/** Transport, identity and UI preferences cannot change an immutable commit patch. */
export function secretScanConfiguration(raw: string): Array<[string, string]> {
  return gitConfigurationEntries(raw).filter(([key]) => !/^(?:branch|remote|push|pull|url|credential|user|author|committer|gui|ogc|lfs)\./i.test(key));
}
