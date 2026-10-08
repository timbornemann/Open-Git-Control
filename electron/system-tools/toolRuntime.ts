import * as path from 'node:path';
import type { SystemToolId, SystemToolStatus } from '../../src/shared/ipc/systemTools';

const tools = new Map<SystemToolId, SystemToolStatus>();
let managed = false;
export const SYSTEM_TOOL_ERROR_PREFIX = 'SYSTEM_TOOL_UNAVAILABLE:';

export function manageToolRuntime(): void {
  managed = true;
}
export function updateToolRuntime(status: SystemToolStatus): void {
  tools.set(status.id, status);
}
export function toolExecutable(id: SystemToolId): string {
  const status = tools.get(id);
  if (managed && status?.state !== 'available') throw new Error(`${SYSTEM_TOOL_ERROR_PREFIX}${id}`);
  return status?.executable || (id === 'github-cli' ? 'gh' : id);
}
export function toolEnvironment(overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...process.env, ...overrides };
  const key = Object.keys(env).find((name) => name.toLowerCase() === 'path') || 'PATH';
  const directories = [...tools.values()].flatMap((tool) => (tool.executable ? [path.dirname(tool.executable)] : []));
  env[key] = [...new Set([...directories, ...(env[key] || '').split(path.delimiter)])].filter(Boolean).join(path.delimiter);
  return env;
}
