import { BrowserManager } from './browser.mjs';
import {
  withQaReplayProcessLock
} from './qa-replay-process-lock.mjs';
import { createMutationPolicy } from './mutation-policy.mjs';
import { buildRuntime } from '../runtime.mjs';
import {
  runQaReplayCanaryCore,
  ES_QA_BASELINE
} from './qa-replay-orchestrator.mjs';

const ENDPOINT = 'http://127.0.0.1:9223';
const QA = ES_QA_BASELINE.layout_id;

export function assertQaReplayRunnerEnvironment(env) {
  const required = {
    TV_READONLY: '0',
    TV_ENABLE_WRITES: '1',
    TV_ALLOW_QA_REPLAY: '1',
    TV_QA_REPLAY_LAYOUT_ID: QA,
    TV_ALLOWED_LAYOUT_IDS: QA,
    TV_ALLOWED_LAYOUT_NAMES: ES_QA_BASELINE.layout_name
  };

  const disabled = [
    'TV_ALLOW_QA_LAYOUT_COPY',
    'TV_ALLOW_QA_PINE_DRAFT',
    'TV_ALLOW_QA_PINE_COMPILE',
    'TV_ALLOW_QA_PINE_ROLLBACK',
    'TV_ENABLE_GENERIC_UI'
  ];

  if (
    !env ||
    Object.entries(required).some(
      ([key, value]) => env[key] !== value
    ) ||
    disabled.some(key => env[key] === '1') ||
    ![
      'I_APPROVE_ES_QA_REPLAY_NO_RELOAD',
      'I_APPROVE_ES_QA_REPLAY_AND_DISCARD_UNSAVED_CHANGES'
    ].includes(env.TV_QA_CANARY_RUN)
  ) {
    throw Error('QA_CANARY_ENV_NOT_APPROVED');
  }

  return true;
}

export function assertQaReplayRunnerTargets({
  qaTargetId,
  protectedTargetId
}) {
  const validId = value =>
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{6,128}$/.test(value);

  if (
    !validId(qaTargetId) ||
    !validId(protectedTargetId) ||
    qaTargetId === protectedTargetId
  ) {
    throw Error('QA_CANARY_TARGETS_INVALID');
  }

  return true;
}

/*
 * This is deliberately NOT a registered MCP tool.
 * The production path constructs the real policy-enforced runtime.
 * Browser injection and fake registry injection are not accepted.
 */
export async function runPolicyBoundQaReplayCanary({
  qaTargetId,
  protectedTargetId
}) {
  const env = Object.freeze({ ...process.env });
  assertQaReplayRunnerEnvironment(env);
  assertQaReplayRunnerTargets({
    qaTargetId,
    protectedTargetId
  });

  return withQaReplayProcessLock(async () => {
    const runtimeBrowser = new BrowserManager({
      endpoint: ENDPOINT
    });

  try {
    const mutationPolicy = createMutationPolicy(env);

    const runtime = buildRuntime({
      browser: runtimeBrowser,
      readonly: false,
      genericUi: false,
      mutationPolicy
    });

    if (
      runtime.registry.readonly !== false ||
      runtime.registry.mutationPolicy !== mutationPolicy ||
      runtime.registry.get('replay_start').mutates !== true ||
      runtime.registry.get('replay_step').mutates !== true ||
      runtime.registry.get('replay_stop').mutates !== true
    ) {
      throw Error('QA_POLICY_RUNTIME_BINDING_FAILED');
    }

    return await runQaReplayCanaryCore({
      browserFactory: () => new BrowserManager({
        endpoint: ENDPOINT
      }),
      registry: runtime.registry,
      allowDirtyReload: env.TV_QA_CANARY_RUN ===
        'I_APPROVE_ES_QA_REPLAY_AND_DISCARD_UNSAVED_CHANGES',
      qaTargetId,
      protectedTargetId,
      maxAttempts: 40,
      intervalMs: 500
    });

  } finally {
    await runtimeBrowser.close();
  }
  });
}
