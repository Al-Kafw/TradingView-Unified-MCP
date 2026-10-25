
import { ToolError } from './errors.mjs';

export const QA_PINE_DRAFT_SOURCE = [
  '//@version=6',
  'indicator("MCP QA Disposable Draft", overlay=true)',
  'plot(close)',
  ''
].join('\n');

// P2 initial scope: chart-context changes only.
// Other browser mutations require separate security reviews.
const APPROVED_TOOLS = new Set([
  'chart_set_symbol',
  'chart_set_timeframe'
]);

export function createMutationPolicy(env = process.env) {
  const raw = env.TV_ALLOWED_LAYOUT_IDS ?? '';
  const ids = raw === '' ? [] : raw.split(',').map(id => id.trim());

  if (
    raw.length > 2048 ||
    ids.length > 20 ||
    ids.some(id => !/^[A-Za-z0-9_-]{6,64}$/.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new ToolError(
      'MUTATION_POLICY_CONFIG_INVALID',
      'Invalid approved-layout configuration.'
    );
  }

  const rawNames = env.TV_ALLOWED_LAYOUT_NAMES ?? '';
  const names = rawNames === '' ? [] :
    rawNames.split(',').map(name => name.trim());

  const isQaName = name =>
    name === 'MCP Test' ||
    /^MCP QA(?:[ -][A-Za-z0-9][A-Za-z0-9 _.+-]{0,80})?$/.test(name);

  if (
    rawNames.length > 2048 ||
    names.length !== ids.length ||
    names.some(name => !isQaName(name)) ||
    new Set(names).size !== names.length
  ) {
    throw new ToolError(
      'MUTATION_POLICY_CONFIG_INVALID',
      'Approved layouts require matching, unique QA layout names.'
    );
  }

  const layouts = new Set(ids);
  const expectedNames = new Map(ids.map((id, i) => [id, names[i]]));

  return {
    assert(descriptor, args = {}) {
      if (!descriptor.mutates || descriptor.scope === 'local') return;

      const qaCopy =
        descriptor.name === 'layout_copy' &&
        env.TV_ALLOW_QA_LAYOUT_COPY === '1';

      const qaDraft =
        descriptor.name === 'pine_new_buffer' &&
        env.TV_ALLOW_QA_PINE_DRAFT === '1';

      if (!APPROVED_TOOLS.has(descriptor.name) && !qaCopy && !qaDraft) {
        throw new ToolError(
          'MUTATION_TOOL_NOT_APPROVED',
          'This TradingView mutation has not been approved for isolated QA.'
        );
      }

      if (qaCopy && (
        args.save_source !== false ||
        typeof args.name !== 'string' ||
        !/^MCP QA Recovery [A-Za-z0-9][A-Za-z0-9 _-]{0,50}$/.test(args.name) ||
        typeof args.idempotency_key !== 'string' ||
        args.idempotency_key.trim().length < 12
      )) {
        throw new ToolError(
          'MUTATION_COPY_ARGS_INVALID',
          'QA copying requires a recovery-only name, unique operation key and save_source=false.'
        );
      }

      if (qaDraft && (
        args.expected_layout_id !== env.TV_QA_PINE_DRAFT_LAYOUT_ID ||
        !/^MCP QA Recovery RestoreLab [A-Za-z0-9]{8}$/.test(
          expectedNames.get(args.expected_layout_id) ?? ''
        ) ||
        args.source !== QA_PINE_DRAFT_SOURCE ||
        !/^[a-f0-9]{64}$/.test(
          env.TV_QA_PINE_DRAFT_BINDING_SHA256 ?? ''
        ) ||
        args.expected_binding_sha256 !==
          env.TV_QA_PINE_DRAFT_BINDING_SHA256
      )) {
        throw new ToolError(
          'MUTATION_PINE_DRAFT_ARGS_INVALID',
          'QA Pine drafts require an exact restore lab, binding hash and fixed disposable source.'
        );
      }

      if (
        typeof args.expected_layout_id !== 'string' ||
        !layouts.has(args.expected_layout_id)
      ) {
        throw new ToolError(
          'MUTATION_LAYOUT_NOT_APPROVED',
          'The requested saved layout is not approved for writable QA.'
        );
      }
    },
    assertVerifiedLayout(descriptor, args = {}, actual = {}) {
      this.assert(descriptor, args);

      if (!descriptor.mutates || descriptor.scope === 'local') return;

      if ((descriptor.name === 'layout_copy' ||
           descriptor.name === 'pine_new_buffer') &&
          actual.has_changes !== false) {
        throw new ToolError(
          'MUTATION_SOURCE_NOT_CLEAN',
          'QA layout copying requires a clean saved source.'
        );
      }

      if (
        actual.layout_id !== args.expected_layout_id ||
        actual.name !== expectedNames.get(args.expected_layout_id)
      ) {
        throw new ToolError(
          'MUTATION_LAYOUT_NAME_MISMATCH',
          'The native layout identity or name does not match the approved QA asset.'
        );
      }
    }
  };
}
