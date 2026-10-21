import { createServer } from 'node:http';
import { safeTokenEqual } from './security.mjs';
import { PROTOCOL_VERSIONS, MAX_MESSAGE_BYTES } from './protocol.mjs';
import { ToolError } from './errors.mjs';

export function createHttpHandler(protocol,{host='127.0.0.1',port=()=>3811,token=process.env.TV_HTTP_TOKEN,allowedOrigins=[]}={}){
  if(!['127.0.0.1','::1'].includes(host))throw new ToolError('UNSAFE_BIND','HTTP transport binds to literal loopback only.');
  if(typeof token!=='string'||token.length<32)throw new ToolError('HTTP_AUTH_REQUIRED','Set TV_HTTP_TOKEN to a random secret of at least 32 characters. It is never embedded in a webpage or tool output.');
  const origins=new Set(allowedOrigins);
  return async(req,res)=>{
    const json=(status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff',...headers});res.end(data===null?'':JSON.stringify(data));};
    const expectedHost=(host==='::1'?'[::1]':host)+':'+port();
    if(req.headers.host!==expectedHost)return json(403,{error:'Host rejected'});
    if(req.headers.origin&&!origins.has(req.headers.origin))return json(403,{error:'Origin rejected'});
    if(!safeTokenEqual(req.headers.authorization,`Bearer ${token}`))return json(401,{error:'Authentication required'},{'www-authenticate':'Bearer'});
    if(req.url!=='/mcp')return json(404,{error:'Not found'});
    if(req.method!=='POST')return json(405,{error:'Only POST is supported; this stateless endpoint does not offer SSE'},{allow:'POST'});
    if(!(req.headers['content-type']||'').toLowerCase().startsWith('application/json'))return json(415,{error:'application/json required'});
    const version=req.headers['mcp-protocol-version'];
    if(version&&!PROTOCOL_VERSIONS.includes(version))return json(400,{error:'Unsupported MCP protocol version'});
    const controller=new AbortController();req.on('aborted',()=>controller.abort());
    try{
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>MAX_MESSAGE_BYTES){json(413,{error:'Request too large'});return;}chunks.push(chunk);}
      let message;try{message=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return json(400,protocol.error(null,-32700,'Parse error'));}
      const result=await protocol.handle(message,{stateless:true,signal:controller.signal});
      json(result===null?202:200,result);
    }catch{if(!res.headersSent)json(500,{error:'Request failed'});}
  };
}

export async function startHttp(protocol,{host='127.0.0.1',port=3811,token=process.env.TV_HTTP_TOKEN,allowedOrigins=[]}={}){
  if(!Number.isInteger(port)||port<0||port>65535)throw new ToolError('INVALID_PORT','Invalid HTTP port.');
  let server;
  const handler=createHttpHandler(protocol,{host,port:()=>server.address().port,token,allowedOrigins});
  server=createServer(handler);
  server.requestTimeout=180000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  return server;
}
