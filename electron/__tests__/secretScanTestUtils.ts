export const createGitServiceMock = (outputs: Record<string, string | Error>) => {
  const resolve = async (args: string[]) => {
    const key = args.join(' ');
    const value = outputs[key];
    if (value instanceof Error) throw value;
    return typeof value === 'string' ? value : '';
  };
  return {
    runCommand: resolve,
    runCommandAtPath: async (_repoPath: string, args: string[]) => resolve(args),
    streamCommandLines: async (args: string[], onLine: (line: string) => void) => {
      const output = await resolve(args);
      for (const line of output.split(/\r?\n/)) await onLine(line);
    },
    streamCommandLinesAtPath: async (_repoPath: string, args: string[], onLine: (line: string) => void) => {
      const output = await resolve(args);
      for (const line of output.split(/\r?\n/)) await onLine(line);
    },
  } as any;
};
