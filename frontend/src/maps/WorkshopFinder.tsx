import { lazy,Suspense,useCallback,useEffect,useRef,useState } from 'react';
import { MapPin,Navigation,Phone } from 'lucide-react';
import type { FinderResult } from '../../../shared/roadside';
import { Box,Txt,Card,Row,Button,Tap } from '../ui';
import { browserLocation,directions,searchWorkshops } from './client';
const WorkshopMap=lazy(()=>import('./WorkshopMap'));
export default function WorkshopFinder() {
  const [result,setResult]=useState<FinderResult|null>(null),[selected,setSelected]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const choose=useCallback((id:string)=>setSelected(id),[]);
  async function search() {
    setBusy(true);setError('');
    try {
      if(!import.meta.env.VITE_GEOAPIFY_API_KEY)throw new Error('Workshop search is not configured yet.');
      const found=await searchWorkshops(await browserLocation());
      if(mounted.current){setResult(found);setSelected(found.nearest?.id??null);}
    }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Workshop search failed. Please try again.');}
    finally{if(mounted.current)setBusy(false);}
  }
  return <Box style={{gap:16}}><Card style={{padding:16,gap:12}}><Row><MapPin size={22} color="var(--red)"/><Box style={{flex:1}}><Txt style={{fontWeight:700}}>Find a nearby workshop</Txt><Txt ui="muted">Toyota listings first, then nearby repair shops.</Txt></Box></Row><Button onPress={()=>void search()} disabled={busy} label="Find nearby workshops">{busy?'Finding workshops…':result?'Refresh nearby workshops':'Find nearby workshops'}</Button><Txt ui="muted" style={{fontSize:12}}>Your location is shared with the map provider only when you search.</Txt></Card>
    {error?<Card style={{padding:16}}><Txt style={{color:'var(--red)'}}>{error}</Txt><Txt ui="muted" style={{marginTop:8}}>You can try again using the search button.</Txt></Card>:null}
    {result?<><Suspense fallback={<Card style={{padding:20}}><Txt ui="muted">Loading map…</Txt></Card>}><WorkshopMap location={result.userLocation} centers={result.centers} selected={selected} onSelect={choose}/></Suspense>
      {result.usedFallback&&result.centers.length>0?<Txt ui="muted" style={{fontSize:13}}>No Toyota listing nearby. Showing local repair shops.</Txt>:null}
      {!result.centers.length?<Card style={{padding:20}}><Txt>No workshops found within 25 miles.</Txt></Card>:<Card>{result.centers.map((center,index)=><Box key={center.id} ui="list-row" style={{flexDirection:'column',alignItems:'stretch',gap:8,background:selected===center.id?'var(--glass-selected)':'transparent'}}><Tap label={`Select ${center.name}`} onPress={()=>choose(center.id)}><Row><Box style={{width:26,height:26,borderRadius:20,background:'var(--red)',alignItems:'center',justifyContent:'center'}}><Txt style={{color:'white',fontSize:13}}>{index+1}</Txt></Box><Box style={{flex:1}}><Txt style={{fontWeight:600}}>{center.name}</Txt><Txt ui="muted">{center.drivingDistanceMiles!==null?`${center.drivingDistanceMiles.toFixed(1)} driving mi`:`${center.distanceMiles.toFixed(1)} mi · straight-line`}{center.durationMinutes!==null?` · ${center.durationMinutes} min`:''}</Txt></Box></Row></Tap><Txt ui="muted" style={{fontSize:13}}>{center.address}</Txt><div className="workshop-actions"><a href={directions(center)} target="_blank" rel="noreferrer"><Navigation size={14}/>Directions</a>{center.phone?<a href={`tel:${center.phone.replace(/[^+\d]/g,'')}`}><Phone size={14}/>Call</a>:<span>Phone not listed</span>}</div></Box>)}</Card>}
      <p className="demo-note">Toyota affiliation is based on the business listing, not verified authorization. Confirm details with the workshop.</p></>:<p className="demo-note">Search to show real workshops, distances, and directions.</p>}
  </Box>;
}
