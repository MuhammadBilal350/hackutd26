// @vitest-environment node
import {expect,it} from 'vitest';
import {Readable} from 'node:stream';
import {createApiMiddleware} from './plugin';

it('leaves Python vision paths to its proxy',async()=>{
  let next=false;await createApiMiddleware()({url:'/api/vision/dashboard'} as any,{} as any,()=>{next=true;});expect(next).toBe(true);
});
it('rejects foreign browser origins before dispatching',async()=>{
  const middleware=createApiMiddleware();let code=0,body='';
  await middleware({url:'/api/health',headers:{origin:'https://foreign.example',host:'localhost:5173'}} as any,{setHeader(){},get writableEnded(){return false;},set statusCode(n){code=n;},end(value:string){body=value;}} as any,()=>{});
  expect(code).toBe(403);expect(body).toContain('Origin');
});
it('bounds streamed bodies and rejects malformed JSON',async()=>{
  const middleware=createApiMiddleware({maxBodyBytes:10});
  async function post(body:string){
    const req=Object.assign(Readable.from([Buffer.from(body)]),{url:'/api/analyze',method:'POST',headers:{'content-type':'application/json'}});
    let code=200;
    const res={setHeader(){},writableEnded:false,set statusCode(n:number){code=n;},get statusCode(){return code;},end(){this.writableEnded=true;}};
    await middleware(req as any,res as any,()=>{});return code;
  }
  expect(await post('{')).toBe(400);expect(await post('x'.repeat(11))).toBe(413);
});
