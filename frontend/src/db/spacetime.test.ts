// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {subscribeServiceCenters} from './spacetime';
const sdk=vi.hoisted(()=>{
  const callbacks:Record<string,(...args:any[])=>void>={};
  const rows=[{placeId:'global',name:'Far away workshop',latitude:1,longitude:2}];
  const table={iter:()=>rows,onInsert:vi.fn(),onUpdate:vi.fn(),onDelete:vi.fn()};
  const subscription={onApplied:vi.fn((cb)=>{callbacks.applied=cb;return subscription;}),onError:vi.fn((cb)=>{callbacks.subscriptionError=cb;return subscription;}),subscribe:vi.fn()};
  const connection={db:{toyotaServiceCenter:table},subscriptionBuilder:()=>subscription,disconnect:vi.fn()};
  const builder={withUri:vi.fn(()=>builder),withDatabaseName:vi.fn(()=>builder),withAutomaticReconnect:()=>builder,onConnect:(cb:any)=>{callbacks.connected=cb;return builder;},onConnectError:(cb:any)=>{callbacks.error=cb;return builder;},onDisconnect:(cb:any)=>{callbacks.disconnected=cb;return builder;},build:vi.fn(()=>connection)};
  return {callbacks,table,subscription,connection,builder};
});
vi.mock('./module_bindings',()=>({DbConnection:{builder:()=>sdk.builder},tables:{toyotaServiceCenter:'service-center-table'}}));
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
it('does not open an unconfigured public database',()=>{
  vi.stubEnv('VITE_SPACETIMEDB_HOST','');vi.stubEnv('VITE_SPACETIMEDB_DATABASE','');
  const status=vi.fn();const cleanup=subscribeServiceCenters({status});
  expect(status).toHaveBeenCalledWith('unconfigured');
  expect(sdk.builder.build).not.toHaveBeenCalled();cleanup();
});
it('subscribes only public service centers and disposes safely',async()=>{
  vi.stubEnv('VITE_SPACETIMEDB_HOST','wss://example.test');vi.stubEnv('VITE_SPACETIMEDB_DATABASE','test-db');
  const status=vi.fn(),centers=vi.fn();const cleanup=subscribeServiceCenters({status,centers});
  await vi.waitFor(()=>expect(sdk.subscription.subscribe).toHaveBeenCalledWith(['service-center-table']));
  sdk.callbacks.applied();
  expect(centers).toHaveBeenCalledWith([expect.objectContaining({placeId:'global'})]);
  expect(status).toHaveBeenLastCalledWith('connected');
  sdk.callbacks.disconnected({},null,{});
  expect(status).toHaveBeenLastCalledWith('reconnecting');
  cleanup();expect(sdk.connection.disconnect).toHaveBeenCalledTimes(1);
  status.mockClear();sdk.callbacks.error({},new Error('offline'));expect(status).not.toHaveBeenCalled();
});
