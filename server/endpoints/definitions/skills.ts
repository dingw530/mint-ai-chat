import { listSkills } from '../../services/skillService.js';
import type { EndpointDescriptor } from '../types.js';

export const skillsEndpoints: EndpointDescriptor[] = [
  {
    id: 'skills:list',
    method: 'GET',
    path: '/',
    preloadMethod: 'getSkills',
    service: async () => {
      const skills = await listSkills();
      return { skills: skills.map((s: any) => ({ name: s.name, description: s.description })) };
    },
    ipcServiceRef: { module: 'skillSvc', method: 'listSkills' },
    result: 'direct',
    async: true,
  },
];
