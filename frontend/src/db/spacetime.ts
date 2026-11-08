import type { ToyotaServiceCenter } from './module_bindings/types';
export type SavedServiceCenter=ToyotaServiceCenter;
export type SpacetimeStatus='unconfigured'|'connecting'|'connected'|'reconnecting'|'disconnected'|'error';
export interface ServiceCenterListener {status:(status:SpacetimeStatus)=>void;centers?:(centers:SavedServiceCenter[])=>void}
/** Partner public-service-center feed only. Public chat/user rows are deliberately never subscribed. */
export function subscribeServiceCenters(listener:ServiceCenterListener):()=>void {
  const host=import.meta.env.VITE_SPACETIMEDB_HOST?.trim();
  const database=import.meta.env.VITE_SPACETIMEDB_DATABASE?.trim();
  if(!host||!database){listener.status('unconfigured');return ()=>{};}
  let disposed=false;
  let disconnect:(()=>void)|undefined;
  const status=(value:SpacetimeStatus)=>{if(!disposed)listener.status(value);};
  status('connecting');
  void import('./module_bindings').then(({DbConnection,tables})=>{
    if(disposed)return;
    const connection=DbConnection.builder()
      .withUri(host).withDatabaseName(database).withAutomaticReconnect()
      .onConnect(()=>status('connecting'))
      .onConnectError(()=>status('error'))
      .onDisconnect((_context,_error,nextAttempt)=>status(nextAttempt===undefined?'disconnected':'reconnecting'))
      .build();
    disconnect=()=>connection.disconnect();
    const publish=()=>{if(!disposed)listener.centers?.(Array.from(connection.db.toyotaServiceCenter.iter()));};
    connection.db.toyotaServiceCenter.onInsert(publish);
    connection.db.toyotaServiceCenter.onUpdate(publish);
    connection.db.toyotaServiceCenter.onDelete(publish);
    connection.subscriptionBuilder().onApplied(()=>{publish();status('connected');}).onError(()=>status('error')).subscribe([tables.toyotaServiceCenter]);
  }).catch(()=>{disconnect?.();status('error');});
  return ()=>{if(disposed)return;disposed=true;disconnect?.();};
}
