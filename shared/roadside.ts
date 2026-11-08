export interface Coordinates { lat:number; lon:number }
export interface ServiceCenter extends Coordinates {
  id:string; name:string; address:string; phone:string|null; distanceMiles:number;
  drivingDistanceMiles:number|null; durationMinutes:number|null; isToyotaRelated:boolean; authorization:'unverified';
}
export interface FinderResult {userLocation:Coordinates;nearest:ServiceCenter|null;centers:ServiceCenter[];usedFallback:boolean;routingAvailable:boolean}
function validLocation(value:Coordinates) {return Number.isFinite(value.lat)&&Number.isFinite(value.lon)&&Math.abs(value.lat)<=90&&Math.abs(value.lon)<=180;}
function record(value:unknown):Record<string,unknown> {return value!==null&&typeof value==='object'?value as Record<string,unknown>:{};}
function text(value:unknown) {return typeof value==='string'?value.trim():'';}
function positive(value:unknown):number|null {return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;}
function miles(a:Coordinates,b:Coordinates) {
  const rad=(n:number)=>n*Math.PI/180;
  const h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;
  return 3958.8*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
/** Shared by the original Expo app and the new web frontend. Provider keys stay in each app's public map configuration. */
export function createRoadsideFinder(key:string|undefined,fetcher:typeof fetch=fetch) {
  async function request(url:string,init?:RequestInit) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15_000);
    try{return await fetcher(url,{...init,signal:controller.signal});}finally{clearTimeout(timer);}
  }
  return async(location:Coordinates,radius=25):Promise<FinderResult>=>{
    if(!key?.trim())throw new Error('Workshop search is not configured yet.');
    if(!validLocation(location))throw new Error('Invalid location coordinates.');
    if(!Number.isFinite(radius)||radius<1||radius>100)throw new Error('Search radius must be between 1 and 100 miles.');
    const params=new URLSearchParams({categories:'service.vehicle.repair,commercial.vehicle',filter:`circle:${location.lon},${location.lat},${Math.round(radius*1609.34)}`,bias:`proximity:${location.lon},${location.lat}`,limit:'50',lang:'en',apiKey:key});
    let response:Response;
    try{response=await request(`https://api.geoapify.com/v2/places?${params}`);}catch{throw new Error('Workshop search could not connect. Please try again.');}
    if(!response.ok)throw new Error(`Workshop search failed (${response.status}). Please try again.`);
    const payload=record(await response.json());
    if(!Array.isArray(payload.features))throw new Error('Workshop search returned an invalid response. Please try again.');
    const unique=new Map<string,ServiceCenter>();
    for(const feature of payload.features) {
      const f=record(feature),p=record(f.properties),geometry=record(f.geometry),coordinates=Array.isArray(geometry.coordinates)?geometry.coordinates:[];
      const lat=p.lat??coordinates[1],lon=p.lon??coordinates[0];
      if(typeof lat!=='number'||typeof lon!=='number'||!validLocation({lat,lon}))continue;
      const raw=record(p.datasource);const details=record(raw.raw);
      const name=text(p.name)||text(p.address_line1)||'Auto Repair Center';
      const id=text(p.place_id)||`${lat}-${lon}`;
      if(unique.has(id))continue;
      unique.set(id,{id,name,lat,lon,address:text(p.formatted)||[text(p.address_line1),text(p.address_line2)].filter(Boolean).join(', ')||'Address not listed',phone:text(p.phone)||text(details.phone)||text(details['contact:phone'])||null,distanceMiles:miles(location,{lat,lon}),drivingDistanceMiles:null,durationMinutes:null,isToyotaRelated:/toyota/i.test(`${name} ${text(p.brand)} ${text(details.brand)}`),authorization:'unverified'});
    }
    const all=[...unique.values()].sort((a,b)=>a.distanceMiles-b.distanceMiles);
    const toyota=all.filter(c=>c.isToyotaRelated);const usedFallback=toyota.length===0;
    let centers=(usedFallback?all:toyota).slice(0,10);let routingAvailable=false;
    if(centers.length) {
      try {
        const routing=await request(`https://api.geoapify.com/v1/routematrix?apiKey=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'drive',sources:[{location:[location.lon,location.lat]}],targets:centers.map(c=>({location:[c.lon,c.lat]}))})});
        if(routing.ok) {
          const matrix=record(await routing.json());const rows=Array.isArray(matrix.sources_to_targets)?matrix.sources_to_targets:[];const routes=Array.isArray(rows[0])?rows[0]:[];
          centers=centers.map((center,index)=>{const route=record(routes[index]),distance=positive(route.distance),duration=positive(route.time);return {...center,drivingDistanceMiles:distance===null?null:distance/1609.34,durationMinutes:duration===null?null:Math.round(duration/60)};});
          routingAvailable=centers.some(c=>c.durationMinutes!==null);
          centers.sort((a,b)=>(a.durationMinutes??Infinity)-(b.durationMinutes??Infinity)||a.distanceMiles-b.distanceMiles);
        }
      }catch{/* Retain verified place results and explicitly label air distance in the UI. */}
    }
    return {userLocation:location,nearest:centers[0]??null,centers,usedFallback,routingAvailable};
  };
}
