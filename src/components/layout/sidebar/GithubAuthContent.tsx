import React from 'react';
import { Key, ExternalLink, Github, ShieldCheck, Copy, Info } from 'lucide-react';
import type { AppSidebarProps, GithubAuthHelpMethod } from './AppSidebar.types';
import { useI18n } from '@/i18n';
import { appClient } from '@/services/appClient';

type GithubAuthContentProps = Pick<
  AppSidebarProps,
  | 'tokenInput'
  | 'setTokenInput'
  | 'isAuthenticating'
  | 'authError'
  | 'setAuthError'
  | 'onTokenLogin'
  | 'oauthConfigured'
  | 'deviceFlow'
  | 'isDeviceFlowRunning'
  | 'deviceFlowError'
  | 'onStartDeviceFlowLogin'
  | 'onCancelAuthentication'
  | 'onCancelDeviceFlow'
  | 'isWebFlowRunning'
  | 'webFlowError'
  | 'onStartWebFlowLogin'
  | 'selectedGithubAuthHelpMethod'
  | 'onSelectGithubAuthHelpMethod'
>;

const HelpMethodButton: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
}> = ({ active, onClick, title }) => (
  <button className={`icon-btn sidebar-help-action ${active ? 'sidebar-help-action-active' : 'sidebar-help-action-inactive'}`} onClick={onClick} title={title}>
    <Info size={12} />
  </button>
);

const toggleMethod = (current: GithubAuthHelpMethod, next: Exclude<GithubAuthHelpMethod, null>, onSelect: (method: GithubAuthHelpMethod) => void) => {
  onSelect(current === next ? null : next);
};

export const GithubAuthContent: React.FC<GithubAuthContentProps> = ({
  tokenInput,
  setTokenInput,
  isAuthenticating,
  authError,
  setAuthError,
  onTokenLogin,
  oauthConfigured,
  deviceFlow,
  isDeviceFlowRunning,
  onStartDeviceFlowLogin,
  onCancelAuthentication,
  onCancelDeviceFlow,
  isWebFlowRunning,
  onStartWebFlowLogin,
  selectedGithubAuthHelpMethod,
  onSelectGithubAuthHelpMethod,
}) => {
  const { t } = useI18n();
  const canTokenLogin = Boolean(tokenInput.trim()) && !isAuthenticating && !isDeviceFlowRunning && !isWebFlowRunning;
  const canStartDeviceFlow = oauthConfigured && !isDeviceFlowRunning && !isAuthenticating && !isWebFlowRunning;
  const canStartWebFlow = !isWebFlowRunning && !isDeviceFlowRunning && !isAuthenticating;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '8px',
        textAlign: 'center',
        marginTop: '16px',
        minWidth: 0,
      }}
    >
      <Github size={48} style={{ margin: '0 auto', color: 'var(--text-secondary)' }} />
      <h3 style={{ margin: '8px 0 4px', fontSize: '1.1rem' }}>{t('generated.components.layout.sidebar.githubauthcontent.github_connect_e13591e7')}</h3>

      <div className="sidebar-panel-block">
        <div className="sidebar-panel-row">
          <div className="sidebar-panel-title">{t('generated.components.layout.sidebar.githubauthcontent.method_1_personal_access_token_pat_c80b91f2')}</div>
          <HelpMethodButton
            active={selectedGithubAuthHelpMethod === 'pat'}
            onClick={() => toggleMethod(selectedGithubAuthHelpMethod, 'pat', onSelectGithubAuthHelpMethod)}
            title={t('generated.components.layout.sidebar.githubauthcontent.show_step_by_step_guide_for_method_1_60a29ccc')}
          />
        </div>
        <p className="sidebar-meta-text">{t('generated.components.layout.sidebar.githubauthcontent.classic_sign_in_with_your_own_token_345eec09')}</p>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onSelectGithubAuthHelpMethod('pat');
            if (appClient.isAvailable()) {
              void appClient.openExternalUrl('https://github.com/settings/tokens/new?scopes=repo,user&description=Open-Git-Control');
            }
          }}
          style={{
            fontSize: '0.8rem',
            color: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: '4px',
            textDecoration: 'none',
          }}
        >
          <ExternalLink size={12} /> {t('generated.components.layout.sidebar.githubauthcontent.create_token_da21adca')}
        </a>
        <div className="sidebar-search-wrap">
          <Key size={14} className="sidebar-search-icon" />
          <input
            type="password"
            placeholder="ghp_xxx"
            value={tokenInput}
            onChange={(e) => {
              setTokenInput(e.target.value);
              setAuthError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canTokenLogin) onTokenLogin();
            }}
            className="sidebar-filter-input"
            style={{
              padding: '8px 8px 8px 28px',
              borderRadius: '4px',
              border: authError ? '1px solid var(--status-danger)' : '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-dark)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          />
        </div>
        <button
          disabled={!canTokenLogin}
          onClick={onTokenLogin}
          style={{
            padding: '8px',
            backgroundColor: canTokenLogin ? 'var(--accent-primary)' : 'var(--bg-dark)',
            color: canTokenLogin ? 'var(--on-accent)' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: '4px',
            cursor: canTokenLogin ? 'pointer' : 'not-allowed',
            fontWeight: 600,
          }}
        >
          {isAuthenticating
            ? t('generated.components.layout.sidebar.githubauthcontent.connecting_a77827d1')
            : t('generated.components.layout.sidebar.githubauthcontent.connect_with_token_85fe9356')}
        </button>
        {isAuthenticating && (
          <button
            onClick={onCancelAuthentication}
            style={{
              padding: '8px',
              backgroundColor: 'var(--bg-dark)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {t('generated.components.confirm.cancel_035b7526')}
          </button>
        )}
      </div>

      <div className="sidebar-panel-block">
        <div className="sidebar-panel-row">
          <div className="sidebar-panel-title">
            {t('generated.components.layout.sidebar.githubauthcontent.method_2_oauth_device_flow_alternative_b02d5009')}
          </div>
          <HelpMethodButton
            active={selectedGithubAuthHelpMethod === 'device'}
            onClick={() => toggleMethod(selectedGithubAuthHelpMethod, 'device', onSelectGithubAuthHelpMethod)}
            title={t('generated.components.layout.sidebar.githubauthcontent.show_step_by_step_guide_for_method_2_5ec106ba')}
          />
        </div>
        <p className="sidebar-meta-text">
          {t('generated.components.layout.sidebar.githubauthcontent.browser_based_sign_in_with_one_time_code_pat_remains_ava_b62a8cc4')}
        </p>

        {!oauthConfigured && (
          <div className="sidebar-meta-text" style={{ fontSize: '0.76rem', color: 'var(--status-danger)' }}>
            {t('generated.components.layout.sidebar.githubauthcontent.device_flow_is_not_configured_missing_github_oauth_clien_c635aff5')}
          </div>
        )}

        {deviceFlow && (
          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-primary)',
              textAlign: 'left',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              padding: '8px',
              backgroundColor: 'var(--bg-dark)',
              minWidth: 0,
            }}
          >
            <div className="sidebar-panel-row">
              <ShieldCheck size={12} />
              {t('generated.components.layout.sidebar.githubauthcontent.code_d1f8576a')}:{' '}
              <strong style={{ letterSpacing: '1px' }}>{deviceFlow.userCode}</strong>
              <button
                className="icon-btn sidebar-row-action-icon"
                style={{ marginLeft: 'auto' }}
                onClick={() => navigator.clipboard.writeText(deviceFlow.userCode)}
                title={t('generated.components.layout.sidebar.githubauthcontent.copy_code_94241686')}
              >
                <Copy size={12} />
              </button>
            </div>
            <div style={{ marginTop: '4px', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
              {t('generated.components.layout.sidebar.githubauthcontent.go_to_9aa3247d')}: {deviceFlow.verificationUri}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            disabled={!canStartDeviceFlow}
            onClick={onStartDeviceFlowLogin}
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: canStartDeviceFlow ? 'var(--accent-primary)' : 'var(--bg-dark)',
              color: canStartDeviceFlow ? 'var(--on-accent)' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '4px',
              cursor: canStartDeviceFlow ? 'pointer' : 'not-allowed',
              fontWeight: 600,
            }}
          >
            {isDeviceFlowRunning
              ? t('generated.components.layout.sidebar.githubauthcontent.waiting_for_authorization_3dfc6039')
              : t('generated.components.layout.sidebar.githubauthcontent.start_device_flow_867b47bb')}
          </button>
          {isDeviceFlowRunning && (
            <button
              onClick={onCancelDeviceFlow}
              style={{
                padding: '8px 10px',
                backgroundColor: 'var(--bg-dark)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {t('generated.components.confirm.cancel_035b7526')}
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-panel-block">
        <div className="sidebar-panel-row">
          <div className="sidebar-panel-title">{t('generated.components.layout.sidebar.githubauthcontent.method_3_one_click_github_login_36558320')}</div>
          <HelpMethodButton
            active={selectedGithubAuthHelpMethod === 'web'}
            onClick={() => toggleMethod(selectedGithubAuthHelpMethod, 'web', onSelectGithubAuthHelpMethod)}
            title={t('generated.components.layout.sidebar.githubauthcontent.show_step_by_step_guide_for_method_3_ec93d868')}
          />
        </div>
        <p className="sidebar-meta-text">
          {t('generated.components.layout.sidebar.githubauthcontent.no_oauth_app_or_keys_click_button_sign_in_in_browser_don_bcb115cc')}
        </p>

        <button
          disabled={!canStartWebFlow}
          onClick={onStartWebFlowLogin}
          style={{
            padding: '8px',
            backgroundColor: canStartWebFlow ? 'var(--accent-primary)' : 'var(--bg-dark)',
            color: canStartWebFlow ? 'var(--on-accent)' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: '4px',
            cursor: canStartWebFlow ? 'pointer' : 'not-allowed',
            fontWeight: 600,
          }}
        >
          {isWebFlowRunning
            ? t('generated.components.layout.sidebar.githubauthcontent.browser_login_in_progress_9cf3975c')
            : t('generated.components.layout.sidebar.githubauthcontent.sign_in_with_github_c275fc82')}
        </button>
        {isWebFlowRunning && (
          <button
            onClick={onCancelAuthentication}
            style={{
              marginTop: '6px',
              padding: '8px',
              width: '100%',
              backgroundColor: 'var(--bg-dark)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {t('generated.components.confirm.cancel_035b7526')}
          </button>
        )}
      </div>
    </div>
  );
};
