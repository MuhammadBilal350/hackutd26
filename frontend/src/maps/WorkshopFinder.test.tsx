// @vitest-environment jsdom
import { beforeEach,afterEach,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import WorkshopFinder from './WorkshopFinder';
// The third-party tile renderer is outside the search/UI contract under test.
vi.mock('./WorkshopMap',()=>({default:()=>null}));
beforeEach(()=>{vi.stubEnv('VITE_SPACETIMEDB_HOST','');vi.stubEnv('VITE_SPACETIMEDB_DATABASE','');});
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('requires an explicit search and then displays live results with real directions',async()=>{
  vi.stubEnv('VITE_GEOAPIFY_API_KEY','test-key');
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(success:(p:unknown)=>void)=>success({coords:{latitude:32.9483,longitude:-96.7299}})}});
  let requests=0;
  vi.stubGlobal('fetch',async()=>new Response(JSON.stringify(++requests===1?{features:[{properties:{place_id:'real',name:'Toyota Service Test',lat:32.95,lon:-96.73,formatted:'123 Test Street',phone:'+15551234567'}}]}:{sources_to_targets:[[{distance:1609.34,time:300}]]}),{status:200}));
  render(<WorkshopFinder/>);
  expect(requests).toBe(0);
  fireEvent.click(screen.getByRole('button',{name:'Find nearby workshops'}));
  expect(await screen.findByText('Toyota Service Test')).toBeTruthy();
  expect(screen.getByText('1.0 driving mi · 5 min')).toBeTruthy();
  expect(screen.getByRole('link',{name:'Directions'}).getAttribute('href')).toContain('32.95%2C-96.73');
  expect(screen.getByRole('link',{name:'Call'}).getAttribute('href')).toBe('tel:+15551234567');
});
it('shows an actionable error if browser location permission is declined',async()=>{
  vi.stubEnv('VITE_GEOAPIFY_API_KEY','test-key');
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(_success:unknown,error:(e:{code:number})=>void)=>error({code:1})}});
  render(<WorkshopFinder/>);fireEvent.click(screen.getByRole('button',{name:'Find nearby workshops'}));
  expect(await screen.findByText(/Location access was declined/)).toBeTruthy();
  expect(screen.getByRole('button',{name:'Find nearby workshops'}).getAttribute('aria-disabled')).not.toBe('true');
});
it('does not display demo workshops when map configuration is missing',async()=>{
  vi.stubEnv('VITE_GEOAPIFY_API_KEY','');
  render(<WorkshopFinder/>);fireEvent.click(screen.getByRole('button',{name:'Find nearby workshops'}));
  expect(await screen.findByText('Workshop search is not configured yet.')).toBeTruthy();
  expect(screen.queryByText('Lakeview Toyota Service')).toBeNull();
});

it('keeps real workshop directions available when database saving fails',async()=>{
  vi.stubEnv('VITE_GEOAPIFY_API_KEY','test-key');vi.stubEnv('VITE_SPACETIMEDB_HOST','');vi.stubEnv('VITE_SPACETIMEDB_DATABASE','');
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(success:(p:unknown)=>void)=>success({coords:{latitude:32.9483,longitude:-96.7299}})}});
  vi.stubGlobal('fetch',async(url:string)=>{
    if(url==='/api/service-centers')throw new Error('offline');
    return new Response(JSON.stringify(url.includes('/v2/places')?{features:[{properties:{place_id:'real',name:'Real Toyota Workshop',lat:32.95,lon:-96.73,formatted:'123 Test Street'}}]}:{sources_to_targets:[[{distance:1609.34,time:300}]]}));
  });
  render(<WorkshopFinder/>);fireEvent.click(screen.getByRole('button',{name:'Find nearby workshops'}));
  expect(await screen.findByText(/Could not save workshops/)).toBeTruthy();
  expect(screen.getByText('Real Toyota Workshop')).toBeTruthy();expect(screen.getByRole('link',{name:'Directions'})).toBeTruthy();
  expect(screen.getByText(/Live workshop database: unconfigured/)).toBeTruthy();
});
it('shows a partial save separately from successful map search',async()=>{
  vi.stubEnv('VITE_GEOAPIFY_API_KEY','test-key');vi.stubEnv('VITE_SPACETIMEDB_HOST','');vi.stubEnv('VITE_SPACETIMEDB_DATABASE','');
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(success:(p:unknown)=>void)=>success({coords:{latitude:32.9483,longitude:-96.7299}})}});
  vi.stubGlobal('fetch',async(url:string)=>{
    if(url==='/api/service-centers')return new Response(JSON.stringify({success:false,saved:0,errors:[{id:'real',error:'offline'}]}),{status:207});
    return new Response(JSON.stringify(url.includes('/v2/places')?{features:[{properties:{place_id:'real',name:'Real Toyota Workshop',lat:32.95,lon:-96.73}}]}:{sources_to_targets:[]}));
  });
  render(<WorkshopFinder/>);fireEvent.click(screen.getByRole('button',{name:'Find nearby workshops'}));
  expect(await screen.findByText(/Partially saved: 0 of 1 workshops/)).toBeTruthy();
  expect(screen.getByRole('link',{name:'Directions'})).toBeTruthy();
});
