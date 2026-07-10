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
  let authGeneration = 0;
  const beginAuthAttempt = (): number => {
    authGeneration += 1;
    return authGeneration;
  };
  const isCurrentAuthAttempt = (generation: number): boolean => generation === authGeneration;
  const serviceGeneration = (): number => githubService.getAuthenticationGeneration();
  const staleAuthError = () => ({ success: false, error: 'GitHub-Anmeldung wurde abgebrochen.' });

  ipcMain.handle(IpcChannel.GithubAuth, async (_event: IpcMainInvokeEvent, token: string, host?: string) => {
    const generation = beginAuthAttempt();
    const settings = readSettingsWithMigration();
    const normalizedHost = githubService.normalizeHost(host || settings.githubHost);
    const success = await githubService.authenticate(token, normalizedHost, () => isCurrentAuthAttempt(generation));
    if (success && isCurrentAuthAttempt(generation)) {
      saveGithubTokenSecurely(token, normalizedHost);
    }
    return success && isCurrentAuthAttempt(generation);
  });

  ipcMain.handle(IpcChannel.GithubCancelAuth, async () => {
    authGeneration += 1;
    githubService.cancelPendingAuthentication();
    return { success: true } as const;
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
    const generation = beginAuthAttempt();
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

    const success = await githubService.authenticate(savedToken.token, normalizedHost, () => isCurrentAuthAttempt(generation));
    if (!isCurrentAuthAttempt(generation)) {
      return { success: false, authenticated: false, username: null, error: 'GitHub-Anmeldung wurde abgebrochen.' };
    }
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
    const generation = beginAuthAttempt();
    const startingServiceGeneration = serviceGeneration();
    try {
      const settings = readSettingsWithMigration();
      const flow = await githubService.startDeviceFlow(settings.githubOauthClientId, settings.githubHost);
      if (!isCurrentAuthAttempt(generation) || serviceGeneration() !== startingServiceGeneration) return staleAuthError();
      return { success: true, data: flow };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Device Flow konnte nicht gestartet werden.';
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IpcChannel.GithubDevicePoll, async (_event: IpcMainInvokeEvent, deviceCode: string) => {
    const generation = beginAuthAttempt();
    const startingServiceGeneration = serviceGeneration();
    try {
      const normalizedDeviceCode = (deviceCode || '').trim();
      if (!normalizedDeviceCode) {
        return { success: false, error: 'device_code fehlt' };
      }

      const settings = readSettingsWithMigration();
      const normalizedHost = githubService.normalizeHost(settings.githubHost);
      const result = await githubService.pollDeviceFlow(normalizedDeviceCode, settings.githubOauthClientId, normalizedHost);
      if (!isCurrentAuthAttempt(generation) || serviceGeneration() !== startingServiceGeneration) return staleAuthError();
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

      const authenticated = await githubService.authenticate(result.accessToken, normalizedHost, () => isCurrentAuthAttempt(generation));
      if (!isCurrentAuthAttempt(generation)) return staleAuthError();
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
    const generation = beginAuthAttempt();
    const startingServiceGeneration = serviceGeneration();
    try {
      const settings = readSettingsWithMigration();
      const normalizedHost = githubService.normalizeHost(settings.githubHost);
      const tokenResult = await runGithubCliOneClickLogin(normalizedHost);
      if (!isCurrentAuthAttempt(generation) || serviceGeneration() !== startingServiceGeneration) return staleAuthError();

      const authenticated = await githubService.authenticate(tokenResult.accessToken, normalizedHost, () => isCurrentAuthAttempt(generation));
      if (!isCurrentAuthAttempt(generation)) return staleAuthError();
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
    authGeneration += 1;
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
