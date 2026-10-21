#!/usr/bin/env node
import { buildRuntime } from './runtime.mjs';
import { startStdio } from './core/protocol.mjs';
import { startHttp } from './core/http.mjs';
import { closeJobs } from './features/jobs.mjs';

const runtime=buildRuntime();let httpServer;
const shutdown=()=>{closeJobs();runtime.protocol.close();runtime.browser.close();httpServer?.close();};
process.once('SIGINT',()=>{shutdown();process.exit(0);});
process.once('SIGTERM',()=>{shutdown();process.exit(0);});
try{
  if(process.argv.includes('--http')){
    httpServer=await startHttp(runtime.protocol,{port:Number(process.env.TV_HTTP_PORT||3811)});
    process.stderr.write(`TradingView MCP listening on loopback port ${httpServer.address().port}; bearer authentication required.\n`);
  }else{
    startStdio(runtime.protocol);
    process.stdin.once('end',()=>{shutdown();});
  }
}catch(error){process.stderr.write(`Startup failed: ${error.code||'ERROR'} ${error.message}\n`);shutdown();process.exitCode=1;}
