/** Internal scheduling outcome, distinct from caller cancellation or a network failure. */
export class BackgroundFetchPreemptedError extends Error {
  constructor() {
    super('Automatic fetch yielded to a foreground Git action.');
    this.name = 'AbortError';
  }
}
