import * as wikiService from '../../services/api/wikiService.js';
import type { EndpointDescriptor } from '../types.js';

export const wikiEndpoints: EndpointDescriptor[] = [
  {
    id: 'wiki:list',
    method: 'GET',
    path: '/list',
    preloadMethod: 'listWiki',
    service: wikiService.listWiki,
    ipcServiceRef: { module: 'wikiSvc', method: 'listWiki' },
    args: [],
    result: 'direct',
  },
  {
    id: 'wiki:read',
    method: 'GET',
    path: '/read',
    preloadMethod: 'readWiki',
    service: (filePath: string) => wikiService.readWiki(filePath),
    ipcServiceRef: { module: 'wikiSvc', method: 'readWiki' },
    args: [{ from: 'query', name: 'path' }],
    result: 'direct',
  },
];
