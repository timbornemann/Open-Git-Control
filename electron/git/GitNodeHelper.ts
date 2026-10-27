const quoteShellArgument = (value: string): string => `'${value.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;

/** Git invokes helpers/editors through its POSIX shell, including Git for Windows. */
export function gitNodeHelperCommand(...args: string[]): string {
  // Scope Electron's Node mode to the helper, never Git or unrelated hooks/children.
  return `ELECTRON_RUN_AS_NODE=1 ${[process.execPath, ...args].map(quoteShellArgument).join(' ')}`;
}

/** Keep helper capabilities/runtime flags out of Git and its hooks, even when already inherited. */
export function gitHelperEnvironment(overrides: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result = { ...overrides };
  const privateNames = ['ELECTRON_RUN_AS_NODE', 'OGC_GIT_BROKER_KEY', 'OGC_GIT_BROKER_PORT'];
  for (const name of new Set([...privateNames, ...Object.keys({ ...process.env, ...overrides })])) {
    // Windows treats environment names case-insensitively; clear alternate spellings as well.
    if (privateNames.includes(name.toUpperCase())) result[name] = undefined;
  }
  return result;
}
