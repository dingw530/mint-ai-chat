/**
 * Versioned validation profiles for source, UI, runtime, Wiki, and Electron changes.
 * Each profile only references root npm scripts so local hooks and CI share commands.
 */

/** Create one root npm-script check definition. */
const npmCheck = (name, args) => ({ name, command: 'npm', args });

export const VERIFICATION_PROFILES = Object.freeze({
  source: {
    description: 'Repository-wide source checks used before every commit.',
    checks: [
      npmCheck('typecheck', ['run', 'typecheck']),
      npmCheck('test', ['test']),
      npmCheck('engineering-tests', ['run', 'test:engineering']),
      npmCheck('lint', ['run', 'lint']),
      npmCheck('build', ['run', 'build']),
    ],
  },
  ui: {
    description: 'Client code plus a change-bound browser acceptance check.',
    checks: [
      npmCheck('client-typecheck', ['run', 'typecheck', '-w', 'mint-client']),
      npmCheck('client-test', ['run', 'test:client']),
      npmCheck('client-lint', ['run', 'lint:client']),
      npmCheck('client-build', ['run', 'build', '-w', 'mint-client']),
    ],
    requiresHarnessChange: true,
  },
  'agent-runtime': {
    description: 'Server orchestration and evaluation harness checks.',
    checks: [
      npmCheck('server-typecheck', ['run', 'typecheck', '-w', 'mint-server']),
      npmCheck('server-test', ['run', 'test:server']),
      npmCheck('agent-test', ['run', 'test:agent']),
      npmCheck('server-lint', ['run', 'lint:server']),
      npmCheck('server-build', ['run', 'build', '-w', 'mint-server']),
    ],
  },
  wiki: {
    description: 'Wiki source changes plus the change-bound user-flow acceptance check.',
    checks: [
      npmCheck('server-typecheck', ['run', 'typecheck', '-w', 'mint-server']),
      npmCheck('server-test', ['run', 'test:server']),
      npmCheck('agent-test', ['run', 'test:agent']),
      npmCheck('server-lint', ['run', 'lint:server']),
      npmCheck('build', ['run', 'build']),
    ],
    requiresHarnessChange: true,
  },
  electron: {
    description: 'Source checks followed by a fresh macOS application archive inspection.',
    checks: [
      npmCheck('source', ['run', 'verify:source']),
      npmCheck('electron-artifact', ['run', 'verify:electron-artifact:mac']),
    ],
  },
});

/** Return the named validation profile or reject an unknown profile. */
export function getVerificationProfile(name) {
  const profile = VERIFICATION_PROFILES[name];
  if (!profile) throw new Error(`Unknown verification profile: ${name}`);
  return profile;
}

/** Build the ordered checks for one profile and its optional SDD change. */
export function buildVerificationChecks(name, changeId) {
  const profile = getVerificationProfile(name);
  if (profile.requiresHarnessChange && !changeId) {
    throw new Error(`Profile "${name}" requires --change <SDD change id> for browser acceptance evidence.`);
  }

  const checks = profile.checks.map((check) => ({ ...check }));
  if (profile.requiresHarnessChange) {
    checks.push(npmCheck('harness-verify', ['run', 'harness:verify', '--', '--change', changeId]));
  }
  return checks;
}

/** Summarize one completed or planned validation run as JSON-safe evidence. */
export function createEvidence(profile, checks, startedAt, completedAt) {
  const passed = checks.every((check) => check.status === 'passed' || check.status === 'planned');
  return { profile, startedAt, completedAt, passed, checks };
}
