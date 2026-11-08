import {resolve} from 'node:path';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {loadEnv,type Plugin} from 'vite';

// Only these server variables are copied into process.env. Nothing is added to
// Vite's define/client environment, and no credential values are logged.
const SERVER_ENV=['NVIDIA_API_KEY','NVIDIA_MODEL','NVIDIA_VISION_MODEL','ELEVENLABS_API_KEY','ELEVENLABS_VOICE_ID','SPACETIMEDB_HOST','SPACETIMEDB_DATABASE','SPACETIMEDB_TOKEN'] as const;
const loaders={
  '/api/analyze':()=>import('../api/analyze'),
  '/api/service-centers':()=>import('../api/service-centers'),
  '/api/speak':()=>import('../api/speak'),
  '/api/transcribe':()=>import('../api/transcribe'),
  '/api/health':()=>import('../api/health'),
};

export function createApiMiddleware(options:{maxBodyBytes?:number}={}) {
  const maximum=options.maxBodyBytes??6*1024*1024;
  return async(req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
    const path=(req.url||'').split('?')[0];
    // Exact route matching intentionally leaves all /api/vision paths alone.
    if(!Object.prototype.hasOwnProperty.call(loaders,path)){next();return;}
    const json=(status:number,body:unknown)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(body));};
    const origin=req.headers.origin;
    if(origin){
      try{const source=new URL(origin);if(!['http:','https:'].includes(source.protocol)||source.host!==req.headers.host){json(403,{error:'Origin is not allowed for this local API.'});return;}}
      catch{json(403,{error:'Origin is not allowed for this local API.'});return;}
    }
    if(req.method==='OPTIONS'){json(405,{error:'Use POST.'});return;}
    const declared=Number(req.headers['content-length']);
    if(Number.isFinite(declared)&&declared>maximum){json(413,{error:'Request body is too large.'});req.resume();return;}
    try{
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of req){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;if(size>maximum){json(413,{error:'Request body is too large.'});req.resume();return;}chunks.push(bytes);}
      let body:unknown={};
      if(size){try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{json(400,{error:'Request body must be valid JSON.'});return;}}
      if(!body||typeof body!=='object'||Array.isArray(body)){json(400,{error:'Request body must be a JSON object.'});return;}
      const module=await loaders[path as keyof typeof loaders]();
      const adapted=Object.assign(req,{body});
      const response={status(code:number){res.statusCode=code;return this;},json(value:unknown){json(res.statusCode||200,value);return this;}};
      await module.default(adapted as never,response as never);
    }catch{if(!res.writableEnded)json(500,{error:'Local API request failed.'});}
  };
}

/** Local-only adapter for the same handlers Vercel deploys from frontend/api. */
export function partnerApiPlugin(options:{envDir?:string}={}):Plugin {
  return {name:'partner-server-api',apply:'serve',configureServer(server){
    const directory=options.envDir??resolve(server.config.root,'..');
    const environment=loadEnv(server.config.mode,directory,'');
    for(const name of SERVER_ENV){if(process.env[name]===undefined&&environment[name]!==undefined)process.env[name]=environment[name];}
    server.middlewares.use(createApiMiddleware());
  }};
}
