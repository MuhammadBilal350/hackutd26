// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import WorkshopFinder from './WorkshopFinder';
const feed=vi.hoisted(()=>{
  let applied:(()=>void)|undefined;
  let inserted:(()=>void)|undefined;
  const rows=[{placeId:'distant',name:'Distant Global Workshop',address:'Elsewhere',latitude:1,longitude:2,phone:'',website:'',isToyotaAuthorized:false,authorizationStatus:'unverified',source:'geoapify',updatedAt:{microsSinceUnixEpoch:0n}}];
  const subscription={onApplied:(callback:()=>void)=>{applied=callback;return subscription;},onError:()=>subscription,subscribe:()=>{}};
  const connection={db:{toyotaServiceCenter:{iter:()=>rows,onInsert:(callback:()=>void)=>{inserted=callback;},onUpdate:()=>{},onDelete:()=>{}}},subscriptionBuilder:()=>subscription,disconnect:()=>{}};
  const builder={withUri:()=>builder,withDatabaseName:()=>builder,withAutomaticReconnect:()=>builder,onConnect:()=>builder,onConnectError:()=>builder,onDisconnect:()=>builder,build:()=>connection};
  return {builder,apply:()=>applied?.(),insert:()=>inserted?.(),ready:()=>Boolean(applied)};
});
vi.mock('../db/module_bindings',()=>({DbConnection:{builder:()=>feed.builder},tables:{toyotaServiceCenter:'service-center-table'}}));
vi.mock('./WorkshopMap',()=>({default:()=>null}));
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('keeps nearby results independent from live global database rows',async()=>{
  vi.stubEnv('VITE_GEOAPIFY_API_KEY','test-key');vi.stubEnv('VITE_SPACETIMEDB_HOST','wss://example.test');vi.stubEnv('VITE_SPACETIMEDB_DATABASE','test-db');
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(success:(p:unknown)=>void)=>success({coords:{latitude:32.9483,longitude:-96.7299}})}});
  vi.stubGlobal('fetch',async(url:string)=>{
    if(url==='/api/service-centers')return new Response(JSON.stringify({success:true,saved:1,errors:[]}));
    return new Response(JSON.stringify(url.includes('/v2/places')?{features:[{properties:{place_id:'nearby',name:'Nearby Toyota Workshop',lat:32.95,lon:-96.73,formatted:'Nearby Street'}}]}:{sources_to_targets:[]}));
  });
  render(<WorkshopFinder/>);
  await waitFor(()=>expect(feed.ready()).toBe(true));act(()=>feed.apply());
  expect(screen.getByText(/Live workshop database: connected \| 1 shared listings/)).toBeTruthy();
  expect(screen.queryByText('Distant Global Workshop')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Find nearby workshops'}));
  expect(await screen.findByText('Nearby Toyota Workshop')).toBeTruthy();
  expect(await screen.findByText(/Saved 1 workshop listings/)).toBeTruthy();
  act(()=>feed.insert());
  expect(screen.getByText('Nearby Toyota Workshop')).toBeTruthy();
  expect(screen.queryByText('Distant Global Workshop')).toBeNull();
  expect(screen.getByRole('link',{name:'Directions'}).getAttribute('href')).toContain('32.95%2C-96.73');
});
