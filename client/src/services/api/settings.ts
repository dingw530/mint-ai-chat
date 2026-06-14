import type { VisibleSettings, SettingsInput } from '@/types';
import { callEndpoint } from '../api/_base';

export function getSettings(): Promise<VisibleSettings> {
  return callEndpoint('settings:get');
}

export function saveSettings(settings: SettingsInput): Promise<void> {
  return callEndpoint('settings:save', settings);
}
