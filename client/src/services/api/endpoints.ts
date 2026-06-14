import type { EndpointOutput, EndpointInput } from '@/types';
import { callEndpoint } from '../api/_base';

export function getEndpoints(): Promise<{ endpoints: EndpointOutput[] }> {
  return callEndpoint('model-endpoints:list');
}

export function createEndpoint(data: EndpointInput): Promise<{ endpoint: EndpointOutput }> {
  return callEndpoint('model-endpoints:create', data);
}

export function updateEndpoint(id: string, data: EndpointInput): Promise<{ endpoint: EndpointOutput }> {
  return callEndpoint('model-endpoints:update', id, data);
}

export function deleteEndpoint(id: string): Promise<{ success: boolean }> {
  return callEndpoint('model-endpoints:delete', id);
}

export function activateEndpoint(id: string): Promise<{ success: boolean }> {
  return callEndpoint('model-endpoints:activate', id);
}
