import * as crypto from 'crypto';
import {
  SavedPlanningApiToken,
  clearSavedPlanningApiTokenSecurely,
  isPlanningApiTokenExpired,
  isSecureStorageAvailable,
  readSavedPlanningApiToken,
  savePlanningApiTokenSecurely,
} from './secureStore';

export type PlanningApiTokenLifetime = 'day' | 'month' | 'year' | 'forever';
export type PlanningApiTokenSource = 'environment' | 'saved' | 'session';

export type PlanningApiAuthState = {
  token: string;
  source: PlanningApiTokenSource;
  createdAt: number | null;
  expiresAt: number | null;
  persistent: boolean;
  manageable: boolean;
  storageAvailable: boolean;
};

const MIN_TOKEN_LENGTH = 16;
const DAY_MS = 24 * 60 * 60 * 1000;

let activeState: Omit<PlanningApiAuthState, 'manageable' | 'storageAvailable'> | null = null;

const cleanString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const createToken = (): string => crypto.randomBytes(32).toString('base64url');

const getConfiguredToken = (): string | null => {
  const token = cleanString(process.env.OPEN_GIT_CONTROL_API_TOKEN);
  return token.length >= MIN_TOKEN_LENGTH ? token : null;
};

const toState = (
  state: Omit<PlanningApiAuthState, 'manageable' | 'storageAvailable'>,
): PlanningApiAuthState => {
  const storageAvailable = isSecureStorageAvailable();
  return {
    ...state,
    storageAvailable,
    manageable: !getConfiguredToken() && storageAvailable,
  };
};

const createSessionState = (): Omit<PlanningApiAuthState, 'manageable' | 'storageAvailable'> => ({
  token: createToken(),
  source: 'session',
  createdAt: Date.now(),
  expiresAt: null,
  persistent: false,
});

const fromSavedToken = (
  saved: SavedPlanningApiToken,
): Omit<PlanningApiAuthState, 'manageable' | 'storageAvailable'> => ({
  token: saved.token,
  source: 'saved',
  createdAt: saved.createdAt,
  expiresAt: saved.expiresAt,
  persistent: true,
});

const getExpiryForLifetime = (lifetime: PlanningApiTokenLifetime, now = Date.now()): number | null => {
  if (lifetime === 'forever') return null;
  if (lifetime === 'day') return now + DAY_MS;
  if (lifetime === 'month') return now + 30 * DAY_MS;
  if (lifetime === 'year') return now + 365 * DAY_MS;
  throw new Error('Invalid Planning API token lifetime.');
};

export function getPlanningApiAuthState(): PlanningApiAuthState {
  const configuredToken = getConfiguredToken();
  if (configuredToken) {
    return toState({
      token: configuredToken,
      source: 'environment',
      createdAt: null,
      expiresAt: null,
      persistent: false,
    });
  }

  if (activeState?.source === 'saved') {
    if (!isPlanningApiTokenExpired(activeState)) {
      return toState(activeState);
    }
    clearSavedPlanningApiTokenSecurely();
    activeState = null;
  }

  if (!activeState || activeState.source !== 'session') {
    const savedToken = readSavedPlanningApiToken();
    if (savedToken) {
      if (!isPlanningApiTokenExpired(savedToken)) {
        activeState = fromSavedToken(savedToken);
        return toState(activeState);
      }
      clearSavedPlanningApiTokenSecurely();
    }
    activeState = createSessionState();
  }

  return toState(activeState);
}

export function generateSavedPlanningApiAuthToken(lifetime: PlanningApiTokenLifetime): PlanningApiAuthState {
  if (getConfiguredToken()) {
    throw new Error('OPEN_GIT_CONTROL_API_TOKEN is set and overrides generated Planning API tokens.');
  }
  if (!isSecureStorageAvailable()) {
    throw new Error('OS-backed encryption is not available. The Planning API token was not saved.');
  }

  const now = Date.now();
  const savedToken: SavedPlanningApiToken = {
    token: createToken(),
    createdAt: now,
    expiresAt: getExpiryForLifetime(lifetime, now),
  };

  if (!savePlanningApiTokenSecurely(savedToken)) {
    throw new Error('Planning API token could not be saved securely.');
  }

  activeState = fromSavedToken(savedToken);
  return toState(activeState);
}

export function clearSavedPlanningApiAuthToken(): PlanningApiAuthState {
  clearSavedPlanningApiTokenSecurely();
  activeState = null;
  return getPlanningApiAuthState();
}
