export const shouldSuppressBareWorkTreeCommand = (args: string[]): boolean => {
  const commandArgs = args[0] === '-c' ? args.slice(2) : args;
  const primary = String(commandArgs?.[0] || '')
    .trim()
    .toLowerCase();
  if (!primary) return false;

  if (primary === 'status') {
    return true;
  }

  if (primary === 'diff') {
    return commandArgs.some(
      (arg) =>
        String(arg || '')
          .trim()
          .toLowerCase() === '--numstat',
    );
  }

  if (primary === 'submodule') {
    const secondary = String(commandArgs?.[1] || '')
      .trim()
      .toLowerCase();
    return secondary === 'status';
  }

  return false;
};
