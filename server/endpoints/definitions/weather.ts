import { executeTool } from '../../services/toolRegistry.js';
import { httpError } from '../helpers.js';
import type { EndpointDescriptor } from '../types.js';

async function queryWeather(city: string, days?: string) {
  if (!city || typeof city !== 'string') {
    throw httpError(400, 'Missing required parameter: city');
  }
  const daysNum = days ? parseInt(days, 10) : 3;
  if (days !== undefined && ![3, 7].includes(daysNum)) {
    throw httpError(400, 'days must be 3 or 7');
  }
  const result = await executeTool({
    id: '',
    type: 'function',
    function: {
      name: 'get_weather_forecast',
      arguments: JSON.stringify({ city, days: daysNum }),
    },
  });
  return { city, days: daysNum, forecast: result };
}

export const weatherEndpoints: EndpointDescriptor[] = [
  {
    id: 'weather:query',
    method: 'GET',
    path: '/query',
    preloadMethod: 'queryWeather',
    service: queryWeather,
    args: [
      { from: 'query', name: 'city' },
      { from: 'query', name: 'days', optional: true },
    ],
    result: 'direct',
    async: true,
  },
];
