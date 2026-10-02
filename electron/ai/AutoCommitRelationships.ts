import { posix as path } from 'node:path';
import type { ChangeContext, ChangeRelationship } from './AutoCommitPlanTypes';
import type { AutoCommitImportResolver } from './AutoCommitImportResolver';

export const extractImports = (text: string): string[] =>
  [...new Set([...text.matchAll(/(?:\bfrom\s*|\b(?:import|require)\s*\(?\s*)["']([^"'\r\n]+)["']/g)].map((match) => match[1]))].slice(0, 48);
const GENERIC_SYMBOLS = new Set([
  'value',
  'values',
  'result',
  'data',
  'key',
  'error',
  'path',
  'text',
  'name',
  'id',
  'index',
  'options',
  'config',
  'settings',
  'props',
  'state',
  'file',
  'response',
  'input',
  'output',
]);
export const extractSymbols = (text: string): string[] =>
  [
    ...new Set(
      [...text.matchAll(/\b(?:class|interface|type|function|enum|const|let|def|struct|fn|func)\s+([A-Za-z_$][\w$]*)/g)]
        .map((match) => match[1])
        .filter((name) => !GENERIC_SYMBOLS.has(name)),
    ),
  ].slice(0, 48);
export const extractReferences = (text: string): string[] =>
  [
    ...new Set([
      ...[...text.matchAll(/\b[A-Za-z_$][\w$]{3,}\b/g)].map((match) => match[0]),
      ...[...text.matchAll(/["']([\w./:-]{5,})["']/g)].map((match) => match[1]),
    ]),
  ].slice(0, 192);

export function buildRelationships(changes: ChangeContext[], resolver: AutoCommitImportResolver): ChangeRelationship[] {
  const edges = new Map<string, ChangeRelationship>();
  const add = (a: ChangeContext, b: ChangeContext, reason: string, strong: boolean) => {
    if (a.id === b.id || a.source !== b.source) return;
    const ids = [a.id, b.id].sort();
    const key = ids.join(':');
    const previous = edges.get(key);
    if (!previous || (strong && !previous.strong)) edges.set(key, { from: ids[0], to: ids[1], reason, strong });
  };
  const byPath = new Map<string, ChangeContext[]>();
  const symbolOwners = new Map<string, ChangeContext[]>();
  for (const change of changes) {
    byPath.set(change.path, [...(byPath.get(change.path) || []), change]);
    for (const symbol of change.symbols) symbolOwners.set(symbol, [...(symbolOwners.get(symbol) || []), change]);
  }
  for (const change of changes) {
    for (const target of changes) {
      if (target.path.startsWith(`${change.path}/`)) add(change, target, 'file/directory replacement', true);
    }
    for (const specifier of change.imports) {
      const resolved = resolver.resolve(change.path, specifier);
      if (!resolved) continue;
      for (const target of byPath.get(resolved) || []) {
        const shared = target.symbols.find((symbol) => change.references.includes(symbol));
        add(change, target, shared ? `changed symbol ${shared} imported from ${resolved}` : `imports ${resolved}`, Boolean(shared));
      }
    }
    for (const reference of change.references) {
      const owners = symbolOwners.get(reference) || [];
      if (owners.length <= 6) for (const owner of owners) add(change, owner, `changed declaration and reference: ${reference}`, true);
    }
    const basename = path
      .basename(change.path)
      .replace(/\.(test|spec)\.[^.]+$/, '')
      .replace(/\.[^.]+$/, '');
    if (/(?:\.(test|spec)\.|(^|\/)__tests__\/)/.test(change.path)) {
      for (const target of changes)
        if (path.basename(target.path).replace(/\.[^.]+$/, '') === basename) add(change, target, 'implementation and corresponding test', true);
    }
    if (/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock)$/.test(change.path)) {
      for (const target of changes)
        if (path.dirname(target.path) === path.dirname(change.path) && /^(package\.json|Cargo\.toml|pyproject\.toml)$/.test(path.basename(target.path)))
          add(change, target, 'dependency manifest and lockfile', true);
    }
  }
  // Event/channel literals connect layers even when no direct import exists.
  const literals = new Map<string, ChangeContext[]>();
  for (const change of changes)
    for (const value of change.references.filter((item) => /[:./-]/.test(item))) literals.set(value, [...(literals.get(value) || []), change]);
  for (const [value, members] of literals)
    if (members.length >= 2 && members.length <= 8) for (const member of members.slice(1)) add(members[0], member, `shared contract/event ${value}`, true);
  return [...edges.values()];
}
