// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { saveWorkshops, getLatestWorkshopContext, searchWorkshops } from './client';
import type { ServiceCenter } from '../../../shared/roadside';
const center:ServiceCenter={id:'real',name:'Toyota Service Test',lat:32.95,lon:-96.73,address:'123 Test Street',phone:null,distanceMiles:1,drivingDistanceMiles:null,durationMinutes:null,isToyotaRelated:true,authorization:'unverified'};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('uses the configured API base for database writes',async()=>{
  vi.stubEnv('VITE_API_URL','https://example.test/');
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({success:true,saved:1,errors:[]})));
  vi.stubGlobal('fetch',fetcher);
  expect((await saveWorkshops([center])).state).toBe('saved');
  expect(fetcher.mock.calls[0][0]).toBe('https://example.test/api/service-centers');
});
it('reports HTTP 207 as partial saving and sends the real places contract',async()=>{
  let body:unknown;
  vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{expect(url).toBe('/api/service-centers');body=JSON.parse(String(init.body));return new Response(JSON.stringify({success:false,saved:1,errors:[{id:'other',error:'offline'}]}),{status:207});});
  expect(await saveWorkshops([center,{...center,id:'other'}])).toEqual({state:'partial',saved:1,total:2});
  expect(body).toEqual({centers:[center,{...center,id:'other'}]});
});
it('does not POST empty search results',async()=>{
  const request=vi.fn();vi.stubGlobal('fetch',request);
  expect(await saveWorkshops([])).toEqual({state:'empty',saved:0,total:0});
  expect(request).not.toHaveBeenCalled();
});
it('reports database outages without discarding search context',async()=>{
  vi.stubEnv('VITE_GEOAPIFY_API_KEY','test-key');
  vi.stubGlobal('fetch',async(url:string)=>{
    if(url.includes('/v2/places'))return new Response(JSON.stringify({features:[{properties:{place_id:'real',name:center.name,lat:center.lat,lon:center.lon,formatted:center.address}}]}));
    if(url.includes('routematrix'))return new Response('{}',{status:503});
    throw new Error('database unavailable');
  });
  const found=await searchWorkshops({lat:32.9483,lon:-96.7299});
  expect((await saveWorkshops(found.centers)).state).toBe('error');
  expect(found.centers[0].name).toBe('Toyota Service Test');
  expect(getLatestWorkshopContext()).toContain('Toyota Service Test');
  expect(getLatestWorkshopContext()).toContain('unverified');
});
it('does not claim saving succeeded from a malformed 200 response',async()=>{
  vi.stubGlobal('fetch',async()=>new Response('{}'));
  expect((await saveWorkshops([center])).state).toBe('error');
});
