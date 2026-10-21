#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { access, mkdir, readdir, writeFile, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join,resolve,basename } from 'node:path';
import { BrowserManager } from './core/browser.mjs';
import { assertCdpEndpoint, publicChartUrl } from './core/security.mjs';
import { ToolError } from './core/errors.mjs';
import { browserEnvironment, parseLaunchOptions } from './core/launcher.mjs';

const args=process.argv.slice(2),command=args.shift()||'help';
try{
  if(command==='doctor'){
    const browser=new BrowserManager();try{const version=await browser.version();const tabs=await browser.listTargets();process.stdout.write(JSON.stringify({node:process.versions.node,browser:version,eligible_tabs:tabs.map(t=>({target_id:t.id,url:publicChartUrl(t.url)})),runtime_dependencies:0,cookie_extraction:false},null,2)+'\n');}finally{browser.close();}
  }else if(command==='launch'){
    const options=parseLaunchOptions(args),option=name=>options[name];
    const profile=resolve(option('--profile')||process.env.TV_BROWSER_PROFILE||join(homedir(),'.tradingview-unified-mcp','browser-profile'));
    await mkdir(profile,{recursive:true,mode:0o700});if((await lstat(profile)).isSymbolicLink())throw new ToolError('UNSAFE_PROFILE','A dedicated non-symlink browser profile is required.');
    const marker=join(profile,'.unified-mcp-profile');const contents=await readdir(profile);
    if(contents.length&&!contents.includes('.unified-mcp-profile'))throw new ToolError('EXISTING_PROFILE_REFUSED','The directory already contains an unrelated browser profile. Select a new empty directory; existing cookies/profiles are never copied.');
    if(!contents.includes('.unified-mcp-profile'))await writeFile(marker,'Dedicated browser profile for TradingView MCP\n',{flag:'wx',mode:0o600});
    const candidates=option('--browser')?[option('--browser')]:process.platform==='darwin'?['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']:process.platform==='win32'?[join(process.env.PROGRAMFILES||'C:\\Program Files','Google','Chrome','Application','chrome.exe'),join(process.env.PROGRAMFILES||'C:\\Program Files','Microsoft','Edge','Application','msedge.exe')]:['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser','/opt/google/chrome/chrome'];
    let executable;for(const candidate of candidates){try{await access(candidate);executable=candidate;break;}catch{}}
    if(!executable)throw new ToolError('BROWSER_NOT_FOUND','Install Chrome, Chromium or Edge, or pass --browser with its local executable path.');
    if(!/^(?:Google Chrome|Microsoft Edge|chrome(?:\.exe)?|chromium(?:-browser)?|google-chrome(?:-stable)?|msedge\.exe)$/i.test(basename(executable)))throw new ToolError('UNSUPPORTED_BROWSER','Only a supported Chrome, Chromium or Edge executable is accepted. TradingView Desktop is excluded.');
    const endpoint=new URL(assertCdpEndpoint(process.env.TV_CDP_ENDPOINT||'http://127.0.0.1:9222'));
    const url=publicChartUrl(option('--url')||'https://www.tradingview.com/chart/');
    const child=spawn(executable,[`--remote-debugging-port=${endpoint.port||80}`,`--remote-debugging-address=${endpoint.hostname.replace(/^\[|\]$/g,'')}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking',url],{detached:true,stdio:'ignore',env:browserEnvironment()});
    await new Promise((yes,no)=>{child.once('spawn',yes);child.once('error',no);});child.unref();
    process.stdout.write(JSON.stringify({browser_started:true,pid:child.pid,profile,endpoint:endpoint.origin,next:'Sign in to TradingView manually in this dedicated browser, then run doctor. No existing browser profile or cookie was copied.'},null,2)+'\n');
  }else{
    process.stdout.write('TradingView Unified MCP (Node 24+)\n\n  node src/cli.mjs launch [--browser /path/to/chrome] [--profile /new/directory]\n  node src/cli.mjs doctor\n  node src/server.mjs           # MCP stdio, stdout reserved for JSON-RPC\n  node src/server.mjs --http    # loopback only; requires TV_HTTP_TOKEN\n\nNo TradingView Desktop, cookie import or external installer is used.\n');
  }
}catch(error){process.stderr.write(`${error.code||'ERROR'}: ${error.message}\n`);process.exitCode=1;}
