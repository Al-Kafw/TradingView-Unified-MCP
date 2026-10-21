import { ToolError } from './errors.mjs';

// Chrome needs platform/session settings, not credentials from its MCP parent.
const BROWSER_ENV = new Set([
  'PATH','HOME','USER','LOGNAME','SHELL','TMPDIR','TMP','TEMP',
  'SystemRoot','SYSTEMROOT','WINDIR','windir','COMSPEC','ComSpec',
  'PROGRAMFILES','PROGRAMFILES(X86)','LOCALAPPDATA','APPDATA',
  'USERPROFILE','HOMEDRIVE','HOMEPATH','DISPLAY','WAYLAND_DISPLAY',
  'XDG_RUNTIME_DIR','XDG_CONFIG_HOME','DBUS_SESSION_BUS_ADDRESS',
  'XAUTHORITY','LANG','LC_ALL','LC_CTYPE','TZ',
]);

export function browserEnvironment(environment=process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([key])=>BROWSER_ENV.has(key)));
}

export function parseLaunchOptions(args) {
  const result={};
  for(let i=0;i<args.length;i+=2){
    const key=args[i],value=args[i+1];
    if(!['--browser','--profile','--url'].includes(key)||!value||value.startsWith('--')||Object.hasOwn(result,key)) {
      throw new ToolError('INVALID_OPTION','Use --browser, --profile or --url once each, with a value.');
    }
    result[key]=value;
  }
  return result;
}
