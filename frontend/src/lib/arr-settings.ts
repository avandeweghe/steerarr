import type {
  ArrSettings,
  ArrSettingsSaveRequest,
  ArrSettingsTestRequest,
  ArrStatus,
} from '@steerarr/shared';
import { api } from './api';

/** Calls to the settings routes every *arr service has (see backend core/arr-service.ts). */
export const arrSettings = {
  get: (serviceId: string) => api<ArrSettings>(`${serviceId}/settings`),

  test: (serviceId: string, body: ArrSettingsTestRequest) =>
    api<ArrStatus>(`${serviceId}/settings/test`, { method: 'POST', body }),

  save: (serviceId: string, body: ArrSettingsSaveRequest) =>
    api<ArrSettings>(`${serviceId}/settings`, { method: 'PUT', body }),

  remove: (serviceId: string) => api<void>(`${serviceId}/settings`, { method: 'DELETE' }),
};
