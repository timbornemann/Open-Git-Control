import React from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { GithubAuthHelpMethod } from '@/app/state/contracts';
import { Button, Toolbar } from '@/components/ui';
import { appClient } from '@/services/appClient';

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
    <div className="github-copy-row">
      <div className="github-copy-row__label">{label}</div>
      <code className="github-copy-row__value">{value}</code>
      <Button size="xs" variant="ghost" icon={<Copy size={11} />} onClick={() => void navigator.clipboard.writeText(value)}>
        {t('generated.components.actiontoastviewport.copy_5c2a9afe')}
      </Button>
    </div>
  );
};

type GithubAuthGuideProps = {
  method: Exclude<GithubAuthHelpMethod, null>;
  onClose: () => void;
};

type GuideLink = {
  label: string;
  url: string;
};

type GuideValue = {
  label: string;
  value: string;
};

type GuideContent = {
  links: GuideLink[];
  note?: string;
  steps: string[];
  title: string;
  values: GuideValue[];
};

export const GithubAuthGuide: React.FC<GithubAuthGuideProps> = ({ method, onClose }) => {
  const { t } = useI18n();

  const guideByMethod: Record<Exclude<GithubAuthHelpMethod, null>, GuideContent> = {
    pat: {
      title: t('generated.components.layout.main.githubauthguide.method_1_pat_step_by_step_8be31b40'),
      values: [
        {
          label: t('generated.components.layout.main.githubauthguide.pat_url_0653be9b'),
          value: 'https://github.com/settings/tokens/new?scopes=repo,user&description=Open-Git-Control',
        },
        { label: t('generated.components.layout.main.githubauthguide.note_ea35c916'), value: 'Open-Git-Control' },
        { label: t('generated.components.layout.main.githubauthguide.scopes_6897f833'), value: 'repo,read:user' },
      ],
      links: [
        {
          label: t('generated.components.layout.main.githubauthguide.open_token_page_3cd9a682'),
          url: 'https://github.com/settings/tokens/new?scopes=repo,user&description=Open-Git-Control',
        },
        {
          label: t('generated.components.layout.main.githubauthguide.view_all_tokens_d00176d0'),
          url: 'https://github.com/settings/personal-access-tokens',
        },
      ],
      steps: [
        t('generated.components.layout.main.githubauthguide.open_browser_github_com_top_right_avatar_settings_cc7202ab'),
        t('generated.components.layout.main.githubauthguide.in_left_sidebar_developer_settings_personal_access_token_44c06e62'),
        t('generated.components.layout.main.githubauthguide.click_generate_new_token_25b2c904'),
        t('generated.components.layout.main.githubauthguide.field_note_enter_e_g_open_git_control_7cf254aa'),
        t('generated.components.layout.main.githubauthguide.field_expiration_choose_e_g_90_days_c4991e97'),
        t('generated.components.layout.main.githubauthguide.set_checkboxes_repo_and_read_user_6b8bdd9c'),
        t('generated.components.layout.main.githubauthguide.click_generate_token_and_copy_token_immediately_53e3a386'),
        t('generated.components.layout.main.githubauthguide.back_in_app_paste_token_into_pat_field_and_click_connect_18f2d008'),
      ],
    },
    device: {
      title: t('generated.components.layout.main.githubauthguide.method_2_oauth_device_flow_step_by_step_b8683b32'),
      values: [
        { label: t('generated.components.layout.main.githubauthguide.application_name_63a11e81'), value: 'Open-Git-Control Local' },
        { label: t('generated.components.layout.main.githubauthguide.homepage_url_761e1021'), value: 'https://localhost' },
        { label: t('generated.components.layout.main.githubauthguide.callback_url_5d702006'), value: 'http://localhost/callback' },
        {
          label: t('generated.components.layout.main.githubauthguide.settings_field_c180b6ff'),
          value: 'GitHub OAuth Client ID (Device Flow)',
        },
      ],
      links: [
        {
          label: t('generated.components.layout.main.githubauthguide.developer_settings_016b30a0'),
          url: 'https://github.com/settings/developers',
        },
        {
          label: t('generated.components.layout.main.githubauthguide.new_oauth_app_5ff7425d'),
          url: 'https://github.com/settings/apps/new',
        },
      ],
      steps: [
        t('generated.components.layout.main.githubauthguide.in_github_settings_developer_settings_oauth_apps_new_oau_7f4322cc'),
        t('generated.components.layout.main.githubauthguide.field_application_name_e_g_open_git_control_local_43ad3686'),
        t('generated.components.layout.main.githubauthguide.field_homepage_url_e_g_https_localhost_05697d7c'),
        t('generated.components.layout.main.githubauthguide.field_authorization_callback_url_e_g_http_localhost_call_5cad09fb'),
        t('generated.components.layout.main.githubauthguide.click_register_application_and_then_copy_the_client_id_6c264de6'),
        t('generated.components.layout.main.githubauthguide.in_app_settings_tab_field_github_oauth_client_id_device_1018ab13'),
        t('generated.components.layout.main.githubauthguide.go_back_to_github_tab_click_start_device_flow_0ef93029'),
        t('generated.components.layout.main.githubauthguide.in_browser_visit_shown_url_enter_code_click_continue_and_29232245'),
      ],
    },
    web: {
      title: t('generated.components.layout.main.githubauthguide.method_3_one_click_login_step_by_step_6d5e5618'),
      values: [
        { label: t('generated.components.layout.main.githubauthguide.cli_url_385ee071'), value: 'https://cli.github.com/' },
        { label: t('generated.components.layout.main.githubauthguide.scopes_6897f833'), value: 'repo,read:user' },
        {
          label: t('generated.components.layout.main.githubauthguide.gh_command_d7dfde28'),
          value: 'gh auth login --hostname github.com --web --git-protocol https --scopes repo,read:user',
        },
      ],
      links: [
        {
          label: t('generated.components.layout.main.githubauthguide.download_github_cli_e1f1463c'),
          url: 'https://cli.github.com/',
        },
        {
          label: t('generated.components.layout.main.githubauthguide.oauth_approval_help_d7d07c91'),
          url: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/authorizing-oauth-apps',
        },
      ],
      steps: [
        t('generated.components.layout.main.githubauthguide.if_not_installed_yet_install_github_cli_gh_from_cli_gith_d1bbea8d'),
        t('generated.components.layout.main.githubauthguide.keep_app_open_on_github_tab_and_click_sign_in_with_githu_599dcdb0'),
        t('generated.components.layout.main.githubauthguide.browser_opens_complete_github_login_and_confirm_2fa_if_n_9ec3d6e3'),
        t('generated.components.layout.main.githubauthguide.if_asked_allow_access_for_github_cli_authorize_7f6d15f5'),
        t('generated.components.layout.main.githubauthguide.after_approval_app_returns_automatically_and_connects_yo_46ed1d90'),
      ],
      note: t('generated.components.layout.main.githubauthguide.note_this_method_does_not_require_your_own_oauth_client_12296b19'),
    },
  };

  const guide = guideByMethod[method];

  return (
    <div className="github-auth-guide">
      <div className="github-auth-guide__header">
        <div className="github-auth-guide__title">{guide.title}</div>
        <Button size="xs" variant="ghost" onClick={onClose}>
          {t('generated.components.actiontoastviewport.close_181764fa')}
        </Button>
      </div>

      <div className="github-auth-guide__section">
        <div className="github-auth-guide__kicker">{t('generated.components.layout.main.githubauthguide.direct_copy_values_a47e037b')}</div>
        {guide.values.map((value) => (
          <CopyableValueRow key={`${value.label}-${value.value}`} label={value.label} value={value.value} />
        ))}
      </div>

      <Toolbar className="github-auth-guide__actions">
        {guide.links.map((link) => (
          <Button key={link.url} variant="secondary" icon={<ExternalLink size={12} />} onClick={() => openExternal(link.url)}>
            {link.label}
          </Button>
        ))}
      </Toolbar>

      <ol className="github-auth-guide__steps">
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      {guide.note && (
        <div className="github-auth-guide__note">
          <Check size={12} />
          {guide.note}
        </div>
      )}
    </div>
  );
};
