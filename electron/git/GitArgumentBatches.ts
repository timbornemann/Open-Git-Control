/** Leave space for Git's executable/options below Windows' 32767-character limit. */
export function* gitArgumentBatches(args: string[], maxCharacters = 24_000): Generator<string[]> {
  let batch: string[] = [];
  let characters = 0;
  for (const arg of args) {
    // Quotes and backslashes can expand when execFile encodes the command line.
    const cost = arg.length + (arg.match(/["\\]/g)?.length ?? 0) + 3;
    if (batch.length && (characters + cost > maxCharacters || batch.length >= 1000)) {
      yield batch;
      batch = [];
      characters = 0;
    }
    batch.push(arg);
    characters += cost;
  }
  if (batch.length) yield batch;
}
