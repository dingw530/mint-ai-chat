import * as routingLogRepo from '../../repositories/routingLogRepository.js';
import type { EndpointDescriptor } from '../types.js';

function listRoutingLogs(conversationId?: string, page?: string, pageSize?: string) {
  const logs = routingLogRepo.findAll({
    conversationId: conversationId || undefined,
    page: page ? parseInt(page, 10) : undefined,
    pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
  });
  return { logs };
}

export const routingLogsEndpoints: EndpointDescriptor[] = [
  {
    id: 'routing-logs:list',
    method: 'GET',
    path: '/',
    preloadMethod: 'getRoutingLogs',
    service: listRoutingLogs,
    args: [
      { from: 'query', name: 'conversationId', optional: true },
      { from: 'query', name: 'page', optional: true },
      { from: 'query', name: 'pageSize', optional: true },
    ],
    result: 'direct',
  },
];
