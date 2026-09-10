import type { VisibleSettings, SettingsInput } from '@/types';
import { callEndpoint } from '../api/_base';

export function getSettings(): Promise<VisibleSettings> {
  return callEndpoint('settings:get');
}

export function saveSettings(settings: SettingsInput): Promise<void> {
  return callEndpoint('settings:save', settings);
}

export interface VectorConnectionTestResult {
  success: boolean;
  message?: string;
  dimensions?: number;
}

export function testEmbeddingConnection(data: {
  apiUrl: string;
  model: string;
  dimensions: number;
}): Promise<VectorConnectionTestResult> {
  return callEndpoint('settings:testEmbeddingConnection', data);
}

export function testChromaConnection(data: {
  url: string;
  apiKey?: string;
}): Promise<VectorConnectionTestResult> {
  return callEndpoint('settings:testChromaConnection', data);
}
