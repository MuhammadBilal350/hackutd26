import WorkshopFinder from './maps/WorkshopFinder';
import { useEffect, useRef, useState } from 'react';
import { TextInput, Switch } from 'react-native-web';
import { CarFront, Camera, Gauge, Droplet, TriangleAlert, Tag, ChevronRight, Phone, CalendarDays, Minus, Plus, Mic } from 'lucide-react';
import { Box, Txt, Card, Row, Header, Label, Button, Tap, Segments, Progress, Badge, IconBox, ScoreRing, Toyota, red } from './ui';
import { canAnalyze, costs, dealers, finance, issues, maintenance, money } from './domain';
export type Screen = 'Home'|'Inspect'|'Forecast'|'Shop'|'Service'|'Report'|'Dealers'|'Voice';
export type ScreenProps = {go:(screen:Screen)=>void;notify:(title:string,message:string)=>void};

export function Home({go}:ScreenProps) {
  return <><Box style={{marginTop:-52}}><Toyota/><Header title="Camry SE" sub="2019 · 84,210 miles"/></Box>
    <Card style={{padding:20,gap:20}}><Row style={{gap:20}}><ScoreRing/><Box style={{flex:1,gap:5}}><Txt style={{color:red,fontSize:12,fontWeight:700,letterSpacing:.6}}>RELIABILITY</Txt><Txt style={{fontSize:22,fontWeight:700}}>Good shape</Txt><Txt ui="muted">Last scan Nov 2</Txt></Box></Row><Button onPress={()=>go('Inspect')}>Start inspection</Button></Card>
    <Box><Label>UP NEXT</Label><Card>{[
      {icon:<Droplet size={20}/>,color:'red',title:'Oil change',sub:'Due in 1,240 mi',screen:'Service'},
      {icon:<TriangleAlert size={20}/>,color:'amber',title:'Warning lights',sub:'2 found in your last scan',screen:'Report'},
      {icon:<Tag size={20}/>,color:'green',title:'Best dealer price',sub:'$930 below area average',screen:'Dealers'}
    ].map(item=><Tap key={item.title} ui="list-row" label={item.title} onPress={()=>go(item.screen as Screen)}><IconBox color={item.color}>{item.icon}</IconBox><Box style={{flex:1}}><Txt>{item.title}</Txt><Txt ui="muted">{item.sub}</Txt></Box><ChevronRight size={17} color="var(--muted)"/></Tap>)}</Card></Box>
  </>;
}
export function Forecast() {
  const [year,setYear] = useState(8);
  return <><Header title="Forecast" sub="Keep your car or buy new, over 10 years"/>
    <Card style={{padding:20,gap:16}}><Box><Txt style={{color:'var(--green)',fontSize:12,fontWeight:700,letterSpacing:.4}}>RECOMMENDATION</Txt><Txt style={{fontSize:22,fontWeight:700,marginTop:5}}>Keep it for now</Txt></Box><Row style={{gap:10}}><Box style={{background:'var(--soft)',borderRadius:18,padding:15,flex:1}}><Txt ui="muted" style={{fontSize:12}}>Keep</Txt><Txt style={{fontSize:23,fontWeight:700}}>$40,400</Txt></Box><Box style={{background:'var(--rose)',borderRadius:18,padding:15,flex:1}}><Txt style={{fontSize:12,color:red}}>Buy new</Txt><Txt style={{fontSize:23,fontWeight:700}}>$53,200</Txt></Box></Row></Card>
    <Card style={{padding:20}}><Row style={{justifyContent:'space-between'}}><Txt style={{fontWeight:600}}>Cost per year</Txt><Row style={{gap:9}}><Row style={{gap:4}}><Box style={{width:9,height:9,background:'var(--text)',borderRadius:2}}/><Txt ui="muted" style={{fontSize:12}}>Keep</Txt></Row><Row style={{gap:4}}><Box style={{width:9,height:9,background:red,borderRadius:2}}/><Txt ui="muted" style={{fontSize:12}}>New</Txt></Row></Row></Row>
      <div className="chart">{costs.map(([keep,buy],i)=><button className={year===i?'selected':''} aria-label={`Year ${i+1}: keep ${money(keep)}, new ${money(buy)}`} aria-pressed={year===i} onClick={()=>setYear(i)} key={i}><span className="bar" style={{height:`${keep/72}%`,animationDelay:`${i*25}ms`}}/><span className="bar new" style={{height:`${buy/72}%`,animationDelay:`${i*25+50}ms`}}/><span className="year">{i+1}</span></button>)}</div>
      <Row style={{borderTop:'1px solid var(--line)',paddingTop:14,justifyContent:'space-between'}}><Txt style={{fontSize:14,fontWeight:600}}>Year {year+1}</Txt><Txt ui="muted" style={{fontSize:14}}>Keep {money(costs[year][0])} · New {money(costs[year][1])}</Txt></Row></Card>
  </>;
}
export function Inspect({go}:ScreenProps) {
  const [photos,setPhotos] = useState({Exterior:'',Dashboard:''});const [busy,setBusy] = useState(false);const [error,setError] = useState('');
  const urls=useRef<string[]>([]);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{urls.current.forEach(url=>URL.revokeObjectURL(url));if(timer.current)clearTimeout(timer.current);},[]);
  function pick(kind:'Exterior'|'Dashboard', file?:File) {
    if(!file)return;if(!file.type.startsWith('image/')){setError('Please choose an image.');return;}
    if(file.size>15*1024*1024){setError('Choose an image smaller than 15 MB.');return;}
    const url=URL.createObjectURL(file);urls.current.push(url);setError('');setPhotos(p=>({...p,[kind]:url}));
  }
  return <><Header title="Inspect" sub="Two photos, then we score your car."/>
    <Box><Label>PHOTOS</Label><Card>{(['Exterior','Dashboard'] as const).map(kind=><Box ui="list-row" key={kind} style={{padding:16}}>{photos[kind]?<img className="photo-preview" src={photos[kind]} alt={`${kind} preview`}/>:<IconBox>{kind==='Exterior'?<CarFront size={24}/>:<Camera size={24}/>}</IconBox>}<Box style={{flex:1,gap:2}}><Txt style={{fontWeight:600}}>{kind} photo</Txt><Txt ui="muted">{kind==='Exterior'?'Photograph the whole car':'Gauges and warning lights visible'}</Txt></Box><label style={{padding:'9px 12px',borderRadius:22,background:'var(--card)',boxShadow:'0 5px 20px #0001',border:'1px solid var(--line)',color:red,fontSize:14,cursor:'pointer'}}>{photos[kind]?'Retake':'Take photo'}<input aria-label={`Add ${kind.toLowerCase()} photo`} className="photo-input" type="file" accept="image/*" capture="environment" onChange={e=>pick(kind,e.target.files?.[0])}/></label></Box>)}</Card>{error ? <Txt style={{color:red,fontSize:13,marginTop:8}}>{error}</Txt> : null}</Box>
    <Box><Label>SERVICE HISTORY</Label><Card><TextInput accessibilityLabel="Service history" placeholder="Oil changes, repairs, new parts..." placeholderTextColor="#88888e" multiline style={{height:107,padding:18,color:'var(--text)',fontSize:16,outlineStyle:'none'} as never}/></Card><Txt ui="muted" style={{fontSize:12,marginTop:8,textAlign:'center'}}>Optional, but it makes your score more accurate.</Txt></Box>
    <Box style={{gap:10}}><Button disabled={!canAnalyze(photos.Exterior,photos.Dashboard)||busy} label="Analyze" onPress={()=>{setBusy(true);timer.current=setTimeout(()=>go('Report'),1000);}}>{busy?'Analyzing demo…':'Analyze'}</Button><Txt ui="muted" style={{fontSize:12,textAlign:'center'}}>{canAnalyze(photos.Exterior,photos.Dashboard)?'Demo analysis · photos stay in your browser':'Take both photos to continue'}</Txt></Box>
  </>;
}
export function Report({go}:ScreenProps) {return <><Header title="Report" sub="Nov 2 · 84,210 mi on the dash"/>
  <Card style={{padding:20}}><Row style={{justifyContent:'space-between'}}><Row style={{gap:3,alignItems:'baseline'}}><Txt style={{fontSize:58,lineHeight:65,fontWeight:700,letterSpacing:-2}}>7.4</Txt><Txt ui="muted">/10</Txt></Row><Badge tone="green">Good</Badge></Row><Progress percent={74}/></Card>
  <Box><Label>NEEDS ATTENTION · 4</Label><Card>{issues.map(([title,sub,priority])=><Box ui="list-row" key={title}><Box style={{flex:1}}><Txt>{title}</Txt><Txt ui="muted">{sub}</Txt></Box><Badge tone={priority==='Today'?'red':priority==='Minor'?'soft':'amber'}>{priority}</Badge></Box>)}</Card></Box>
  <Box style={{gap:12}}><Button onPress={()=>go('Forecast')}>See 10-year cost</Button><Button secondary onPress={()=>go('Service')}>Find a workshop</Button></Box><p className="demo-note">Illustrative report · no real vehicle diagnosis performed.</p>
</>;}

export function Service({notify}:ScreenProps) {
  const [tab,setTab]=useState('Maintenance');const [remind,setRemind]=useState(true);const [day,setDay]=useState('Mon');
  return <><Header title="Service"/><Segments items={['Maintenance','Workshop & Tow']} value={tab} onChange={setTab}/>
  {tab==='Maintenance'?<Box key="maintenance" ui="screen" style={{gap:24}}><Box><Label>MILES UNTIL DUE · 84,210 NOW</Label><Card style={{padding:'0 16px'}}>{maintenance.map(([name,miles,percent],i)=><Box key={name} style={{padding:'15px 0',borderBottom:i<3?'1px solid var(--line)':undefined}}><Row style={{justifyContent:'space-between'}}><Txt>{name}</Txt><Txt style={{fontWeight:600,color:i===0?red:'var(--text)'}}>{miles}</Txt></Row><Progress percent={percent} color={i===0?red:'var(--text)'}/></Box>)}</Card></Box>
    <Card style={{padding:'12px 16px'}}><Row style={{justifyContent:'space-between'}}><Box><Txt>Reminders</Txt><Txt ui="muted">Notify at 500 mi left</Txt></Box><Switch accessibilityLabel="Maintenance reminders" value={remind} onValueChange={setRemind} activeTrackColor="#30c759" trackColor={{false:'#bcbcc2',true:'#30c759'}} thumbColor="white"/></Row></Card>
    <Box><Label>BOOK AN APPOINTMENT</Label><Row style={{gap:8,marginBottom:14}}>{['Mon','Tue','Wed','Thu','Fri'].map((name,i)=><Tap key={name} label={`${name} ${i+9}`} selected={day===name} onPress={()=>setDay(name)} style={{flex:1,borderRadius:20,background:day===name?red:'var(--card)',padding:'11px 0',alignItems:'center',gap:5}}><Txt style={{fontSize:12,color:day===name?'white':'var(--muted)'}}>{name}</Txt><Txt style={{fontSize:16,fontWeight:600,color:day===name?'white':'var(--text)'}}>{i+9}</Txt></Tap>)}</Row><Button label="Book for 9:00 AM" onPress={()=>notify('Appointment selected',`${day}, Nov ${9+['Mon','Tue','Wed','Thu','Fri'].indexOf(day)} at 9:00 AM. This is a demo booking; no appointment has been sent.`)}><CalendarDays size={18} style={{verticalAlign:'middle',marginRight:8}}/>Book for 9:00 AM</Button></Box>
  </Box>:<WorkshopFinder/>}</>;
}
export function Shop({go}:ScreenProps) {
  const [category,setCategory]=useState('SUV');const [term,setTerm]=useState('60 mo');const [credit,setCredit]=useState('Good');
  const [price,setPrice]=useState('36000');const [down,setDown]=useState('5000');const [apr,setApr]=useState(6.9);
  const result=price.trim()&&down.trim()?finance(Number(price),Number(down),apr,parseInt(term)):null;
  return <><Header title="New car"/><Segments items={['Sedan','SUV','Truck','Minivan']} value={category} onChange={setCategory}/>
    <Card style={{padding:'0 16px'}}><div className="field"><label htmlFor="price">Car price</label><span className="currency">$</span><input id="price" inputMode="decimal" type="number" min="0" value={price} onChange={e=>setPrice(e.target.value)}/></div><div className="field"><label htmlFor="down">Down payment</label><span className="currency">$</span><input id="down" inputMode="decimal" type="number" min="0" value={down} onChange={e=>setDown(e.target.value)}/></div><Row style={{padding:'13px 0',justifyContent:'space-between'}}><Txt>Interest rate</Txt><Row style={{gap:10}}><Txt>{apr.toFixed(2)}%</Txt><Box ui="stepper"><Tap label="Decrease interest rate" onPress={()=>setApr(Math.max(0,Math.round((apr-.25)*100)/100))}><Minus size={16}/></Tap><Tap label="Increase interest rate" onPress={()=>setApr(Math.min(30,Math.round((apr+.25)*100)/100))}><Plus size={16}/></Tap></Box></Row></Row></Card>
    <Box><Label>LOAN LENGTH</Label><Segments items={['36 mo','48 mo','60 mo','72 mo']} value={term} onChange={setTerm}/></Box>
    <Box><Label>CREDIT SCORE</Label><Segments items={['Excellent','Good','Fair','Building']} value={credit} onChange={v=>{setCredit(v);setApr({Excellent:5.4,Good:6.9,Fair:9.9,Building:13.9}[v]!);}}/></Box>
    <Card style={{padding:16}}><Row style={{justifyContent:'space-between',alignItems:'flex-end',paddingBottom:16,borderBottom:'1px solid var(--line)'}}><Box><Txt ui="muted" style={{fontSize:12}}>Monthly</Txt><Txt style={{fontSize:35,fontWeight:700,letterSpacing:-1}}>{result?money(result.monthly):'—'}</Txt></Box><Box style={{alignItems:'flex-end'}}><Txt ui="muted" style={{fontSize:12}}>Total interest</Txt><Txt style={{fontSize:17,fontWeight:600}}>{result?money(result.interest):'—'}</Txt></Box></Row><Tap label="Compare dealer prices" onPress={()=>go('Dealers')} style={{paddingTop:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Txt style={{color:red}}>Compare dealer prices</Txt><ChevronRight size={18} color="var(--muted)"/></Tap></Card>
    <p className="demo-note">{result?'Illustrative financing estimate. Taxes and fees excluded.':'Enter valid nonnegative prices to calculate your estimate.'}</p>
  </>;
}
export function Dealers({notify}:ScreenProps) {return <><Header title="Dealers" sub="Your SUV match · lowest price first"/>
  <Card style={{padding:20,border:`2px solid ${red}`,gap:16}}><Box><Txt style={{color:red,fontSize:12,fontWeight:700,letterSpacing:.4}}>BEST PRICE</Txt><Row style={{justifyContent:'space-between',marginTop:5}}><Txt style={{fontSize:20,fontWeight:700}}>Lakeview Toyota</Txt><Txt style={{fontSize:28,fontWeight:700,letterSpacing:-.7}}>$34,180</Txt></Row><Row style={{justifyContent:'space-between',marginTop:4}}><Txt ui="muted">4.2 mi · 3 in stock</Txt><Txt style={{color:'var(--green)',fontSize:12,fontWeight:600}}>$930 below avg.</Txt></Row></Box><Row style={{gap:10}}><Box style={{flex:1}}><Button secondary label="Call Lakeview Toyota" onPress={()=>notify('Lakeview Toyota','Demo dealer listing. A verified phone number will be provided by the dealer integration.')}><Phone size={17} style={{verticalAlign:'middle',marginRight:8}}/>Call</Button></Box><Box style={{flex:1.4}}><Button onPress={()=>notify('Price selected','$34,180 at Lakeview Toyota. This is a demo offer; no real reservation has been placed.')}>Lock price</Button></Box></Row></Card>
  <Box><Label>OTHER DEALERS</Label><Card>{dealers.map(([name,price,distance,difference])=><Tap label={`View ${name} offer`} key={name} ui="list-row" onPress={()=>notify(name,`${price} · ${distance}. Demo pricing; availability is illustrative.`)} style={{justifyContent:'space-between'}}><Box><Txt>{name}</Txt><Txt ui="muted">{distance}</Txt></Box><Box style={{alignItems:'flex-end'}}><Txt style={{fontWeight:600}}>{price}</Txt><Txt ui="muted" style={{fontSize:13}}>{difference}</Txt></Box></Tap>)}</Card></Box>
</>;}
export function Voice() {
  const [listening,setListening]=useState(true);const [question,setQuestion]=useState('Is the amber engine light serious?');const [answer,setAnswer]=useState('Usually not urgent. Tighten the fuel cap first. If it stays on a few days, book a check.');
  const ask=(q:string)=>{setQuestion(q);setListening(false);setAnswer(q==='When is my next oil change?'?'Your next oil change is due in 1,240 miles, at about 85,450 miles on the dash.':"Your demo score is 7.4 out of 10: good shape overall, with four items to check. Start with tire pressure and the amber engine light.");};
  return <><div className="voice-title"><strong>Voice guide</strong><small>Ask about your car</small></div><Box style={{gap:10,marginTop:-10}}><Box ui="bubble" className="user"><Txt style={{color:'white'}}>{question}</Txt></Box><Box ui="bubble"><Txt>{answer}</Txt></Box></Box>
    <Box style={{alignItems:'center',gap:10}}><div className={`voice-orbit ${listening?'active':''}`}><button className="voice-button" aria-label={listening?'Pause voice demo':'Start voice demo'} onClick={()=>setListening(!listening)}><Mic size={39}/></button></div><div className={`wave ${listening?'active':''}`} aria-hidden="true">{Array.from({length:15},(_,i)=><i key={i} style={{height:6+((i*7)%25),animationDelay:`${i*.075}s`}}/>)}</div><Txt style={{fontSize:20,fontWeight:600}}>{listening?'Listening…':'Tap to speak'}</Txt></Box>
    <Box style={{gap:9,alignItems:'center',marginTop:12}}>{['When is my next oil change?','Explain my score'].map(q=><button className="prompt" onClick={()=>ask(q)} key={q}>{q}</button>)}</Box><p className="demo-note">Voice preview · no microphone recording or live AI.</p>
  </>;
}
