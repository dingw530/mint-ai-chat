import * as graphService from '../../services/api/graphService.js';
import type { EndpointDescriptor } from '../types.js';

export const graphEndpoints: EndpointDescriptor[] = [
  {
    id: 'graph:data',
    method: 'GET',
    path: '/data',
    preloadMethod: 'getGraphData',
    service: graphService.getGraphData,
    ipcServiceRef: { module: 'graphSvc', method: 'getGraphData' },
    args: [],
    result: 'direct',
  },
  {
    id: 'graph:node',
    method: 'GET',
    path: '/node/:id',
    preloadMethod: 'getGraphNode',
    service: (id: string) => graphService.getNode(id),
    ipcServiceRef: { module: 'graphSvc', method: 'getNode' },
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
  },
  {
    id: 'graph:neighbors',
    method: 'GET',
    path: '/node/:id/neighbors',
    preloadMethod: 'getGraphNodeNeighbors',
    service: (id: string) => graphService.getNodeNeighbors(id),
    ipcServiceRef: { module: 'graphSvc', method: 'getNodeNeighbors' },
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
  },
  {
    id: 'graph:search',
    method: 'GET',
    path: '/search',
    preloadMethod: 'searchGraphNodes',
    service: (query: string) => graphService.searchNodes(query),
    ipcServiceRef: { module: 'graphSvc', method: 'searchNodes' },
    args: [{ from: 'query', name: 'query' }],
    result: 'direct',
  },
  {
    id: 'graph:createNode',
    method: 'POST',
    path: '/node',
    preloadMethod: 'createGraphNode',
    service: (data: Record<string, unknown>) => {
      const node = graphService.createNode({
        label: data.label as string,
        type: data.type as 'concept' | 'practice' | 'methodology',
        sourceFile: data.sourceFile as string | undefined,
        properties: data.properties as Record<string, unknown> | undefined,
      });
      return node;
    },
    ipcServiceRef: { module: 'graphSvc', method: 'createNode' },
    args: [{ from: 'body' }],
    result: 'direct',
  },
  {
    id: 'graph:createEdge',
    method: 'POST',
    path: '/edge',
    preloadMethod: 'createGraphEdge',
    service: (data: Record<string, unknown>) => {
      const edge = graphService.createEdge({
        sourceId: data.sourceId as string,
        relation: data.relation as string,
        targetId: data.targetId as string,
        properties: data.properties as Record<string, unknown> | undefined,
        source: data.source as 'manual' | 'auto-extracted' | 'ai-generated' | undefined,
      });
      return edge;
    },
    ipcServiceRef: { module: 'graphSvc', method: 'createEdge' },
    args: [{ from: 'body' }],
    result: 'direct',
  },
  {
    id: 'graph:deleteNode',
    method: 'DELETE',
    path: '/node/:id',
    preloadMethod: 'deleteGraphNode',
    service: (id: string) => {
      graphService.deleteNode(id);
      return { success: true };
    },
    ipcServiceRef: { module: 'graphSvc', method: 'deleteNode' },
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
  },
  {
    id: 'graph:deleteEdge',
    method: 'DELETE',
    path: '/edge/:id',
    preloadMethod: 'deleteGraphEdge',
    service: (id: string) => {
      graphService.deleteEdge(id);
      return { success: true };
    },
    ipcServiceRef: { module: 'graphSvc', method: 'deleteEdge' },
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
  },
];
