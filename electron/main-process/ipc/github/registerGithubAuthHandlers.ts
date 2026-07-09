import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { GitHubService } from '../../../GitHubService';
import type { AppSettings } from '../../../settings';
import { IpcChannel } from '../../../../src/types/ipcContract';
import { runGithubCliOneClickLogin } from '../../githubCliAuth';
import { clearSavedGithubTokenSecurely, readSavedGithubTokenWithHost, saveGithubTokenSecurely } from '../../secureStore';
import { toErrorMessage } from './githubHandlerUtils';

type RegisterGithubAuthHandlersDeps = {
  githubService: GitHubService;
  readSettingsWithMigration: () => AppSettings;
};

export function registerGithubAuthHandlers({ githubService, readSettingsWithMigration }: RegisterGithubAuthHandlersDeps): void {
  ipcMain.handle(IpcChannel.GithubAuth, async (_event: IpcMainInvokeEvent, token: string, host?: string) => {
    const settings = readSettingsWithMigration();
    const normalizedHost = githubService.normalizeHost(host || settings.githubHost);
    const success = await githubService.authenticate(token, normalizedHost);
    if (success) {
      saveGithubTokenSecurely(token, normalizedHost);
    }
    return success;
  });

  ipcMain.handle(IpcChannel.GithubGetSavedAuthStatus, async () => {
    const savedToken = readSavedGithubTokenWithHost();
    const settings = readSettingsWithMigration();
    const normalizedHost = githubService.normalizeHost(settings.githubHost);
    return {
      hasSavedToken: Boolean(savedToken?.token && (savedToken.host ? savedToken.host === normalizedHost : normalizedHost === 'github.com')),
      authenticated: githubService.isAuthenticated(),
      username: githubService.getUsername(),
      oauthConfigured: githubService.isDeviceFlowConfigured(settings.githubOauthClientId, settings.githubHost),
    };
  });

  ipcMain.handle(IpcChannel.GithubLoginWithSavedToken, async () => {
    const savedToken = readSavedGithubTokenWithHost();
    if (!savedToken?.token) {
      githubService.logout();
      return { success: false, authenticated: false, username: null };
    }

    const settings = readSettingsWithMigration();
    const normalizedHost = githubService.normalizeHost(settings.githubHost);
    if (savedToken.host && savedToken.host !== normalizedHost) {
      githubService.logout();
      return {
        success: false,
        authenticated: false,
        username: null,
        error: 'Saved GitHub token belongs to a different host.',
      };
    }
    if (!savedToken.host && normalizedHost !== 'github.com') {
      clearSavedGithubTokenSecurely();
      githubService.logout();
      return {
        success: false,
        authenticated: false,
        username: null,
        error: 'Saved legacy GitHub token is not host-bound. Please sign in again for this host.',
      };
    }

    const success = await githubService.authenticate(savedToken.token, normalizedHost);
    if (!success) {
      clearSavedGithubTokenSecurely();
      return { success: false, authenticated: false, username: null };
    }
    saveGithubTokenSecurely(savedToken.token, normalizedHost);

    return {
      success: true,
      authenticated: true,
      username: githubService.getUsername(),
    };
  });

  ipcMain.handle(IpcChannel.GithubDeviceStart, async () => {
    try {
      const settings = readSettingsWithMigration();
      const flow = await githubService.startDeviceFlow(settings.githubOauthClientId, settings.githubHost);
      return { success: true, data: flow };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Device Flow konnte nicht gestartet werden.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IpcChannel.GithubDevicePoll, async (_event: IpcMainInvokeEvent, deviceCode: string) => {
    try {
      const normalizedDeviceCode = (deviceCode || '').trim();
      if (!normalizedDeviceCode) {
        return { success: false, error: 'device_code fehlt' };
      }

      const settings = readSettingsWithMigration();
      const normalizedHost = githubService.normalizeHost(settings.githubHost);
      const result = await githubService.pollDeviceFlow(normalizedDeviceCode, settings.githubOauthClientId, normalizedHost);
      if (result.status === 'pending') {
        return { success: true, data: { status: 'pending', interval: result.interval || null } };
      }

      if (result.status === 'error') {
        return {
          success: true,
          data: {
            status: 'error',
            error: result.error,
            errorDescription: result.errorDescription || null,
          },
        };
      }

      const authenticated = await githubService.authenticate(result.accessToken, normalizedHost);
      if (!authenticated) {
        return { success: false, error: 'Authentifizierung mit Device-Flow Token fehlgeschlagen.' };
      }

      saveGithubTokenSecurely(result.accessToken, normalizedHost);
      return {
        success: true,
        data: {
          status: 'success',
          username: githubService.getUsername(),
        },
      };
    } catch (error: unknown) {
      const message = toErrorMessage(error, 'Device Flow Polling fehlgeschlagen.');
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IpcChannel.GithubWebLogin, async () => {
    try {
      const settings = readSettingsWithMigration();
      const normalizedHost = githubService.normalizeHost(settings.githubHost);
      const tokenResult = await runGithubCliOneClickLogin(normalizedHost);

      const authenticated = await githubService.authenticate(tokenResult.accessToken, normalizedHost);
      if (!authenticated) {
        return { success: false, error: 'Authentifizierung mit GitHub CLI Token fehlgeschlagen.' };
      }

      saveGithubTokenSecurely(tokenResult.accessToken, normalizedHost);
      return {
        success: true,
        data: {
          username: githubService.getUsername(),
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'GitHub 1-Klick Login fehlgeschlagen.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IpcChannel.GithubLogout, async () => {
    githubService.logout();
    clearSavedGithubTokenSecurely();
    return { success: true };
  });

  ipcMain.handle(IpcChannel.GithubCheckAuthStatus, async () => {
    return {
      authenticated: githubService.isAuthenticated(),
      username: githubService.getUsername(),
    };
  });
}
