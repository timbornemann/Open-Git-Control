import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import type { PlanningApiInfoDto, PlanningApiTokenLifetimeDto } from '@/global';
import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';

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
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copyValue = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button className="settings-copy-btn" type="button" onClick={() => void copyValue()} title={t('generated.components.actiontoastviewport.copy_5c2a9afe')}>
      <Copy size={13} />
      {copied ? t('generated.components.layout.apimcpsettingspanel.copied_08c1a6a7') : label || t('generated.components.actiontoastviewport.copy_5c2a9afe')}
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

const buildAgentConfig = (mcpUrl: string, authHeaderName: string, authToken: string | null): string =>
  JSON.stringify(
    {
      mcpServers: {
        'open-git-control': {
          type: 'http',
          url: mcpUrl,
          ...(authToken ? { headers: { [authHeaderName]: authToken } } : {}),
        },
      },
    },
    null,
    2,
  );

export const ApiMcpSettingsPanel: React.FC = () => {
  const { t } = useI18n();
  const [apiInfo, setApiInfo] = useState<PlanningApiInfoDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenLifetime, setTokenLifetime] = useState<PlanningApiTokenLifetimeDto>('month');
  const [tokenActionError, setTokenActionError] = useState<string | null>(null);
  const [tokenActionMessage, setTokenActionMessage] = useState<string | null>(null);
  const [isTokenActionRunning, setIsTokenActionRunning] = useState(false);

  const loadApiInfo = useCallback(async () => {
    if (!appClient.isAvailable()) {
      setLoadError(t('generated.components.layout.apimcpsettingspanel.api_status_is_not_available_in_this_app_process_e90733fe'));
      return;
    }
    try {
      const result = await appClient.getPlanningApiInfo();
      setApiInfo(result);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [t]);

  useEffect(() => {
    void loadApiInfo();
  }, [loadApiInfo]);

  const runTokenAction = async (action: 'generate' | 'clear') => {
    if (!appClient.isAvailable()) return;
    setIsTokenActionRunning(true);
    setTokenActionError(null);
    setTokenActionMessage(null);
    try {
      const result = action === 'generate' ? await appClient.generatePlanningApiToken(tokenLifetime) : await appClient.clearPlanningApiToken();
      setApiInfo(result);
      setLoadError(null);
      setTokenActionMessage(
        action === 'generate'
          ? t('generated.components.layout.apimcpsettingspanel.new_api_token_is_active_93efc190')
          : t('generated.components.layout.apimcpsettingspanel.saved_api_token_was_removed_57346f73'),
      );
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
  const authTokenSourceLabel =
    authTokenSource === 'environment'
      ? t('generated.components.layout.apimcpsettingspanel.environment_variable_c6f17ddc')
      : authTokenSource === 'saved'
        ? t('generated.components.layout.apimcpsettingspanel.saved_f27acef4')
        : t('generated.components.layout.apimcpsettingspanel.temporary_d13a9244');
  const authTokenExpiryLabel =
    authTokenSource === 'session'
      ? t('generated.components.layout.apimcpsettingspanel.until_app_restart_5c7de626')
      : apiInfo?.authTokenExpiresAt
        ? formatDateTime(apiInfo.authTokenExpiresAt) || '-'
        : t('generated.components.layout.apimcpsettingspanel.persistent_33c50e91');
  const tokenManagerDisabled = !apiInfo?.authTokenManageable || isTokenActionRunning;
  const clearTokenDisabled = tokenManagerDisabled || !apiInfo?.authTokenPersistent;

  const planningEndpoints = useMemo<EndpointInfo[]>(
    () => [
      { method: 'GET', path: '/api/health', description: t('generated.components.layout.apimcpsettingspanel.check_status_port_and_mcp_url_b8b9a843') },
      { method: 'GET', path: '/api/', description: t('generated.components.layout.apimcpsettingspanel.html_documentation_for_the_local_api_d9361870') },
      { method: 'GET', path: '/api/openapi.json', description: t('generated.components.layout.apimcpsettingspanel.machine_readable_api_description_240ffe8c') },
      {
        method: 'GET',
        path: '/api/projects',
        description: t('generated.components.layout.apimcpsettingspanel.list_planning_projects_with_todo_counts_8731df40'),
      },
      { method: 'POST', path: '/api/projects', description: t('generated.components.layout.apimcpsettingspanel.create_a_planned_project_1b2753a8') },
      {
        method: 'GET',
        path: '/api/repositories',
        description: t('generated.components.layout.apimcpsettingspanel.list_known_repositories_and_planner_links_c650f361'),
      },
      {
        method: 'POST',
        path: '/api/repositories/ensure',
        description: t('generated.components.layout.apimcpsettingspanel.create_or_get_planner_project_for_repopath_334abe51'),
      },
      {
        method: 'GET',
        path: '/api/repositories/todos',
        description: t('generated.components.layout.apimcpsettingspanel.fetch_todos_from_repository_projects_0a36fb2b'),
      },
      { method: 'GET', path: '/api/todos', description: t('generated.components.layout.apimcpsettingspanel.filter_todos_and_sort_by_urgency_7e9cb339') },
      { method: 'POST', path: '/api/todos', description: t('generated.components.layout.apimcpsettingspanel.create_a_todo_b647e553') },
      { method: 'GET', path: '/api/todos/next', description: t('generated.components.layout.apimcpsettingspanel.next_open_todos_by_urgency_962c5683') },
      { method: 'PATCH', path: '/api/todos/:id', description: t('generated.components.layout.apimcpsettingspanel.update_a_todo_77229825') },
      {
        method: 'POST',
        path: '/api/todos/:id/move',
        description: t('generated.components.layout.apimcpsettingspanel.move_a_todo_to_a_tab_status_or_project_f38b773a'),
      },
      { method: 'DELETE', path: '/api/todos/:id', description: t('generated.components.layout.apimcpsettingspanel.delete_a_todo_e08a8642') },
      {
        method: 'GET/POST',
        path: '/api/tabs/:tab/todos',
        description: t('generated.components.layout.apimcpsettingspanel.read_or_create_todos_in_idea_bug_planned_working_blocked_534eb46b'),
      },
      {
        method: 'GET',
        path: '/api/agent/next',
        description: t('generated.components.layout.apimcpsettingspanel.agent_shortcut_for_open_work_in_project_x_053c8a6e'),
      },
    ],
    [t],
  );

  const mcpEndpoints = useMemo<EndpointInfo[]>(
    () => [
      {
        method: 'POST',
        path: '/mcp',
        description: t('generated.components.layout.apimcpsettingspanel.mcp_style_json_rpc_endpoint_for_initialize_tools_list_an_8e0f7a51'),
      },
      { method: 'GET', path: '/api/mcp/tools', description: t('generated.components.layout.apimcpsettingspanel.read_the_tool_catalog_through_rest_d27974db') },
      {
        method: 'POST',
        path: '/api/mcp/tools/call',
        description: t('generated.components.layout.apimcpsettingspanel.run_an_mcp_tool_through_the_rest_wrapper_dee47730'),
      },
    ],
    [t],
  );

  const nextTodosCurl = `curl "${baseUrl}/api/agent/next?repoPath=<REPO_PATH_URL_ENCODED>&limit=10" ${authHeader}`;
  const createTodoCurl = `curl -X POST "${baseUrl}/api/todos" ${authHeader} -H "content-type: application/json" -d "{\\"repoPath\\":\\"D:\\\\\\\\Projects\\\\\\\\Software\\\\\\\\Open-Git-Control\\",\\"title\\":\\"Naechste Arbeit\\",\\"status\\":\\"planned\\",\\"priority\\":\\"high\\"}"`;
  const listToolsCurl = `curl -X POST "${mcpUrl}" ${authHeader} -H "content-type: application/json" -d "{\\"jsonrpc\\":\\"2.0\\",\\"id\\":1,\\"method\\":\\"tools/list\\"}"`;
  const callToolCurl = `curl -X POST "${mcpUrl}" ${authHeader} -H "content-type: application/json" -d "{\\"jsonrpc\\":\\"2.0\\",\\"id\\":2,\\"method\\":\\"tools/call\\",\\"params\\":{\\"name\\":\\"get_next_todos\\",\\"arguments\\":{\\"repoPath\\":\\"D:\\\\\\\\Projects\\\\\\\\Software\\\\\\\\Open-Git-Control\\",\\"limit\\":5}}}"`;
  const mcpConfig = buildAgentConfig(mcpUrl, authHeaderName, authToken);

  return (
    <div className="settings-grid">
      <section className="settings-card">
        <div className="settings-card-header-row">
          <h3>{t('generated.components.layout.apimcpsettingspanel.local_api_940afb5b')}</h3>
          <button className="staging-tool-btn" type="button" onClick={() => void loadApiInfo()}>
            <RefreshCw size={13} />
            {t('generated.components.layout.apimcpsettingspanel.refresh_4825b0d7')}
          </button>
        </div>
        <p>{t('generated.components.layout.apimcpsettingspanel.these_values_belong_to_the_current_app_process_if_port_2_891cfc37')}</p>
        {loadError && <p className="settings-danger">{loadError}</p>}
        {apiInfo?.error && <p className="settings-danger">{apiInfo.error}</p>}
        <div className="settings-api-status-grid">
          <CopyValueRow label={t('generated.components.layout.apimcpsettingspanel.status_b853ab43')} value={apiInfo?.status || 'starting'} />
          <CopyValueRow label="IP" value={apiHost} />
          <CopyValueRow label="Port" value={apiPort} />
          <CopyValueRow label={t('generated.components.layout.apimcpsettingspanel.base_url_929883ce')} value={baseUrl} />
          <CopyValueRow label={t('generated.components.layout.apimcpsettingspanel.api_docs_3610985f')} value={docsUrl} />
          <CopyValueRow label="OpenAPI" value={openApiUrl} />
          <CopyValueRow label="MCP" value={mcpUrl} />
          <CopyValueRow label={t('generated.components.layout.apimcpsettingspanel.token_header_2861ebc8')} value={authHeaderName} />
          <CopyValueRow
            label={t('generated.components.layout.apimcpsettingspanel.api_token_2d54a561')}
            value={authToken || t('generated.components.layout.apimcpsettingspanel.not_available_yet_f74be795')}
          />
          <CopyValueRow label={t('generated.components.layout.apimcpsettingspanel.token_source_65f47a01')} value={authTokenSourceLabel} />
          <CopyValueRow label={t('generated.components.layout.apimcpsettingspanel.token_valid_cecc6640')} value={authTokenExpiryLabel} />
        </div>
        <div className="settings-api-token-manager">
          <div className="settings-api-token-controls">
            <label htmlFor="planning-api-token-lifetime">{t('generated.components.layout.apimcpsettingspanel.validity_e481f83d')}</label>
            <select
              id="planning-api-token-lifetime"
              value={tokenLifetime}
              onChange={(event) => setTokenLifetime(event.target.value as PlanningApiTokenLifetimeDto)}
              disabled={tokenManagerDisabled}
            >
              <option value="day">{t('generated.components.layout.apimcpsettingspanel.1_day_104e7836')}</option>
              <option value="month">{t('generated.components.layout.apimcpsettingspanel.1_month_81ffd88d')}</option>
              <option value="year">{t('generated.components.layout.apimcpsettingspanel.1_year_032918f1')}</option>
              <option value="forever">{t('generated.components.layout.apimcpsettingspanel.forever_dab8b802')}</option>
            </select>
            <button className="staging-tool-btn" type="button" onClick={() => void runTokenAction('generate')} disabled={tokenManagerDisabled}>
              <KeyRound size={13} />
              {isTokenActionRunning
                ? t('generated.components.layout.apimcpsettingspanel.saving_cf3ffe37')
                : t('generated.components.layout.apimcpsettingspanel.generate_token_8fa2cce1')}
            </button>
            <button className="staging-tool-btn" type="button" onClick={() => void runTokenAction('clear')} disabled={clearTokenDisabled}>
              <Trash2 size={13} />
              {t('generated.components.layout.apimcpsettingspanel.delete_saved_token_0f0d2306')}
            </button>
          </div>
          {!apiInfo?.authTokenStorageAvailable && (
            <p className="settings-danger">
              {t('generated.components.layout.apimcpsettingspanel.os_encryption_is_not_available_persistent_api_tokens_can_975016ad')}
            </p>
          )}
          {authTokenSource === 'environment' && (
            <p>{t('generated.components.layout.apimcpsettingspanel.open_git_control_api_token_is_set_and_overrides_saved_ap_c28b0658')}</p>
          )}
          {tokenActionError && <p className="settings-danger">{tokenActionError}</p>}
          {tokenActionMessage && <p className="settings-success">{tokenActionMessage}</p>}
        </div>
      </section>

      <section className="settings-card">
        <h3>{t('generated.components.layout.apimcpsettingspanel.connect_an_ai_agent_be1931f0')}</h3>
        <p>{t('generated.components.layout.apimcpsettingspanel.if_your_agent_supports_http_mcp_or_json_rpc_over_http_us_7564fb62')}</p>
        <div className="settings-api-command-block">
          <div className="settings-card-header-row">
            <span>{t('generated.components.layout.apimcpsettingspanel.mcp_server_config_0229cc08')}</span>
            <CopyButton value={mcpConfig} />
          </div>
          <pre>{mcpConfig}</pre>
        </div>
        <div className="settings-api-command-grid">
          <CopyValueRow label={t('generated.components.layout.apimcpsettingspanel.list_tools_ed53da16')} value={listToolsCurl} />
          <CopyValueRow label={t('generated.components.layout.apimcpsettingspanel.call_tool_e25d577f')} value={callToolCurl} />
          <CopyValueRow label={t('generated.components.layout.apimcpsettingspanel.next_todos_24b89c6d')} value={nextTodosCurl} />
          <CopyValueRow label={t('generated.components.layout.apimcpsettingspanel.create_todo_a64f0415')} value={createTodoCurl} />
        </div>
      </section>

      <section className="settings-card">
        <h3>{t('generated.components.layout.apimcpsettingspanel.planning_endpoints_8f68ac5f')}</h3>
        <EndpointTable endpoints={planningEndpoints} />
      </section>

      <section className="settings-card">
        <h3>{t('generated.components.layout.apimcpsettingspanel.mcp_endpoints_2f04d803')}</h3>
        <EndpointTable endpoints={mcpEndpoints} />
      </section>
    </div>
  );
};
