import { useEffect,useRef,useState } from 'react';
import { Camera,CarFront } from 'lucide-react';
import { TextInput } from 'react-native-web';
import { Box,Txt,Card,Header,Label,Button,IconBox,Segments } from '../ui';
import { analyzePhotos,type InspectionResult } from './client';
export default function Inspection({onComplete}:{onComplete:(report:InspectionResult)=>void}) {
  const [files,setFiles]=useState<{Exterior?:File;Dashboard?:File}>({});
  const [photos,setPhotos]=useState({Exterior:'',Dashboard:''});const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [year,setYear]=useState('2019'),[miles,setMiles]=useState('84210'),[angle,setAngle]=useState('Front');
  const [notes,setNotes]=useState('');
  const urls=useRef<string[]>([]);const request=useRef<AbortController|null>(null);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();urls.current.forEach(url=>URL.revokeObjectURL(url));};},[]);
  function pick(kind:'Exterior'|'Dashboard',file?:File) {
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('Choose a JPEG, PNG, or WebP photo.');return;}
    if(!file.size||file.size>12*1024*1024){setError('Choose an image smaller than 12 MB.');return;}
    const url=URL.createObjectURL(file);urls.current.push(url);setPhotos(p=>({...p,[kind]:url}));setFiles(f=>({...f,[kind]:file}));setError('');
  }
  async function analyze() {
    if(!files.Exterior||!files.Dashboard)return;
    setBusy(true);setError('');request.current=new AbortController();
    try {
      if(!year.trim()||!miles.trim())throw new Error('Enter the vehicle year and mileage.');
      const result=await analyzePhotos({exterior:files.Exterior,dashboard:files.Dashboard,year:Number(year),miles:Number(miles),angle:angle.toLowerCase(),signal:request.current.signal});
      if(mounted.current)onComplete({...result,notes:notes.trim()});
    }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Analysis failed. Please try again.');}
    finally{if(mounted.current)setBusy(false);}
  }
  return <><Header title="Inspect" sub="Two photos, then we score your car."/>
    <Box><Label>PHOTOS</Label><Card>{(['Exterior','Dashboard'] as const).map(kind=><Box key={kind} ui="list-row" style={{padding:16}}>{photos[kind]?<img className="photo-preview" src={photos[kind]} alt={`${kind} preview`}/>:<IconBox>{kind==='Exterior'?<CarFront size={24}/>:<Camera size={24}/>}</IconBox>}<Box style={{flex:1,gap:2}}><Txt style={{fontWeight:600}}>{kind} photo</Txt><Txt ui="muted">{kind==='Exterior'?'Whole car, in daylight':'Engine running, gauges visible'}</Txt></Box><label className="photo-action">{photos[kind]?'Retake':'Take photo'}<input className="photo-input" aria-label={`Add ${kind.toLowerCase()} photo`} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e=>pick(kind,e.target.files?.[0])}/></label></Box>)}</Card></Box>
    <Box><Label>EXTERIOR VIEW</Label><Segments items={['Front','Rear','Left','Right']} value={angle} onChange={setAngle}/></Box>
    <Box><Label>VEHICLE DETAILS</Label><Card style={{padding:'0 16px'}}><div className="field"><label htmlFor="inspection-year">Vehicle year</label><input id="inspection-year" type="number" min="1900" value={year} onChange={e=>setYear(e.target.value)} disabled={busy}/></div><div className="field"><label htmlFor="inspection-miles">Mileage (mi)</label><input id="inspection-miles" type="number" min="0" max="2000000" value={miles} onChange={e=>setMiles(e.target.value)} disabled={busy}/></div></Card><Txt ui="muted" style={{fontSize:12,marginTop:8}}>Enter mileage manually; the detector does not read the odometer.</Txt></Box>
    <Box><Label>SERVICE HISTORY · OPTIONAL</Label><Card><TextInput accessibilityLabel="Service history" placeholder="Oil changes, repairs, new parts..." placeholderTextColor="#88888e" multiline value={notes} onChangeText={setNotes} style={{height:86,padding:16,color:'var(--text)',fontSize:15} as never}/></Card><Txt ui="muted" style={{fontSize:12,marginTop:8}}>Included as notes; not used by the visual scoring model.</Txt></Box>
    {error?<Card style={{padding:16}}><Txt style={{color:'var(--red)'}}>{error}</Txt></Card>:null}
    <Box style={{gap:10}}><Button label="Analyze" disabled={!files.Exterior||!files.Dashboard||busy} onPress={()=>void analyze()}>{busy?'Analyzing photos…':'Analyze'}</Button><p className="demo-note">{files.Exterior&&files.Dashboard?'Photos are sent to your configured vision server for analysis.':'Take both photos to continue'}</p><p className="demo-note">Experimental visual estimates. Exterior ratings require a qualified checkpoint.</p></Box>
  </>;
}
