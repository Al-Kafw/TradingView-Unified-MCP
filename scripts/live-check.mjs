import { mkdir, writeFile } from 'node:fs/promises';
import { buildRuntime } from '../src/runtime.mjs';

// Explicitly invoked live reads only. Never persist account responses, source,
// chart IDs, titles, account identifiers, cookies, messages or webhook URLs.
const runtime=buildRuntime({readonly:true});
const report={timestamp:new Date().toISOString(),node:process.versions.node,
  scope:'Read-only calls through the shipped registry and real Chrome CDP, plus public TradingView market requests. A returned read does not verify mutations or all account capabilities.',
  browser:null,saved_layout_observed:false,checks:[]};
try{
  report.browser=await runtime.browser.version();
  const target=await runtime.browser.resolveTarget(process.argv[2]);
  const checks=[
    ['browser_capabilities',{}],['layout_get',{}],['layout_list',{}],
    ['chart_get_state',{}],['indicator_list',{}],['data_get_last_bar',{}],
    ['data_get_ohlcv',{limit:5}],['data_get_study_values',{}],['strategy_list',{}],
    ['pane_list',{}],['pane_get_sync',{}],['replay_status',{}],
    ['alert_list',{limit:1}],['watchlist_list',{}],['study_template_list',{}],
    ['pine_list_scripts',{}],['quote_batch',{symbols:['NASDAQ:AAPL']}],
    ['market_technical_summary',{symbols:['NASDAQ:AAPL']}],
    ['hotlist_get',{preset:'volume_gainers',limit:1}],
  ];
  for(const [name,args] of checks){
    const descriptor=runtime.registry.get(name);
    try{
      const result=await runtime.registry.execute(name,descriptor.scope==='browser'?{target_id:target.id,...args}:args);
      if(name==='layout_get')report.saved_layout_observed=!!result.layout_id;
      report.checks.push({tool:name,status:'returned',...(name==='browser_capabilities'?{observed:result.observed}:{})});
    }catch(error){report.checks.push({tool:name,status:'unavailable',code:/^[A-Z_]+$/.test(error.code??'')?error.code:'OPERATION_FAILED'});}
    process.stdout.write(JSON.stringify(report.checks.at(-1))+'\n');
  }
}catch(error){report.setup_error={code:/^[A-Z_]+$/.test(error.code??'')?error.code:'SETUP_FAILED'};process.exitCode=1;}
finally{
  report.summary={returned:report.checks.filter(c=>c.status==='returned').length,unavailable:report.checks.filter(c=>c.status==='unavailable').length};
  report.unverified=['Account mutations, copy/save fidelity, alert creation/activation/delivery, Pine editor changes, replay changes, template writes and strategy sweeps.'];
  await mkdir('docs',{recursive:true});await writeFile('docs/LIVE_VALIDATION.json',JSON.stringify(report,null,2)+'\n');
  runtime.protocol.close();await runtime.browser.close();
  process.stdout.write(JSON.stringify(report.summary)+'\n');
}
