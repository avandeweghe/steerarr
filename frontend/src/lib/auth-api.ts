import type { AuthSettingsRequest, AuthStatus, LoginRequest } from '@steerarr/shared';
import { api } from './api';

export function getAuthStatus(): Promise<AuthStatus> {
  return api<AuthStatus>('auth/status');
}

export function logIn(username: string, password: string): Promise<void> {
  const body: LoginRequest = { username, password };
  return api<void>('auth/login', { method: 'POST', body });
}

export function logOut(): Promise<void> {
  return api<void>('auth/logout', { method: 'POST' });
}

/** Logs out every other device; this one stays logged in. */
export function logOutOthers(): Promise<void> {
  return api<void>('auth/logout-others', { method: 'POST' });
}

export function saveAuthSettings(request: AuthSettingsRequest): Promise<AuthStatus> {
  return api<AuthStatus>('auth/settings', { method: 'PUT', body: request });
}
