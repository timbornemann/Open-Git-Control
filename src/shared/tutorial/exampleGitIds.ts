/** Stable fictional object IDs with distinct readable prefixes. */
export const practiceCommitHash = (number: number) =>
  (Math.imul(number, 0x9e3779b1) >>> 0).toString(16).padStart(8, '0') + number.toString(16).padStart(32, '0');
