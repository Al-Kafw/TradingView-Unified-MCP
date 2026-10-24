
import { ToolError } from './errors.mjs';

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

      if (!APPROVED_TOOLS.has(descriptor.name)) {
        throw new ToolError(
          'MUTATION_TOOL_NOT_APPROVED',
          'This TradingView mutation has not been approved for isolated QA.'
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
