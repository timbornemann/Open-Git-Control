const registered = new Map<string, { users: number; expiresAt: number }>();

/** Opaque provider tokens have no reliable prefix; redact their exact values. */
export function registerHostingSecrets(values: readonly (string | undefined)[]): () => void {
  const secrets = [...new Set(values.filter((value): value is string => Boolean(value && value.length >= 6)))];
  for (const secret of secrets) registered.set(secret, { users: (registered.get(secret)?.users || 0) + 1, expiresAt: Infinity });
  return () => {
    for (const secret of secrets) {
      const entry = registered.get(secret);
      if (entry) {
        entry.users = Math.max(0, entry.users - 1);
        if (!entry.users) entry.expiresAt = Date.now() + 5 * 60_000;
      }
    }
  };
}

export function redactHostingSecrets(value: string): string {
  let result = value;
  const now = Date.now();
  for (const [secret, entry] of [...registered].sort(([left], [right]) => right.length - left.length)) {
    if (entry.expiresAt < now) {
      registered.delete(secret);
      continue;
    }
    result = result.split(secret).join('[REDACTED]');
  }
  return result;
}
