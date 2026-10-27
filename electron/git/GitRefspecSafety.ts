const unsafeCharacters = (value: string): boolean =>
  /\s/.test(value) || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

/** A force refspec must never turn a lease-protected push into an unconditional one. */
export function safePushRefspec(value: string, allowForce = false): string {
  if (!value || unsafeCharacters(value)) throw new Error('Invalid push refspec.');
  if (value.startsWith('+') && !allowForce) throw new Error('Force refspecs require --force-with-lease.');
  const refspec = value.startsWith('+') ? value.slice(1) : value;
  const [source, destination, extra] = refspec.split(':');
  if (!source) throw new Error('Deletion and matching push refspecs are not allowed through this command.');
  if (source.startsWith('-') || source.startsWith('+') || source.startsWith('^') || destination === '' || destination?.startsWith('-') || extra !== undefined)
    throw new Error('Invalid push refspec.');
  return refspec;
}

export function assertSafeFetchRefspec(value: string): void {
  if (value.startsWith('+')) throw new Error('Force refspecs are not allowed for git fetch.');
  if (!value || value.startsWith('-') || unsafeCharacters(value)) throw new Error('Invalid fetch refspec.');
}

export const isPushLease = (arg: string): boolean => arg === '--force-with-lease' || arg.startsWith('--force-with-lease=');
