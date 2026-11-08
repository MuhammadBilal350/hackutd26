import { createRoadsideFinder, type Coordinates, type FinderResult, type ServiceCenter } from '../../../shared/roadside';
let latestResult:FinderResult|null=null;
export async function searchWorkshops(location:Coordinates) {
  const result=await createRoadsideFinder(import.meta.env.VITE_GEOAPIFY_API_KEY)(location);
  latestResult=result;
  return result;
}
/** Only the current device's most recent real nearby search, never global database rows. */
export function getLatestWorkshopContext():string {
  if(!latestResult)return '';
  if(!latestResult.centers.length)return 'The latest nearby workshop search found no results.';
  return 'Nearby workshops from the latest map search (Toyota authorization is unverified):\n'+latestResult.centers.map(center=>`${center.name} — ${center.address}; ${center.drivingDistanceMiles!==null?`${center.drivingDistanceMiles.toFixed(1)} driving miles`:`${center.distanceMiles.toFixed(1)} straight-line miles`}${center.durationMinutes!==null?`; ${center.durationMinutes} minutes drive`:''}${center.phone?`; phone ${center.phone}`:''}`).join('\n');
}
export type WorkshopSaveResult={state:'saved'|'partial'|'error'|'empty';saved:number;total:number};
export async function saveWorkshops(centers:ServiceCenter[]):Promise<WorkshopSaveResult> {
  const total=centers.length;
  if(!total)return {state:'empty',saved:0,total:0};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12_000);
  try {
    const base=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
    const response=await fetch(`${base}/api/service-centers`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({centers}),signal:controller.signal});
    const payload=await response.json();
    const saved=Number.isInteger(payload?.saved)&&payload.saved>=0&&payload.saved<=total?payload.saved:0;
    if(response.status===207)return {state:'partial',saved,total};
    if(response.ok&&payload?.success===true&&saved===total&&(!Array.isArray(payload.errors)||payload.errors.length===0))return {state:'saved',saved,total};
    return {state:'error',saved,total};
  }catch{return {state:'error',saved:0,total};}
  finally{clearTimeout(timer);}
}
export function browserLocation():Promise<Coordinates> {
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){reject(new Error('Location is not supported by this browser.'));return;}
    navigator.geolocation.getCurrentPosition(position=>resolve({lat:position.coords.latitude,lon:position.coords.longitude}),error=>reject(new Error(error.code===1?'Location access was declined. Allow location in your browser and try again.':'Your location could not be found. Please try again.')),{enableHighAccuracy:false,timeout:10_000,maximumAge:60_000});
  });
}
export function directions(center:ServiceCenter) {return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${center.lat},${center.lon}`)}`;}
