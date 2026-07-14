import * as wikiService from '../../services/api/wikiService.js';
import type { EndpointDescriptor } from '../types.js';

export const wikiEndpoints: EndpointDescriptor[] = [
  {
    id: 'wiki:list',
    method: 'GET',
    path: '/list',
    preloadMethod: 'listWiki',
    service: wikiService.listWiki,
    args: [],
    result: 'direct',
  },
  {
    id: 'wiki:read',
    method: 'GET',
    path: '/read',
    preloadMethod: 'readWiki',
    service: (filePath: string) => wikiService.readWiki(filePath),
    args: [{ from: 'query', name: 'path' }],
    result: 'direct',
  },
  {
    id: 'wiki:schema',
    method: 'GET',
    path: '/schema',
    preloadMethod: 'getWikiSchema',
    service: wikiService.getSchema,
    args: [],
    result: 'direct',
  },
  {
    id: 'wiki:addCategory',
    method: 'POST',
    path: '/categories',
    preloadMethod: 'addWikiCategory',
    service: (category: string) => wikiService.addCategory(category),
    args: [{ from: 'body', name: 'category' }],
    result: 'direct',
  },
  {
    id: 'wiki:removeCategory',
    method: 'DELETE',
    path: '/categories/:category',
    preloadMethod: 'removeWikiCategory',
    service: (category: string) => wikiService.removeCategory(category),
    args: [{ from: 'path', name: 'category' }],
    result: 'direct',
  },
  {
    id: 'wiki:updateSchema',
    method: 'PUT',
    path: '/schema',
    preloadMethod: 'updateWikiSchema',
    service: (schema: unknown) => wikiService.updateSchema(schema as Parameters<typeof wikiService.updateSchema>[0]),
    args: [{ from: 'body' }],
    result: 'direct',
  },
];
