import { parseJsonText } from '../jsonText';

export const canonicalJsonValue = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonicalJsonValue).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonicalJsonValue((value as Record<string, unknown>)[key]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
};
export function matchesJsonExerciseValue(actual: string | undefined, expected: string): boolean {
  try {
    return actual !== undefined && canonicalJsonValue(parseJsonText(actual)) === canonicalJsonValue(parseJsonText(expected));
  } catch {
    return false;
  }
}
