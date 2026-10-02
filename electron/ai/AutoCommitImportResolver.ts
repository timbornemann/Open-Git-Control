import { posix as path } from 'node:path';
import { parse } from 'jsonc-parser';
import type { AutoCommitObjectReader } from './AutoCommitObjectReader';

type Config = { directory: string; base: string; paths: Record<string, string[]> };

export class AutoCommitImportResolver {
  private configs: Config[] = [];
  private packages = new Map<string, { directory: string; entries: string[]; exports: Record<string, string[]> }>();
  constructor(private readonly objects: AutoCommitObjectReader) {}

  async initialize(): Promise<void> {
    const candidates = [...this.objects.files.keys()]
      .filter((file) => /(^|\/)(tsconfig[^/]*\.json|jsconfig\.json|package\.json)$/.test(file) && !/(^|\/)(node_modules|vendor)\//.test(file))
      .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
      .slice(0, 128);
    await this.objects.load(candidates.map((file) => this.objects.files.get(file)!));
    for (const file of candidates) {
      const raw = this.objects.read(file);
      if (!raw) continue;
      const value = parse(raw) as Record<string, unknown> | undefined;
      if (!value || typeof value !== 'object') continue;
      const directory = path.dirname(file) === '.' ? '' : path.dirname(file);
      if (path.basename(file) === 'package.json') {
        if (typeof value.name === 'string') {
          const exports: Record<string, string[]> = {};
          if (
            value.exports &&
            typeof value.exports === 'object' &&
            !Array.isArray(value.exports) &&
            Object.keys(value.exports).some((key) => key.startsWith('.'))
          ) {
            for (const [key, target] of Object.entries(value.exports)) exports[key] = this.exportTargets(target);
          } else exports['.'] = this.exportTargets(value.exports);
          const entries = [...(exports['.'] || []), value.source, value.module, value.main, 'src/index', 'index'].filter(
            (item): item is string => typeof item === 'string',
          );
          this.packages.set(value.name, { directory, entries, exports });
        }
      } else {
        this.configs.push(this.readConfig(file));
      }
    }
    this.configs.sort((a, b) => b.directory.length - a.directory.length);
  }

  resolve(from: string, specifier: string): string | undefined {
    const candidates: string[] = [];
    if (specifier.startsWith('.')) candidates.push(path.join(path.dirname(from), specifier));
    else {
      for (const config of this.configs) {
        if (config.directory && !from.startsWith(`${config.directory}/`)) continue;
        for (const [pattern, targets] of Object.entries(config.paths)) {
          const [prefix, suffix = ''] = pattern.split('*');
          if (pattern.includes('*') ? specifier.startsWith(prefix) && specifier.endsWith(suffix) : specifier === pattern) {
            const middle = specifier.slice(prefix.length, specifier.length - suffix.length || undefined);
            candidates.push(...targets.map((target) => path.join(config.base, target.replace('*', middle))));
          }
        }
        candidates.push(path.join(config.base, specifier));
      }
      for (const [name, pkg] of this.packages) {
        if (specifier === name) candidates.push(...pkg.entries.map((entry) => path.join(pkg.directory, entry)));
        else if (specifier.startsWith(`${name}/`)) {
          const subpath = specifier.slice(name.length + 1);
          for (const [pattern, targets] of Object.entries(pkg.exports)) {
            const [prefix, suffix = ''] = pattern.split('*');
            const request = `./${subpath}`;
            if (pattern.includes('*') ? request.startsWith(prefix) && request.endsWith(suffix) : request === pattern) {
              const middle = request.slice(prefix.length, request.length - suffix.length || undefined);
              candidates.push(...targets.map((target) => path.join(pkg.directory, target.replace('*', middle))));
            }
          }
          candidates.push(path.join(pkg.directory, subpath), path.join(pkg.directory, 'src', subpath));
        }
      }
    }
    for (const candidate of candidates) {
      if (candidate.startsWith('../') || path.isAbsolute(candidate)) continue;
      for (const option of [
        candidate,
        ...['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'].map((ext) => candidate + ext),
        ...['.ts', '.tsx', '.js'].map((ext) => `${candidate}/index${ext}`),
        candidate.replace(/\.jsx?$/, '.ts'),
      ]) {
        if (this.objects.files.has(option)) return option;
      }
    }
    return undefined;
  }

  private exportTargets(value: unknown, depth = 0): string[] {
    if (depth > 6) return [];
    if (typeof value === 'string') return [value];
    if (!value || typeof value !== 'object') return [];
    return Object.values(value)
      .flatMap((target) => this.exportTargets(target, depth + 1))
      .slice(0, 16);
  }

  private readConfig(file: string, visited = new Set<string>()): Config {
    const directory = path.dirname(file) === '.' ? '' : path.dirname(file);
    const empty = { directory, base: directory, paths: {} };
    if (visited.has(file) || visited.size >= 16) return empty;
    visited.add(file);
    const value = parse(this.objects.read(file)) as { extends?: unknown; compilerOptions?: { baseUrl?: unknown; paths?: Record<string, unknown> } } | undefined;
    if (!value || typeof value !== 'object') return empty;
    let inherited = empty as Config;
    for (const parent of Array.isArray(value.extends) ? value.extends : [value.extends]) {
      if (typeof parent !== 'string' || !parent.startsWith('.')) continue;
      const candidate = path.join(directory, parent.endsWith('.json') ? parent : `${parent}.json`);
      if (this.objects.files.has(candidate)) inherited = this.readConfig(candidate, visited);
    }
    const compiler = value.compilerOptions;
    const paths: Record<string, string[]> = compiler?.paths ? {} : inherited.paths;
    for (const [key, values] of Object.entries(compiler?.paths || {}))
      if (Array.isArray(values)) paths[key] = values.filter((item): item is string => typeof item === 'string');
    return { directory, base: typeof compiler?.baseUrl === 'string' ? path.join(directory, compiler.baseUrl) : inherited.base || directory, paths };
  }
}
