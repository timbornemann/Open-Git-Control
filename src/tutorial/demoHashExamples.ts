import type { HashExample, HashAlgorithm } from '@/shared/tutorial/types';
import hashes from './fixtures/file-hashes.json';
export const exampleHash = (version: HashExample, algorithm: HashAlgorithm) =>
  algorithm === 'all' ? `SHA-256: ${hashes[version].sha256}\nSHA-1: ${hashes[version].sha1}\nMD5: ${hashes[version].md5}` : hashes[version][algorithm];
