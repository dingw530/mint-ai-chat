import type { EndpointOutput, EndpointInput } from '@/types';
import { callEndpoint } from '../api/_base';

export function getEndpoints(): Promise<{ endpoints: EndpointOutput[] }> {
  return callEndpoint('endpoints:list');
}

export function createEndpoint(data: EndpointInput): Promise<{ endpoint: EndpointOutput }> {
  return callEndpoint('endpoints:create', data);
}

export function updateEndpoint(id: string, data: EndpointInput): Promise<{ endpoint: EndpointOutput }> {
  return callEndpoint('endpoints:update', id, data);
}

export function deleteEndpoint(id: string): Promise<{ success: boolean }> {
  return callEndpoint('endpoints:delete', id);
}

export function activateEndpoint(id: string): Promise<{ success: boolean }> {
  return callEndpoint('endpoints:activate', id);
}
