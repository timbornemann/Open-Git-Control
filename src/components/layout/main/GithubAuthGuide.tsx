import React from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { GithubAuthHelpMethod } from '@/app/state/contracts';
import { appClient } from '@/services/appClient';

const linkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  border: '1px solid var(--border-color)',
  borderRadius: '6px',
  backgroundColor: 'var(--bg-dark)',
  color: 'var(--text-primary)',
  padding: '6px 8px',
  fontSize: '0.76rem',
  cursor: 'pointer',
};

const openExternal = (url: string) => {
  if (!appClient.isAvailable()) return;
  void appClient.openExternalUrl(url);
};

type CopyableValueRowProps = {
  label: string;
  value: string;
};

const CopyableValueRow: React.FC<CopyableValueRowProps> = ({ label, value }) => {
  const { t } = useI18n();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '130px 1fr auto',
        alignItems: 'center',
        gap: '8px',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        padding: '6px 8px',
        backgroundColor: 'var(--bg-dark)',
      }}
    >
      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{label}</div>
      <code style={{ fontSize: '0.74rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</code>
      <button
        className="icon-btn"
        onClick={() => void navigator.clipboard.writeText(value)}
        style={{ fontSize: '0.72rem', padding: '3px 7px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
      >
        <Copy size={11} /> {t('generated.components.actiontoastviewport.copy_5c2a9afe')}
      </button>
    </div>
  );
};

type GithubAuthGuideProps = {
  method: Exclude<GithubAuthHelpMethod, null>;
  onClose: () => void;
};

export const GithubAuthGuide: React.FC<GithubAuthGuideProps> = ({ method, onClose }) => {
  const { t } = useI18n();

  if (method === 'pat') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontWeight: 700 }}>{t('generated.components.layout.main.githubauthguide.method_1_pat_step_by_step_8be31b40')}</div>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: '0.74rem', padding: '3px 8px' }}>
            {t('generated.components.actiontoastviewport.close_181764fa')}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {t('generated.components.layout.main.githubauthguide.direct_copy_values_a47e037b')}
          </div>
          <CopyableValueRow
            label={t('generated.components.layout.main.githubauthguide.pat_url_0653be9b')}
            value="https://github.com/settings/tokens/new?scopes=repo,user&description=Open-Git-Control"
          />
          <CopyableValueRow label={t('generated.components.layout.main.githubauthguide.note_ea35c916')} value="Open-Git-Control" />
          <CopyableValueRow label={t('generated.components.layout.main.githubauthguide.scopes_6897f833')} value="repo,read:user" />
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={linkStyle} onClick={() => openExternal('https://github.com/settings/tokens/new?scopes=repo,user&description=Open-Git-Control')}>
            <ExternalLink size={12} /> {t('generated.components.layout.main.githubauthguide.open_token_page_3cd9a682')}
          </button>
          <button style={linkStyle} onClick={() => openExternal('https://github.com/settings/personal-access-tokens')}>
            <ExternalLink size={12} /> {t('generated.components.layout.main.githubauthguide.view_all_tokens_d00176d0')}
          </button>
        </div>

        <ol style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.5, fontSize: '0.82rem' }}>
          <li>{t('generated.components.layout.main.githubauthguide.open_browser_github_com_top_right_avatar_settings_cc7202ab')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.in_left_sidebar_developer_settings_personal_access_token_44c06e62')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.click_generate_new_token_25b2c904')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.field_note_enter_e_g_open_git_control_7cf254aa')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.field_expiration_choose_e_g_90_days_c4991e97')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.set_checkboxes_repo_and_read_user_6b8bdd9c')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.click_generate_token_and_copy_token_immediately_53e3a386')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.back_in_app_paste_token_into_pat_field_and_click_connect_18f2d008')}</li>
        </ol>
      </div>
    );
  }

  if (method === 'device') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontWeight: 700 }}>{t('generated.components.layout.main.githubauthguide.method_2_oauth_device_flow_step_by_step_b8683b32')}</div>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: '0.74rem', padding: '3px 8px' }}>
            {t('generated.components.actiontoastviewport.close_181764fa')}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {t('generated.components.layout.main.githubauthguide.direct_copy_values_a47e037b')}
          </div>
          <CopyableValueRow label={t('generated.components.layout.main.githubauthguide.application_name_63a11e81')} value="Open-Git-Control Local" />
          <CopyableValueRow label={t('generated.components.layout.main.githubauthguide.homepage_url_761e1021')} value="https://localhost" />
          <CopyableValueRow label={t('generated.components.layout.main.githubauthguide.callback_url_5d702006')} value="http://localhost/callback" />
          <CopyableValueRow
            label={t('generated.components.layout.main.githubauthguide.settings_field_c180b6ff')}
            value="GitHub OAuth Client ID (Device Flow)"
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={linkStyle} onClick={() => openExternal('https://github.com/settings/developers')}>
            <ExternalLink size={12} /> {t('generated.components.layout.main.githubauthguide.developer_settings_016b30a0')}
          </button>
          <button style={linkStyle} onClick={() => openExternal('https://github.com/settings/apps/new')}>
            <ExternalLink size={12} /> {t('generated.components.layout.main.githubauthguide.new_oauth_app_5ff7425d')}
          </button>
        </div>

        <ol style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.5, fontSize: '0.82rem' }}>
          <li>{t('generated.components.layout.main.githubauthguide.in_github_settings_developer_settings_oauth_apps_new_oau_7f4322cc')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.field_application_name_e_g_open_git_control_local_43ad3686')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.field_homepage_url_e_g_https_localhost_05697d7c')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.field_authorization_callback_url_e_g_http_localhost_call_5cad09fb')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.click_register_application_and_then_copy_the_client_id_6c264de6')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.in_app_settings_tab_field_github_oauth_client_id_device_1018ab13')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.go_back_to_github_tab_click_start_device_flow_0ef93029')}</li>
          <li>{t('generated.components.layout.main.githubauthguide.in_browser_visit_shown_url_enter_code_click_continue_and_29232245')}</li>
        </ol>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontWeight: 700 }}>{t('generated.components.layout.main.githubauthguide.method_3_one_click_login_step_by_step_6d5e5618')}</div>
        <button className="icon-btn" onClick={onClose} style={{ fontSize: '0.74rem', padding: '3px 8px' }}>
          {t('generated.components.actiontoastviewport.close_181764fa')}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {t('generated.components.layout.main.githubauthguide.direct_copy_values_a47e037b')}
        </div>
        <CopyableValueRow label={t('generated.components.layout.main.githubauthguide.cli_url_385ee071')} value="https://cli.github.com/" />
        <CopyableValueRow label={t('generated.components.layout.main.githubauthguide.scopes_6897f833')} value="repo,read:user" />
        <CopyableValueRow
          label={t('generated.components.layout.main.githubauthguide.gh_command_d7dfde28')}
          value="gh auth login --hostname github.com --web --git-protocol https --scopes repo,read:user"
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button style={linkStyle} onClick={() => openExternal('https://cli.github.com/')}>
          <ExternalLink size={12} /> {t('generated.components.layout.main.githubauthguide.download_github_cli_e1f1463c')}
        </button>
        <button
          style={linkStyle}
          onClick={() => openExternal('https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/authorizing-oauth-apps')}
        >
          <ExternalLink size={12} /> {t('generated.components.layout.main.githubauthguide.oauth_approval_help_d7d07c91')}
        </button>
      </div>

      <ol style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.5, fontSize: '0.82rem' }}>
        <li>{t('generated.components.layout.main.githubauthguide.if_not_installed_yet_install_github_cli_gh_from_cli_gith_d1bbea8d')}</li>
        <li>{t('generated.components.layout.main.githubauthguide.keep_app_open_on_github_tab_and_click_sign_in_with_githu_599dcdb0')}</li>
        <li>{t('generated.components.layout.main.githubauthguide.browser_opens_complete_github_login_and_confirm_2fa_if_n_9ec3d6e3')}</li>
        <li>{t('generated.components.layout.main.githubauthguide.if_asked_allow_access_for_github_cli_authorize_7f6d15f5')}</li>
        <li>{t('generated.components.layout.main.githubauthguide.after_approval_app_returns_automatically_and_connects_yo_46ed1d90')}</li>
      </ol>
      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Check size={12} />
        {t('generated.components.layout.main.githubauthguide.note_this_method_does_not_require_your_own_oauth_client_12296b19')}
      </div>
    </div>
  );
};
