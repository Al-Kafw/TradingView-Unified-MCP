/** Checkpointed copy → independently verify → configure → save → alert → verify.
 * A completed workflow proves saved configuration, never webhook delivery.
 */
import { createHash } from 'node:crypto';
import { ToolError, checkAbort } from '../core/errors.mjs';
import { createAlertProperties, validateAlertMessage } from './alerts.mjs';
import { findLayoutContext } from './layouts.mjs';
import { validateWebhook } from '../core/security.mjs';

const object = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const keySchema = { type: 'string', minLength: 6, maxLength: 140 };
const canonical = value => JSON.stringify(value, (_key, val) => val && typeof val === 'object' && !Array.isArray(val)
  ? Object.fromEntries(Object.keys(val).sort().map(key => [key, val[key]])) : val);
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
const checkpointKey = value => `copy-alert-workflow-${digest(value)}`;
const chartTimeframe = state => state?.timeframe ?? state?.resolution;
const alertProperties = { ...Object.fromEntries(Object.entries(createAlertProperties).filter(([key]) => !['idempotency_key', 'symbol', 'resolution'].includes(key))),
  message: { type: 'string', minLength: 1, maxLength: 32768, description: 'Exact JSON webhook message, including any TradingView placeholders.' },
  message_format: { type: 'string', const: 'json' },
  webhook_url: { type: 'string', minLength: 9, maxLength: 4096, pattern: '^https://' },
};
const alertSchema = object(alertProperties, ['name', 'condition', 'message', 'message_format', 'webhook_url']);

export const copyAlertWorkflowSchema = object({
  idempotency_key: keySchema,
  layout_name: { type: 'string', minLength: 1, maxLength: 200 },
  symbol: createAlertProperties.symbol,
  timeframe: createAlertProperties.resolution,
  save_source: { type: 'boolean', default: false },
  alert: alertSchema,
}, ['idempotency_key', 'layout_name', 'alert']);

function requiredSuccess(value, code, message, details = {}) {
  if (!value) throw new ToolError(code, message, details);
}

function safeCopyReceipt(copy) {
  return { source_layout_id: copy.source_layout_id, layout_id: copy.layout_id, target_id: copy.target_id,
    independent_layout_verified: copy.independent_layout_verified === true,
    initial_chart_verified: copy.chart_verified === true,
    full_fidelity_verified: copy.verification?.full_fidelity_verified === true,
    unverified_fields: copy.verification?.unverified_fields ?? [] };
}

async function confirmDestinationIdentity(sourceCtx, destinationCtx, sourceId, destinationId) {
  requiredSuccess(destinationId && destinationId !== sourceId, 'COPY_NOT_INDEPENDENT', 'The destination must have a distinct saved layout ID.');
  await destinationCtx.assertLayout(destinationId);
  const [current, list] = await Promise.all([
    destinationCtx.callTool('layout_get', {}),
    sourceCtx.callTool('layout_list', {}),
  ]);
  requiredSuccess(current.layout_id === destinationId, 'LAYOUT_MISMATCH', 'Destination widget identity changed. No alert was submitted.');
  const original = list.layouts?.find(row => row.layout_id === sourceId);
  const copy = list.layouts?.find(row => row.layout_id === destinationId);
  requiredSuccess(original?.numeric_id && copy?.numeric_id && original.numeric_id !== copy.numeric_id,
    'COPY_NOT_INDEPENDENT', 'Independent source and destination saved IDs could not be confirmed. No alert was submitted.', { source_layout_id: sourceId, layout_id: destinationId });
  return { layout_id: destinationId, source_layout_id: sourceId, independent_layout_verified: true };
}

/** Stop after any unverified side effect. Reruns use the same exact IDs and key. */
export async function copyChartCreateAlert(args, ctx) {
  checkAbort(ctx.signal);
  if (typeof args.alert?.webhook_url !== 'string' || !args.alert.webhook_url) throw new ToolError('WEBHOOK_REQUIRED', 'This workflow requires a nonempty HTTPS webhook URL. No chart copy was submitted.');
  if (args.alert?.message_format !== 'json' || typeof args.alert.message !== 'string' || !args.alert.message.length) throw new ToolError('JSON_MESSAGE_REQUIRED', 'This workflow requires a nonempty JSON message and message_format=json. No chart copy was submitted.');
  validateWebhook(args.alert.webhook_url);
  validateAlertMessage(args.alert.message, 'json');
  const requestHash = digest({ source_layout_id: ctx.expectedLayoutId, layout_name: args.layout_name,
    symbol: args.symbol, timeframe: args.timeframe, save_source: !!args.save_source, alert: args.alert });
  const key = checkpointKey(args.idempotency_key);
  let record = await ctx.loadCheckpoint(key);
  if (record && record.request_hash !== requestHash) throw new ToolError('IDEMPOTENCY_CONFLICT', 'This workflow key belongs to another source layout or alert definition.');
  // Current source metadata validates a study selector before creating a layout.
  // The source study name and exact Pine identity are re-resolved on the copy;
  // ephemeral study entity IDs are never assumed to survive native cloning.
  await ctx.assertLayout(ctx.expectedLayoutId);
  const sourceDefinition = { ...args.alert, idempotency_key: `${args.idempotency_key}:alert` };
  const sourcePrepared = await ctx.callTool('alert_prepare', sourceDefinition);
  requiredSuccess(sourcePrepared.ready_to_submit, 'ALERT_PREFLIGHT_FAILED', 'The requested alert could not be built from the source chart. No copy was submitted.');
  const selected = sourcePrepared.source_study;
  const sourceIdentityHash = selected ? digest({ name: selected.name, pine_id: selected.pine_id, pine_version: selected.pine_version }) : null;
  if (record?.source_study_identity_sha256 && record.source_study_identity_sha256 !== sourceIdentityHash) {
    throw new ToolError('WORKFLOW_SOURCE_DRIFT', 'The source study changed since this operation began. Reconcile the existing copy and alert before starting another operation.');
  }
  record ??= { version: 1, stage: 'preflight', request_hash: requestHash, source_layout_id: ctx.expectedLayoutId,
    source_study_identity_sha256: sourceIdentityHash, created_at: new Date().toISOString() };
  const save = async updates => {
    record = { ...record, ...updates, updated_at: new Date().toISOString() };
    await ctx.checkpoint(key, record);
  };
  await save({});

  let destinationCtx;
  try {
    if (!record.layout_id) {
      await save({ stage: 'copy_submitting' });
      const copy = await ctx.callTool('layout_copy', { name: args.layout_name,
        idempotency_key: `${args.idempotency_key}:layout`, save_source: !!args.save_source });
      const receipt = safeCopyReceipt(copy);
      // Persist even an unverified returned ID, so retries can never create a
      // second layout just because comparing the first copy timed out.
      if (receipt.layout_id) await save({ stage: 'copy_created', layout_id: receipt.layout_id,
        destination_target_id: receipt.target_id, copy_receipt: receipt });
      requiredSuccess(receipt.independent_layout_verified && receipt.layout_id !== record.source_layout_id,
        'COPY_NOT_INDEPENDENT', 'The layout copy did not prove an independent saved identity. No chart change or alert was submitted.');
      requiredSuccess(receipt.initial_chart_verified, 'COPY_CONFIGURATION_UNVERIFIED',
        'The new layout exists, but its symbol, timeframe, studies and inputs were not verified. No chart change or alert was submitted.', { layout_id: receipt.layout_id, unverified_fields: receipt.unverified_fields });
    }
    if (!record.copy_receipt?.initial_chart_verified) {
      // Reconcile the exact existing copy; the nested copy key cannot resubmit.
      const copy = await ctx.callTool('layout_copy', { name: args.layout_name,
        idempotency_key: `${args.idempotency_key}:layout`, save_source: !!args.save_source });
      requiredSuccess(copy.layout_id === record.layout_id && copy.independent_layout_verified && copy.chart_verified,
        'COPY_CONFIGURATION_UNVERIFIED', 'The existing copy is still unverified. No alert was submitted.', { layout_id: record.layout_id });
      await save({ copy_receipt: safeCopyReceipt(copy) });
    }
    destinationCtx = await findLayoutContext(ctx, record.layout_id);
    await confirmDestinationIdentity(ctx, destinationCtx, record.source_layout_id, record.layout_id);
    await save({ destination_target_id: destinationCtx.targetId });

    const targetSymbol = args.symbol ?? sourcePrepared.symbol;
    const targetTimeframe = String(args.timeframe ?? sourcePrepared.resolution);
    const before = await destinationCtx.callTool('chart_get_state', {});
    if (record.alert_id || record.prepared_configuration_sha256) {
      requiredSuccess(before.symbol === targetSymbol && String(chartTimeframe(before)) === targetTimeframe,
        'WORKFLOW_CHART_DRIFT', 'Destination chart changed after alert preparation. Existing alert state must be reconciled before any chart write.', { layout_id: record.layout_id, alert_id: record.alert_id ?? null });
    } else {
      await save({ stage: 'configuring_copy' });
      if (before.symbol !== targetSymbol) {
        await destinationCtx.assertLayout(record.layout_id);
        const changed = await destinationCtx.callTool('chart_set_symbol', { symbol: targetSymbol });
        requiredSuccess(changed?.ok !== false, 'CHART_CHANGE_FAILED', 'The destination symbol change failed. No alert was submitted.');
      }
      if (String(chartTimeframe(before)) !== targetTimeframe) {
        await destinationCtx.assertLayout(record.layout_id);
        const changed = await destinationCtx.callTool('chart_set_timeframe', { timeframe: targetTimeframe });
        requiredSuccess(changed?.ok !== false, 'CHART_CHANGE_FAILED', 'The destination timeframe change failed. No alert was submitted.');
      }
    }
    const ready = await destinationCtx.callTool('chart_wait_ready', { symbol: targetSymbol, timeframe: targetTimeframe, timeout_ms: 30000 });
    requiredSuccess(ready?.ok !== false && ready?.ready !== false, 'CHART_NOT_READY', 'Destination chart did not finish recalculating. No alert was submitted.');
    const state = await destinationCtx.callTool('chart_get_state', {});
    requiredSuccess(state.layout_id === record.layout_id && state.symbol === targetSymbol && String(chartTimeframe(state)) === targetTimeframe,
      'DESTINATION_CONFIGURATION_MISMATCH', 'Independent chart read did not match the intended destination, symbol and timeframe. No alert was submitted.');
    if (!record.alert_id && !record.prepared_configuration_sha256) {
      await destinationCtx.assertLayout(record.layout_id);
      const saved = await destinationCtx.callTool('layout_save', {});
      requiredSuccess(saved.saved && saved.layout_id === record.layout_id, 'DESTINATION_SAVE_UNVERIFIED', 'Destination layout save could not be verified. No alert was submitted.');
      await save({ stage: 'copy_configured', chart_configuration_sha256: digest({ layout_id: state.layout_id, symbol: state.symbol, timeframe: chartTimeframe(state), studies: state.studies }) });
    }

    const condition = { ...args.alert.condition };
    if (selected) {
      delete condition.study_id;
      condition.study_name = selected.name;
    }
    const definition = { ...args.alert, condition, symbol: targetSymbol, resolution: targetTimeframe,
      idempotency_key: `${args.idempotency_key}:alert` };
    const prepared = await destinationCtx.callTool('alert_prepare', definition);
    requiredSuccess(prepared.ready_to_submit, 'ALERT_PREFLIGHT_FAILED', 'The destination alert configuration is unavailable. No alert was submitted.');
    if (selected) {
      requiredSuccess(prepared.source_study?.pine_id === selected.pine_id && prepared.source_study?.pine_version === selected.pine_version,
        'COPIED_STUDY_MISMATCH', 'The copied study has a different Pine identity or version. No alert was submitted.');
    }
    if (record.prepared_configuration_sha256 && record.prepared_configuration_sha256 !== prepared.configuration_sha256) {
      throw new ToolError('WORKFLOW_CHART_DRIFT', 'The prepared alert definition changed since the previous submission. The existing alert will not be replaced.', { layout_id: record.layout_id, alert_id: record.alert_id ?? null });
    }
    await save({ stage: record.alert_id ? 'verifying_alert' : 'alert_submitting', prepared_configuration_sha256: prepared.configuration_sha256 });
    await destinationCtx.assertLayout(record.layout_id);
    if (!record.alert_id) {
      const created = await destinationCtx.callTool('alert_create', definition);
      if (created.alert_id) await save({ stage: 'alert_created', alert_id: created.alert_id });
      requiredSuccess(created.alert_id && created.created, 'ALERT_CREATION_UNVERIFIED',
        'Alert creation did not establish a stored alert ID. Retry only with this same workflow key to reconcile.', { layout_id: record.layout_id, alert_id: created.alert_id ?? null });
    }
    // A fresh independent read is required even when alert_create reported success.
    const verified = await destinationCtx.callTool('alert_verify', { alert_id: record.alert_id, definition });
    const proof = verified.verification;
    requiredSuccess(proof?.exists_verified && proof.configuration_verified && proof.active_verified,
      'ALERT_CONFIGURATION_UNVERIFIED', 'The chart copy and alert exist, but the stored alert configuration or activation was not fully verified.',
      { layout_id: record.layout_id, alert_id: record.alert_id, verification: proof });
    await destinationCtx.assertLayout(record.layout_id);
    await save({ stage: 'complete', verification: { exists_verified: true, configuration_verified: true, active_verified: true, delivery_verified: null }, last_error: null });
    return { completed: true, workflow_key: args.idempotency_key, source_layout_id: record.source_layout_id,
      layout_id: record.layout_id, target_id: destinationCtx.targetId, expected_layout_id: record.layout_id,
      independent_layout_verified: true, initial_chart_verified: true,
      full_copy_fidelity_verified: record.copy_receipt.full_fidelity_verified,
      copy_unverified_fields: record.copy_receipt.unverified_fields,
      symbol: targetSymbol, timeframe: targetTimeframe, alert_id: record.alert_id,
      alert: verified.alert, verification: proof, message_validation: prepared.message_validation,
      delivery_verified: null, verification_scope: 'Saved layout identity, chart configuration, and independently stored alert configuration; webhook delivery was not tested.' };
  } catch (error) {
    await save({ last_error: error.code ?? 'WORKFLOW_FAILED' });
    if (error instanceof ToolError) {
      error.details = { ...(error.details ?? {}), workflow_key: args.idempotency_key, stage: record.stage,
        source_layout_id: record.source_layout_id, layout_id: record.layout_id ?? null,
        target_id: destinationCtx?.targetId ?? record.destination_target_id ?? null, alert_id: record.alert_id ?? null,
        retry_guidance: 'Reuse this exact workflow key to reconcile existing IDs. No automatic rollback or duplicate creation is performed.' };
      throw error;
    }
    throw new ToolError('WORKFLOW_FAILED', 'The workflow stopped after a browser operation failed. Inspect the recorded stage and reuse the same key for reconciliation.',
      { workflow_key: args.idempotency_key, stage: record.stage, layout_id: record.layout_id ?? null, alert_id: record.alert_id ?? null });
  }
}

export default [
  { name: 'workflow_copy_chart_create_alert', description: 'Copy a saved chart into an independent layout, verify the copy, change symbol/timeframe, save, create a native alert, and independently verify exact stored message/webhook/condition/activation. Uses durable checkpoints and refuses uncertain duplicates. Does not test webhook delivery.', inputSchema: copyAlertWorkflowSchema, mutates: true, handler: copyChartCreateAlert },
  { name: 'workflow_status', description: 'Read a local copy-and-alert operation checkpoint. Contains IDs, hashes and stages; never stores webhook tokens or alert message bodies.', inputSchema: object({ idempotency_key: keySchema }, ['idempotency_key']), scope: 'local', requiresLayout: false, mutates: false,
    handler: async (args, ctx) => { const checkpoint = await ctx.loadCheckpoint(checkpointKey(args.idempotency_key)); if (!checkpoint) throw new ToolError('NOT_FOUND', 'No workflow checkpoint has this key.'); return { ...checkpoint, delivery_verified: null }; } },
];
