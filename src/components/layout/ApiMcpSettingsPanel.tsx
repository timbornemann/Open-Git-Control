import React, { useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import type { PlanningApiInfoDto } from '../../global';
import { useI18n } from '../../i18n';

type EndpointInfo = {
  method: string;
  path: string;
  description: string;
};

type CopyButtonProps = {
  value: string;
  label?: string;
};

const DEFAULT_BASE_URL = 'http://127.0.0.1:2990';

const CopyButton: React.FC<CopyButtonProps> = ({ value, label }) => {
  const { tr } = useI18n();
  const [copied, setCopied] = useState(false);

  const copyValue = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      className="settings-copy-btn"
      type="button"
      onClick={() => void copyValue()}
      title={tr('Kopieren', 'Copy')}
    >
      <Copy size={13} />
      {copied ? tr('Kopiert', 'Copied') : (label || tr('Kopieren', 'Copy'))}
    </button>
  );
};

const CopyValueRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="settings-api-copy-row">
    <span className="settings-api-copy-label">{label}</span>
    <code>{value}</code>
    <CopyButton value={value} />
  </div>
);

const EndpointTable: React.FC<{ endpoints: EndpointInfo[] }> = ({ endpoints }) => (
  <div className="settings-api-endpoint-list">
    {endpoints.map((endpoint) => (
      <div key={`${endpoint.method}-${endpoint.path}`} className="settings-api-endpoint-row">
        <span className="settings-api-method">{endpoint.method}</span>
        <code>{endpoint.path}</code>
        <span>{endpoint.description}</span>
      </div>
    ))}
  </div>
);

const buildAgentConfig = (mcpUrl: string): string => JSON.stringify({
  mcpServers: {
    'open-git-control': {
      type: 'http',
      url: mcpUrl,
    },
  },
}, null, 2);

export const ApiMcpSettingsPanel: React.FC = () => {
  const { tr } = useI18n();
  const [apiInfo, setApiInfo] = useState<PlanningApiInfoDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadApiInfo = async () => {
    if (!window.electronAPI?.getPlanningApiInfo) {
      setLoadError(tr('API-Status ist in diesem App-Prozess nicht verfuegbar.', 'API status is not available in this app process.'));
      return;
    }
    try {
      const result = await window.electronAPI.getPlanningApiInfo();
      setApiInfo(result);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    void loadApiInfo();
  }, []);

  const baseUrl = apiInfo?.baseUrl || DEFAULT_BASE_URL;
  const apiUrl = apiInfo?.apiUrl || `${baseUrl}/api/`;
  const mcpUrl = apiInfo?.mcpUrl || `${baseUrl}/mcp`;
  const docsUrl = apiInfo?.docsUrl || apiUrl;
  const openApiUrl = apiInfo?.openApiUrl || `${baseUrl}/api/openapi.json`;
  const apiHost = apiInfo?.host || '127.0.0.1';
  const apiPort = String(apiInfo?.port || apiInfo?.preferredPort || 2990);

  const planningEndpoints = useMemo<EndpointInfo[]>(() => [
    { method: 'GET', path: '/api/health', description: tr('Status, Port und MCP-Adresse pruefen.', 'Check status, port, and MCP URL.') },
    { method: 'GET', path: '/api/', description: tr('HTML-Dokumentation der lokalen API.', 'HTML documentation for the local API.') },
    { method: 'GET', path: '/api/openapi.json', description: tr('Maschinenlesbare API-Beschreibung.', 'Machine-readable API description.') },
    { method: 'GET', path: '/api/projects', description: tr('Planungsprojekte mit Todo-Zaehlern listen.', 'List planning projects with todo counts.') },
    { method: 'POST', path: '/api/projects', description: tr('Geplantes Projekt erstellen.', 'Create a planned project.') },
    { method: 'GET', path: '/api/repositories', description: tr('Bekannte Repositories und Planner-Verknuepfung listen.', 'List known repositories and planner links.') },
    { method: 'POST', path: '/api/repositories/ensure', description: tr('Planner-Projekt fuer repoPath erstellen oder holen.', 'Create or get planner project for repoPath.') },
    { method: 'GET', path: '/api/repositories/todos', description: tr('Todos aller Repository-Projekte abrufen.', 'Fetch todos from repository projects.') },
    { method: 'GET', path: '/api/todos', description: tr('Todos filtern und nach Dringlichkeit sortieren.', 'Filter todos and sort by urgency.') },
    { method: 'POST', path: '/api/todos', description: tr('Todo erstellen.', 'Create a todo.') },
    { method: 'GET', path: '/api/todos/next', description: tr('Naechste offene Todos nach Dringlichkeit.', 'Next open todos by urgency.') },
    { method: 'PATCH', path: '/api/todos/:id', description: tr('Todo aktualisieren.', 'Update a todo.') },
    { method: 'POST', path: '/api/todos/:id/move', description: tr('Todo in Tab, Status oder Projekt verschieben.', 'Move a todo to a tab, status, or project.') },
    { method: 'DELETE', path: '/api/todos/:id', description: tr('Todo loeschen.', 'Delete a todo.') },
    { method: 'GET/POST', path: '/api/tabs/:tab/todos', description: tr('Todos in idea, bug, planned, working, blocked oder done lesen/erstellen.', 'Read or create todos in idea, bug, planned, working, blocked, or done.') },
    { method: 'GET', path: '/api/agent/next', description: tr('Agenten-Shortcut fuer offene Arbeit in Projekt X.', 'Agent shortcut for open work in project X.') },
  ], [tr]);

  const gitEndpoints = useMemo<EndpointInfo[]>(() => [
    { method: 'GET', path: '/api/git/status', description: tr('Branch-Sync, staged, unstaged, untracked und conflicts.', 'Branch sync, staged, unstaged, untracked, and conflicts.') },
    { method: 'GET', path: '/api/git/working-tree', description: tr('Working-Tree-Status plus Diff-Statistiken.', 'Working tree status plus diff statistics.') },
    { method: 'GET', path: '/api/git/diff', description: tr('Diff-Text fuer unstaged, staged oder commit scope.', 'Diff text for unstaged, staged, or commit scope.') },
    { method: 'GET/POST', path: '/api/git/branches', description: tr('Branches listen oder Branch erstellen.', 'List branches or create a branch.') },
    { method: 'POST', path: '/api/git/branches/checkout', description: tr('Branch auschecken oder erstellen und auschecken.', 'Checkout a branch or create and checkout it.') },
    { method: 'POST', path: '/api/git/branches/rename', description: tr('Lokalen Branch umbenennen.', 'Rename local branch.') },
    { method: 'POST', path: '/api/git/branches/delete', description: tr('Lokalen Branch loeschen.', 'Delete local branch.') },
    { method: 'GET', path: '/api/git/commits', description: tr('Commit-Historie lesen.', 'Read commit history.') },
    { method: 'POST', path: '/api/git/stage', description: tr('Pfade stagen. Benoetigt confirm:true.', 'Stage paths. Requires confirm:true.') },
    { method: 'POST', path: '/api/git/unstage', description: tr('Pfade unstagen. Benoetigt confirm:true.', 'Unstage paths. Requires confirm:true.') },
    { method: 'POST', path: '/api/git/commit', description: tr('Commit aus staged changes erstellen. Benoetigt confirm:true.', 'Create commit from staged changes. Requires confirm:true.') },
    { method: 'GET', path: '/api/git/remotes', description: tr('Remotes listen.', 'List remotes.') },
    { method: 'POST', path: '/api/git/remotes/fetch', description: tr('Fetch ausfuehren. Benoetigt confirm:true.', 'Run fetch. Requires confirm:true.') },
    { method: 'POST', path: '/api/git/remotes/pull', description: tr('Pull ausfuehren. Benoetigt confirm:true.', 'Run pull. Requires confirm:true.') },
    { method: 'POST', path: '/api/git/remotes/push', description: tr('Push ausfuehren. Benoetigt confirm:true.', 'Run push. Requires confirm:true.') },
  ], [tr]);

  const mcpEndpoints = useMemo<EndpointInfo[]>(() => [
    { method: 'POST', path: '/mcp', description: tr('MCP-aehnlicher JSON-RPC-Endpunkt fuer initialize, tools/list und tools/call.', 'MCP-style JSON-RPC endpoint for initialize, tools/list, and tools/call.') },
    { method: 'GET', path: '/api/mcp/tools', description: tr('Tool-Katalog ueber REST lesen.', 'Read the tool catalog through REST.') },
    { method: 'POST', path: '/api/mcp/tools/call', description: tr('MCP-Tool ueber REST-Wrapper ausfuehren.', 'Run an MCP tool through the REST wrapper.') },
  ], [tr]);

  const nextTodosCurl = `curl "${baseUrl}/api/agent/next?repoPath=<REPO_PATH_URL_ENCODED>&limit=10"`;
  const createTodoCurl = `curl -X POST "${baseUrl}/api/todos" -H "content-type: application/json" -d "{\\"repoPath\\":\\"D:\\\\\\\\Projects\\\\\\\\Software\\\\\\\\Open-Git-Control\\",\\"title\\":\\"Naechste Arbeit\\",\\"status\\":\\"planned\\",\\"priority\\":\\"high\\"}"`;
  const listToolsCurl = `curl -X POST "${mcpUrl}" -H "content-type: application/json" -d "{\\"jsonrpc\\":\\"2.0\\",\\"id\\":1,\\"method\\":\\"tools/list\\"}"`;
  const callToolCurl = `curl -X POST "${mcpUrl}" -H "content-type: application/json" -d "{\\"jsonrpc\\":\\"2.0\\",\\"id\\":2,\\"method\\":\\"tools/call\\",\\"params\\":{\\"name\\":\\"get_next_todos\\",\\"arguments\\":{\\"repoPath\\":\\"D:\\\\\\\\Projects\\\\\\\\Software\\\\\\\\Open-Git-Control\\",\\"limit\\":5}}}"`;
  const mcpConfig = buildAgentConfig(mcpUrl);

  return (
    <div className="settings-grid">
      <section className="settings-card">
        <div className="settings-card-header-row">
          <h3>{tr('Lokale API', 'Local API')}</h3>
          <button className="staging-tool-btn" type="button" onClick={() => void loadApiInfo()}>
            <RefreshCw size={13} />
            {tr('Aktualisieren', 'Refresh')}
          </button>
        </div>
        <p>
          {tr(
            'Diese Werte gelten fuer den aktuell laufenden App-Prozess. Wenn Port 2990 belegt ist, zeigt die App hier den tatsaechlichen Ausweichport.',
            'These values belong to the current app process. If port 2990 is occupied, the app shows the actual fallback port here.',
          )}
        </p>
        {loadError && <p className="settings-danger">{loadError}</p>}
        {apiInfo?.error && <p className="settings-danger">{apiInfo.error}</p>}
        <div className="settings-api-status-grid">
          <CopyValueRow label={tr('Status', 'Status')} value={apiInfo?.status || 'starting'} />
          <CopyValueRow label="IP" value={apiHost} />
          <CopyValueRow label="Port" value={apiPort} />
          <CopyValueRow label={tr('Base URL', 'Base URL')} value={baseUrl} />
          <CopyValueRow label={tr('API-Doku', 'API docs')} value={docsUrl} />
          <CopyValueRow label="OpenAPI" value={openApiUrl} />
          <CopyValueRow label="MCP" value={mcpUrl} />
        </div>
      </section>

      <section className="settings-card">
        <h3>{tr('KI-Agent verbinden', 'Connect an AI agent')}</h3>
        <p>
          {tr(
            'Wenn dein Agent HTTP-MCP oder JSON-RPC ueber HTTP unterstuetzt, verwende die MCP-URL direkt. Fuer reine REST-Agenten reichen die /api-Endpunkte.',
            'If your agent supports HTTP MCP or JSON-RPC over HTTP, use the MCP URL directly. For REST-only agents, use the /api endpoints.',
          )}
        </p>
        <div className="settings-api-command-block">
          <div className="settings-card-header-row">
            <span>{tr('MCP Server Config', 'MCP server config')}</span>
            <CopyButton value={mcpConfig} />
          </div>
          <pre>{mcpConfig}</pre>
        </div>
        <div className="settings-api-command-grid">
          <CopyValueRow label={tr('Tools listen', 'List tools')} value={listToolsCurl} />
          <CopyValueRow label={tr('Tool ausfuehren', 'Call tool')} value={callToolCurl} />
          <CopyValueRow label={tr('Naechste Todos', 'Next todos')} value={nextTodosCurl} />
          <CopyValueRow label={tr('Todo erstellen', 'Create todo')} value={createTodoCurl} />
        </div>
      </section>

      <section className="settings-card">
        <h3>{tr('Planning-Endpunkte', 'Planning endpoints')}</h3>
        <EndpointTable endpoints={planningEndpoints} />
      </section>

      <section className="settings-card">
        <h3>{tr('Git-Endpunkte', 'Git endpoints')}</h3>
        <p>{tr('Schreibende Git-Endpunkte erwarten immer confirm:true im JSON-Body.', 'Write-capable Git endpoints always require confirm:true in the JSON body.')}</p>
        <EndpointTable endpoints={gitEndpoints} />
      </section>

      <section className="settings-card">
        <h3>{tr('MCP-Endpunkte', 'MCP endpoints')}</h3>
        <EndpointTable endpoints={mcpEndpoints} />
      </section>
    </div>
  );
};
