import { useEffect,useRef,useState } from 'react';
import { Mic,Square,Send,Volume2 } from 'lucide-react';
import { Box,Txt,Card,Button } from '../ui';
import { apiPost,askAssistant,type ChatMessage } from './client';
import type { InspectionResult } from '../vision/client';
export default function Assistant({inspection}:{inspection?:InspectionResult|null}) {
  const [history,setHistory]=useState<ChatMessage[]>([]),[text,setText]=useState(''),[busy,setBusy]=useState(false),[recording,setRecording]=useState(false),[error,setError]=useState('');
  const acquiring=useRef(false);
  const mounted=useRef(true),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),request=useRef<AbortController|null>(null),audio=useRef<HTMLAudioElement|null>(null),audioUrl=useRef<string|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort();recorder.current?.state==='recording'&&recorder.current.stop();stream.current?.getTracks().forEach(track=>track.stop());audio.current?.pause();if(audioUrl.current)URL.revokeObjectURL(audioUrl.current);};},[]);
  async function ask(message:string) {
    if(busy||!message.trim())return;
    setBusy(true);setError('');setText('');const prior=history;setHistory([...prior,{role:'user',content:message}]);request.current=new AbortController();
    try{const answer=await askAssistant(message,prior,inspection,request.current.signal);if(mounted.current)setHistory([...prior,{role:'user',content:message},{role:'assistant',content:answer}]);}
    catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Assistant request failed.');}
    finally{if(mounted.current)setBusy(false);}
  }
  async function microphone() {
    if(acquiring.current)return;
    if(recorder.current?.state==='recording'){recorder.current.stop();return;}
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('Microphone recording is not supported here. You can type your question.');return;}
    acquiring.current=true;
    let acquired:MediaStream|undefined;
    try {
      setError('');const media=await navigator.mediaDevices.getUserMedia({audio:true});acquired=media;if(!mounted.current){media.getTracks().forEach(t=>t.stop());return;}
      stream.current=media;const capture=new MediaRecorder(media),chunks:BlobPart[]=[];let bytes=0;recorder.current=capture;
      capture.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);bytes+=event.data.size;if(bytes>4*1024*1024&&capture.state==='recording')capture.stop();}};
      capture.onstop=()=>{
        media.getTracks().forEach(track=>track.stop());if(!mounted.current)return;setRecording(false);
        if(bytes>4*1024*1024){setError('Recording is too long. Please record a shorter question.');return;}
        const blob=new Blob(chunks,{type:capture.mimeType||'audio/webm'});const reader=new FileReader();
        reader.onload=()=>{if(!mounted.current)return;setBusy(true);request.current=new AbortController();void apiPost('transcribe',{audioBase64:String(reader.result).split(',')[1],mimeType:blob.type},request.current.signal).then(data=>{if(mounted.current&&typeof data.text==='string')setText(data.text);}).catch(e=>{if(mounted.current)setError(e.message);}).finally(()=>{if(mounted.current)setBusy(false);});};reader.readAsDataURL(blob);
      };
      capture.start(500);setRecording(true);
    }catch{acquired?.getTracks().forEach(track=>track.stop());if(mounted.current)setError('Microphone access was unavailable. You can type your question.');}
    finally{acquiring.current=false;}
  }
  async function speak() {
    const last=[...history].reverse().find(item=>item.role==='assistant');if(!last)return;
    setBusy(true);setError('');request.current=new AbortController();
    try{const data=await apiPost('speak',{text:last.content.slice(0,4000)},request.current.signal);if(typeof data.audioBase64!=='string')throw new Error('No speech audio was returned.');const bytes=Uint8Array.from(atob(data.audioBase64),char=>char.charCodeAt(0));if(audioUrl.current)URL.revokeObjectURL(audioUrl.current);audioUrl.current=URL.createObjectURL(new Blob([bytes],{type:data.contentType||'audio/mpeg'}));audio.current=new Audio(audioUrl.current);await audio.current.play();}
    catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Speech playback failed.');}finally{if(mounted.current)setBusy(false);}
  }
  return <><div className="voice-title"><strong>Car assistant</strong><small>Ask about your car</small></div>
    {!history.length?<Card style={{padding:18,gap:8}}><Txt style={{fontWeight:700}}>How can I help?</Txt><Txt ui="muted">Ask about your latest inspection, financing, or nearby workshops.</Txt></Card>:<Box style={{gap:12}}>{history.map((item,index)=><Box key={index} ui="bubble" className={item.role==='user'?'user':''}><Txt style={item.role==='user'?{color:'white'}:undefined}>{item.content}</Txt></Box>)}</Box>}
    {busy?<Txt ui="muted">Working…</Txt>:null}{error?<Card style={{padding:16}}><Txt style={{color:'var(--red)'}}>{error}</Txt></Card>:null}
    <Box style={{gap:12}}><label className="assistant-input-label" htmlFor="assistant-question">Your question</label><textarea id="assistant-question" className="assistant-input" placeholder="Type a question or use the microphone…" value={text} onChange={e=>setText(e.target.value)} rows={3} disabled={busy||recording}/><Button label="Send question" disabled={busy||recording||!text.trim()} onPress={()=>void ask(text.trim())}><Send size={16} style={{verticalAlign:'middle',marginRight:7}}/>Send</Button><div className="assistant-controls"><button className="prompt" disabled={busy} onClick={()=>void microphone()}>{recording?<Square size={17}/>:<Mic size={17}/>} {recording?'Stop recording':'Use microphone'}</button><button className="prompt" disabled={busy||!history.some(m=>m.role==='assistant')} onClick={()=>void speak()}><Volume2 size={17}/> Read answer</button></div></Box>
    <Box style={{gap:9,alignItems:'flex-start'}}>{['Explain my latest inspection','Find a nearby workshop'].map(prompt=><button className="prompt" key={prompt} disabled={busy||recording} onClick={()=>void ask(prompt)}>{prompt}</button>)}</Box>
    <p className="demo-note">Questions and available inspection/map context are sent to the configured AI service. Microphone and playback use the configured speech provider. Conversation history stays in this session.</p>
  </>;
}
