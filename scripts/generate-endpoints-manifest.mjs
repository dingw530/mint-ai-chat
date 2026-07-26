import path from 'node:path';
import { endpointRegistry, writeManifest } from '../server/dist/endpoints/index.js';

const resourcePrefixes = Object.fromEntries(
  endpointRegistry.resources().map((resource) => [resource, resource]),
);

writeManifest(
  endpointRegistry.all(),
  resourcePrefixes,
  path.resolve('..', 'electron'),
);
