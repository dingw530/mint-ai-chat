import { callEndpoint } from '../api/_base';
import type { WikiFileTreeNode } from '@/types';

export interface WikiListResponse {
  tree: WikiFileTreeNode[];
  total: number;
}

export interface WikiReadResponse {
  content: string;
  path: string;
  name: string;
  size: number;
}

export function listWiki(): Promise<WikiListResponse> {
  return callEndpoint<WikiListResponse>('wiki:list');
}

export function readWiki(path: string): Promise<WikiReadResponse> {
  return callEndpoint<WikiReadResponse>('wiki:read', path);
}
