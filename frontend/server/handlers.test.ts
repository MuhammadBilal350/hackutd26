// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import analyze from '../api/analyze';
import centers from '../api/service-centers';
import speak from '../api/speak';
import transcribe from '../api/transcribe';

function response(){const result={code:200,body:{} as any,status(n:number){this.code=n;return this;},json(value:any){this.body=value;return this;}};return result;}
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('explains exhausted speech credits without exposing provider details',async()=>{
  vi.stubEnv('ELEVENLABS_API_KEY','unit-test');vi.stubEnv('ELEVENLABS_VOICE_ID','test');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:{status:'quota_exceeded',message:'private account data'}}),{status:401})));
  const res=response();await speak({method:'POST',body:{text:'Ready'}} as any,res as any);
  expect(res.body.error).toContain('credits');expect(JSON.stringify(res.body)).not.toContain('private account data');
});
it('keeps Chrome WebM recordings labeled as WebM when codecs are supplied',async()=>{
  vi.stubEnv('ELEVENLABS_API_KEY','unit-test');
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({text:'Help'})));
  vi.stubGlobal('fetch',fetcher);const res=response();
  await transcribe({method:'POST',body:{audioBase64:'YQ==',mimeType:'audio/webm;codecs=opus'}} as any,res as any);
  expect(res.code).toBe(200);
  expect((fetcher.mock.calls[0][1].body as FormData).get('file')).toMatchObject({name:'recording.webm',type:'audio/webm'});
});
it('reports partially saved centers with HTTP 207',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('',{status:200})).mockResolvedValueOnce(new Response('unavailable',{status:503})));
  const res=response();await centers({method:'POST',body:{centers:[{id:'a',name:'A',lat:32,lon:-96},{id:'b',name:'B',lat:32,lon:-96}]}},res);
  expect(res.code).toBe(207);expect(res.body).toMatchObject({success:false,saved:1,errors:[{id:'b'}]});
});
it('passes structured inspection evidence to reasoning without requiring another photo',async()=>{
  vi.stubEnv('NVIDIA_API_KEY','unit-test');
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'Check the brake warning.'}}]})));
  vi.stubGlobal('fetch',fetcher);const res=response();
  await analyze({method:'POST',body:{message:'Explain my inspection',inspectionResults:{dashboard:{warnings:['brake']},exterior:{condition:{visible_condition_score:null}}}}} as any,res as any);
  expect(res.code).toBe(200);expect(fetcher).toHaveBeenCalledTimes(1);
  const body=JSON.parse(fetcher.mock.calls[0][1].body);expect(body.messages.at(-1).content).toContain('"visible_condition_score":null');
  expect(body.messages.at(-1).content).toContain('brake');
});
it.each([401,410])('surfaces NVIDIA provider HTTP %s',async(status)=>{
  vi.stubEnv('NVIDIA_API_KEY','unit-test');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Provider unavailable'}),{status})));
  const res=response();await analyze({method:'POST',body:{message:'Help'}} as any,res as any);
  expect(res.code).toBe(502);expect(res.body.error).toContain(String(status));
});
it.each([[speak,401],[speak,410],[transcribe,401],[transcribe,410]] as const)('surfaces speech provider status without leaking provider payload',async(handler,status)=>{
  vi.stubEnv('ELEVENLABS_API_KEY','unit-test');vi.stubEnv('ELEVENLABS_VOICE_ID','test');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('must-not-echo',{status})));
  const res=response();await handler({method:'POST',body:{text:'Help',audioBase64:'YQ=='}} as any,res as any);
  expect(res.code).toBe(status);expect(res.body.error).toContain(String(status));expect(JSON.stringify(res.body)).not.toContain('must-not-echo');
});
