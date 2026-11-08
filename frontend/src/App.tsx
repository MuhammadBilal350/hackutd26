import { useEffect, useState } from 'react';
import { Home as HomeIcon, ScanLine, ChartNoAxesCombined, CarFront, Wrench, Mic, Sun, Moon, ChevronLeft, Check } from 'lucide-react';
import { View } from 'react-native-web';
import { Box, Txt, Tap, Button } from './ui';
import { Home, Inspect, Forecast, Shop, Service, Report, Dealers, Voice, type Screen } from './screens';
import { IPHONE, previewScale } from './device';
function initialTheme() { try{return localStorage.getItem('camry-theme')==='dark'?'dark':'light';}catch{return 'light';} }
export default function App() {
  const fitScale=()=>previewScale(window.innerWidth,window.innerHeight);
  const [scale,setScale]=useState(fitScale);
  useEffect(()=>{const resize=()=>setScale(fitScale());window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  const [screen,setScreen]=useState<Screen>('Home');const [theme,setTheme]=useState(initialTheme);
  const [previous,setPrevious]=useState<Screen>('Home');const [modal,setModal]=useState<{title:string;message:string}|null>(null);
  useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('camry-theme',theme);}catch{/* storage unavailable */}},[theme]);
  function go(next:Screen) {setPrevious(screen);setScreen(next);}
  const notify=(title:string,message:string)=>setModal({title,message});
  const props={go,notify};
  const content={Home:<Home {...props}/>,Inspect:<Inspect {...props}/>,Forecast:<Forecast/>,Shop:<Shop {...props}/>,Service:<Service {...props}/>,Report:<Report {...props}/>,Dealers:<Dealers {...props}/>,Voice:<Voice/>}[screen];
  const active=screen==='Report'?'Inspect':screen==='Dealers'?'Shop':screen;
  return <div className="iphone-stage" style={{width:IPHONE.width*scale,height:IPHONE.height*scale}}><div className="iphone-frame" style={{transform:`scale(${scale})`}}><View nativeID="app" dataSet={{theme,screen}} {...{className:theme}}>
    {['Report','Dealers','Voice'].includes(screen)&&<Tap ui="back" label="Go back" onPress={()=>setScreen(previous==='Voice'?'Home':previous)}><ChevronLeft size={21} color="var(--text)"/></Tap>}
    <Box ui="theme">{[{name:'light',icon:Sun},{name:'dark',icon:Moon}].map(({name,icon:Icon})=><Tap key={name} label={name==='light'?'Light theme':'Dark theme'} selected={theme===name} onPress={()=>setTheme(name)}><Icon size={15} color={theme===name&&name==='light'?'#ef9b25':'var(--muted)'}/></Tap>)}</Box>
    <Box ui="viewport"><Box ui="screen" key={screen}>{content}</Box></Box>
    {screen!=='Voice'&&<Box ui="dock"><Box ui="nav">{[{name:'Home',icon:HomeIcon},{name:'Inspect',icon:ScanLine},{name:'Forecast',icon:ChartNoAxesCombined},{name:'Shop',icon:CarFront},{name:'Service',icon:Wrench}].map(({name,icon:Icon})=><Tap key={name} ui="nav-item" label={name} selected={active===name} onPress={()=>go(name as Screen)}><Icon size={21} strokeWidth={1.7}/><Txt>{name}</Txt></Tap>)}</Box><Tap ui="mic-nav" label="Voice guide" onPress={()=>go('Voice')}><Mic size={25}/></Tap></Box>}
    {modal&&<Box ui="modal-shade"><Box ui="modal"><Box style={{width:48,height:48,borderRadius:30,background:'var(--greenbg)',alignItems:'center',justifyContent:'center',color:'var(--green)'}}><Check size={26}/></Box><Txt style={{fontSize:25,fontWeight:700}}>{modal.title}</Txt><Txt ui="muted" style={{lineHeight:24}}>{modal.message}</Txt><Button onPress={()=>setModal(null)}>Got it</Button></Box></Box>}
  </View></div></div>;
}
