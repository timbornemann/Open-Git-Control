import React, { useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import type { PlanningApiInfoDto, PlanningApiTokenLifetimeDto } from '../../global';
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

const formatDateTime = (value: number | null): string | null => {
  if (!value) return null;
  return new Date(value).toLocaleString();
};

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

const buildAgentConfig = (mcpUrl: string, authHeaderName: string, authToken: string | null): string => JSON.stringify({
  mcpServers: {
    'open-git-control': {
      type: 'http',
      url: mcpUrl,
      ...(authToken ? { headers: { [authHeaderName]: authToken } } : {}),
    },
  },
}, null, 2);

export const ApiMcpSettingsPanel: React.FC = () => {
  const { tr } = useI18n();
  const [apiInfo, setApiInfo] = useState<PlanningApiInfoDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenLifetime, setTokenLifetime] = useState<PlanningApiTokenLifetimeDto>('month');
  const [tokenActionError, setTokenActionError] = useState<string | null>(null);
  const [tokenActionMessage, setTokenActionMessage] = useState<string | null>(null);
  const [isTokenActionRunning, setIsTokenActionRunning] = useState(false);

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

  const runTokenAction = async (action: 'generate' | 'clear') => {
    if (!window.electronAPI) return;
    setIsTokenActionRunning(true);
    setTokenActionError(null);
    setTokenActionMessage(null);
    try {
      const result = action === 'generate'
        ? await window.electronAPI.generatePlanningApiToken(tokenLifetime)
        : await window.electronAPI.clearPlanningApiToken();
      setApiInfo(result);
      setLoadError(null);
      setTokenActionMessage(action === 'generate'
        ? tr('Neuer API-Token ist aktiv.', 'New API token is active.')
        : tr('Gespeicherter API-Token wurde entfernt.', 'Saved API token was removed.'));
    } catch (error) {
      setTokenActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsTokenActionRunning(false);
    }
  };

  const baseUrl = apiInfo?.baseUrl || DEFAULT_BASE_URL;
  const apiUrl = apiInfo?.apiUrl || `${baseUrl}/api/`;
  const mcpUrl = apiInfo?.mcpUrl || `${baseUrl}/mcp`;
  const docsUrl = apiInfo?.docsUrl || apiUrl;
  const openApiUrl = apiInfo?.openApiUrl || `${baseUrl}/api/openapi.json`;
  const apiHost = apiInfo?.host || '127.0.0.1';
  const apiPort = String(apiInfo?.port || apiInfo?.preferredPort || 2990);
  const authHeaderName = apiInfo?.authHeaderName || 'x-open-git-control-token';
  const authToken = apiInfo?.authToken || null;
  const authHeader = `-H "${authHeaderName}: ${authToken || '<TOKEN>'}"`;
  const authTokenSource = apiInfo?.authTokenSource || 'session';
  const authTokenSourceLabel = authTokenSource === 'environment'
    ? tr('Umgebungsvariable', 'Environment variable')
    : authTokenSource === 'saved'
      ? tr('Gespeichert', 'Saved')
      : tr('Temporär', 'Temporary');
  const authTokenExpiryLabel = authTokenSource === 'session'
    ? tr('Bis zum App-Neustart', 'Until app restart')
    : apiInfo?.authTokenExpiresAt
      ? formatDateTime(apiInfo.authTokenExpiresAt) || '-'
      : tr('Dauerhaft', 'Persistent');
  const tokenManagerDisabled = !apiInfo?.authTokenManageable || isTokenActionRunning;
  const clearTokenDisabled = tokenManagerDisabled || !apiInfo?.authTokenPersistent;

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

  const mcpEndpoints = useMemo<EndpointInfo[]>(() => [
    { method: 'POST', path: '/mcp', description: tr('MCP-aehnlicher JSON-RPC-Endpunkt fuer initialize, tools/list und tools/call.', 'MCP-style JSON-RPC endpoint for initialize, tools/list, and tools/call.') },
    { method: 'GET', path: '/api/mcp/tools', description: tr('Tool-Katalog ueber REST lesen.', 'Read the tool catalog through REST.') },
    { method: 'POST', path: '/api/mcp/tools/call', description: tr('MCP-Tool ueber REST-Wrapper ausfuehren.', 'Run an MCP tool through the REST wrapper.') },
  ], [tr]);

  const nextTodosCurl = `curl "${baseUrl}/api/agent/next?repoPath=<REPO_PATH_URL_ENCODED>&limit=10" ${authHeader}`;
  const createTodoCurl = `curl -X POST "${baseUrl}/api/todos" ${authHeader} -H "content-type: application/json" -d "{\\"repoPath\\":\\"D:\\\\\\\\Projects\\\\\\\\Software\\\\\\\\Open-Git-Control\\",\\"title\\":\\"Naechste Arbeit\\",\\"status\\":\\"planned\\",\\"priority\\":\\"high\\"}"`;
  const listToolsCurl = `curl -X POST "${mcpUrl}" ${authHeader} -H "content-type: application/json" -d "{\\"jsonrpc\\":\\"2.0\\",\\"id\\":1,\\"method\\":\\"tools/list\\"}"`;
  const callToolCurl = `curl -X POST "${mcpUrl}" ${authHeader} -H "content-type: application/json" -d "{\\"jsonrpc\\":\\"2.0\\",\\"id\\":2,\\"method\\":\\"tools/call\\",\\"params\\":{\\"name\\":\\"get_next_todos\\",\\"arguments\\":{\\"repoPath\\":\\"D:\\\\\\\\Projects\\\\\\\\Software\\\\\\\\Open-Git-Control\\",\\"limit\\":5}}}"`;
  const mcpConfig = buildAgentConfig(mcpUrl, authHeaderName, authToken);

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
          <CopyValueRow label={tr('Token-Header', 'Token header')} value={authHeaderName} />
          <CopyValueRow label={tr('API-Token', 'API token')} value={authToken || tr('Noch nicht verfuegbar', 'Not available yet')} />
          <CopyValueRow label={tr('Token-Quelle', 'Token source')} value={authTokenSourceLabel} />
          <CopyValueRow label={tr('Token gueltig', 'Token valid')} value={authTokenExpiryLabel} />
        </div>
        <div className="settings-api-token-manager">
          <div className="settings-api-token-controls">
            <label htmlFor="planning-api-token-lifetime">{tr('Gueltigkeit', 'Validity')}</label>
            <select
              id="planning-api-token-lifetime"
              value={tokenLifetime}
              onChange={(event) => setTokenLifetime(event.target.value as PlanningApiTokenLifetimeDto)}
              disabled={tokenManagerDisabled}
            >
              <option value="day">{tr('1 Tag', '1 day')}</option>
              <option value="month">{tr('1 Monat', '1 month')}</option>
              <option value="year">{tr('1 Jahr', '1 year')}</option>
              <option value="forever">{tr('Immer', 'Forever')}</option>
            </select>
            <button
              className="staging-tool-btn"
              type="button"
              onClick={() => void runTokenAction('generate')}
              disabled={tokenManagerDisabled}
            >
              <KeyRound size={13} />
              {isTokenActionRunning ? tr('Speichere...', 'Saving...') : tr('Token generieren', 'Generate token')}
            </button>
            <button
              className="staging-tool-btn"
              type="button"
              onClick={() => void runTokenAction('clear')}
              disabled={clearTokenDisabled}
            >
              <Trash2 size={13} />
              {tr('Gespeicherten Token loeschen', 'Delete saved token')}
            </button>
          </div>
          {!apiInfo?.authTokenStorageAvailable && (
            <p className="settings-danger">{tr(
              'OS-Verschluesselung ist nicht verfuegbar; persistente API-Token koennen nicht gespeichert werden.',
              'OS encryption is not available; persistent API tokens cannot be saved.',
            )}</p>
          )}
          {authTokenSource === 'environment' && (
            <p>{tr(
              'OPEN_GIT_CONTROL_API_TOKEN ist gesetzt und ueberschreibt gespeicherte API-Token.',
              'OPEN_GIT_CONTROL_API_TOKEN is set and overrides saved API tokens.',
            )}</p>
          )}
          {tokenActionError && <p className="settings-danger">{tokenActionError}</p>}
          {tokenActionMessage && <p className="settings-success">{tokenActionMessage}</p>}
        </div>
      </section>

      <section className="settings-card">
        <h3>{tr('KI-Agent verbinden', 'Connect an AI agent')}</h3>
        <p>
          {tr(
            'Wenn dein Agent HTTP-MCP oder JSON-RPC ueber HTTP unterstuetzt, verwende die MCP-URL direkt. Fuer reine REST-Agenten reichen die /api-Endpunkte. Die lokale API stellt nur Planning-Funktionen bereit; Git- und GitHub-Operationen werden nicht exportiert. Sende bei allen Daten- und Tool-Aufrufen den Token-Header mit.',
            'If your agent supports HTTP MCP or JSON-RPC over HTTP, use the MCP URL directly. For REST-only agents, use the /api endpoints. The local API only exposes planning features; Git and GitHub operations are not exported. Send the token header with all data and tool calls.',
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
        <h3>{tr('MCP-Endpunkte', 'MCP endpoints')}</h3>
        <EndpointTable endpoints={mcpEndpoints} />
      </section>
    </div>
  );
};
