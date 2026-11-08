'use strict';
const $ = id => document.getElementById(id);
const viewButtons = [...document.querySelectorAll('[data-angle]')];
let angle='front', mode='photo', photo=null, stream=null, busy=false, starting=false, checkpointReady=false;
let generation=0, liveTimer=null, report=null, csv='', marketBusy=false, valueGeneration=0, hydrated=false;
const message=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
const valueMessage=(text,error=false)=>{$('value-status').textContent=text;$('value-status').classList.toggle('error',error);};
function controls(){
  viewButtons.forEach(button=>button.disabled=busy||!hydrated);
  $('photo-tab').disabled=busy||!hydrated;$('camera-tab').disabled=busy||!hydrated;$('photo').disabled=busy||!hydrated;
  $('inspect').disabled=busy||!hydrated||!checkpointReady||(mode==='photo'?!photo:!stream);
  $('inspect-label').textContent=busy?'Inspecting…':`Inspect ${angle} view`;
  $('start').disabled=starting||!!stream;$('stop').disabled=!starting&&!stream;$('auto').disabled=!stream;
  $('estimate').disabled=marketBusy||busy||!hydrated;$('reset').disabled=busy||marketBusy||!hydrated;
}
function invalidateValue(){valueGeneration++;$('valuation').hidden=true; if(report) delete report.valuation;}
function clearLocal(){report=null;$('condition').hidden=true;$('empty').hidden=false;$('export').disabled=true;invalidateValue();}
function renderCondition(condition){
  report={...report,condition};
  $('coverage').textContent=`${condition.coverage.captured.length} / 4 VIEWS`;
  viewButtons.forEach(button=>{const done=condition.coverage.captured.includes(button.dataset.angle);button.classList.toggle('done',done);button.querySelector('span').textContent=done?'✓':'○';});
  $('condition').hidden=!condition.coverage.captured.length;$('empty').hidden=!!condition.coverage.captured.length;
  $('score').textContent=condition.visible_condition_score??'—';
  $('condition-label').textContent=condition.rating_enabled===false?'Rating withheld · model quality gate not met':condition.condition==='visible_damage_detected'?'Visible dent / scratch matches':'No confident dent / scratch matches';
  $('findings').replaceChildren();
  for(const finding of condition.findings){const row=node('div','finding');row.append(node('span','',`${finding.view} · ${finding.label}`),node('small','',`${Math.round(finding.confidence*100)}% confidence · ${finding.visual_extent.replaceAll('_',' ')}`));$('findings').append(row);}
  if(!condition.findings.length)$('findings').append(node('p','muted','No confident matches in the covered classes. This does not establish that the car is damage-free or well maintained.'));
  $('missing').textContent=condition.coverage.missing.length?`Missing views: ${condition.coverage.missing.join(', ')}`:'All four views captured. Coverage does not rule out hidden damage.';
  $('next-steps').replaceChildren(...condition.next_steps.map(text=>node('li','',text)));
  $('export').disabled=!condition.coverage.captured.length;
}
function node(tag,cls,text){const item=document.createElement(tag);if(cls)item.className=cls;if(text!==undefined)item.textContent=text;return item;}
function stopCamera(){if(!busy)generation++;clearTimeout(liveTimer);$('auto').checked=false;if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;$('video').srcObject=null;$('video').hidden=true;$('camera-empty').hidden=false;$('live').hidden=true;controls();}
function selectMode(next){if(busy)return;stopCamera();mode=next;photo=null;$('photo').value='';$('file-name').textContent='Bring your car into focus';clearLocal();$('photo-pane').hidden=next!=='photo';$('camera-pane').hidden=next!=='camera';$('photo-tab').setAttribute('aria-pressed',String(next==='photo'));$('camera-tab').setAttribute('aria-pressed',String(next==='camera'));message(next==='photo'?'Choose a photo for the selected view.':'Start your camera and frame one vehicle.');controls();}
$('photo-tab').onclick=()=>selectMode('photo');$('camera-tab').onclick=()=>selectMode('camera');
viewButtons.forEach(button=>button.onclick=()=>{generation++;clearTimeout(liveTimer);$('auto').checked=false;angle=button.dataset.angle;photo=null;$('photo').value='';$('file-name').textContent=`Add a ${angle} view photo`;viewButtons.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));message(`Ready for the ${angle} view. Previous captured angles are kept.`);controls();});
function choosePhoto(file){if(!file||busy)return;generation++;clearLocal();photo=null;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024){message('Choose a JPG, PNG or WebP photo smaller than 12 MB.',true);$('file-name').textContent='Choose another photo';}else{photo=file;$('file-name').textContent=file.name;message(`Photo ready for ${angle}. Click Inspect to replace that view’s reading.`);}controls();}
$('photo').onchange=event=>choosePhoto(event.target.files[0]);
for(const event of ['dragenter','dragover'])$('drop').addEventListener(event,e=>{e.preventDefault();$('drop').classList.add('over');});
for(const event of ['dragleave','drop'])$('drop').addEventListener(event,e=>{e.preventDefault();$('drop').classList.remove('over');});
$('drop').addEventListener('drop',event=>choosePhoto(event.dataTransfer.files[0]));
$('start').onclick=async()=>{
  if(starting||stream)return;if(!navigator.mediaDevices?.getUserMedia)return message('Camera unavailable in this browser. Use Chrome/Edge on localhost or upload a photo.',true);
  starting=true;const token=generation;controls();message('Waiting for camera permission…');
  try{const acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});
    if(token!==generation||mode!=='camera'){acquired.getTracks().forEach(track=>track.stop());return;}
    stream=acquired;$('video').srcObject=stream;await $('video').play();$('video').hidden=false;$('camera-empty').hidden=true;$('live').hidden=false;stream.getVideoTracks()[0].onended=()=>{stopCamera();message('Camera disconnected.',true);};message('Camera live. Capture the selected angle, or enable Auto-capture.');
  }catch(error){stopCamera();message(error.name==='NotAllowedError'?'Camera permission denied. Allow it in your browser or upload a photo.':'Could not open the camera. Close other camera apps or use photo upload.',true);}
  finally{starting=false;controls();}
};
$('stop').onclick=()=>{stopCamera();message('Camera stopped.');};
async function cameraFrame(){const video=$('video');if(!video.videoWidth||video.readyState<2)throw Error('Camera is still starting.');const canvas=document.createElement('canvas');canvas.width=Math.min(video.videoWidth,1600);canvas.height=Math.round(video.videoHeight*canvas.width/video.videoWidth);canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Capture failed.')),'image/jpeg',.9));}
function schedule(){clearTimeout(liveTimer);if($('auto').checked&&stream&&mode==='camera')liveTimer=setTimeout(inspect,2000);}
async function inspect(){
  if(busy||!checkpointReady)return;busy=true;const token=generation,requestAngle=angle;invalidateValue();controls();
  try{const image=mode==='camera'?await cameraFrame():photo;if(!image)throw Error('Choose a photo first.');message(`Analyzing ${requestAngle}. The first request also loads model weights…`);const response=await fetch(`/api/inspect?angle=${requestAngle}`,{method:'POST',headers:{'Content-Type':image.type},body:image});const result=await response.json();if(!response.ok)throw Error(result.error);if(token!==generation)return;report={...result};renderCondition(result.condition);message(`${requestAngle} captured · ${Math.round(result.capture.inference_ms)} ms · experimental detection.`);}
  catch(error){if(token===generation){clearLocal();$('auto').checked=false;message(error.message||'Connection lost. Check the local server.',true);}}
  finally{busy=false;controls();schedule();}
}
$('inspect').onclick=inspect;$('auto').onchange=()=>{$('auto').checked?inspect():clearTimeout(liveTimer);};
$('reset').onclick=async()=>{if(busy||marketBusy)return;stopCamera();clearLocal();photo=null;$('photo').value='';$('file-name').textContent='Bring your car into focus';try{const response=await fetch('/api/reset',{method:'POST',body:'{}'});const result=await response.json();if(!response.ok)throw Error(result.error);renderCondition(result.condition);message('New inspection started.');}catch(error){message(error.message,true);}controls();};
function vehicle(){return {make:$('make').value,model:$('car-model').value,trim:$('trim').value,year:$('year').value,mileage:$('mileage').value,zip:$('zip').value,purchase_price:$('purchase').value,vin:$('vin').value};}
$('vehicle').addEventListener('input',()=>{invalidateValue();valueMessage('Vehicle details changed. Recalculate to update the estimate.');});
$('comparables').onchange=async event=>{invalidateValue();csv='';const file=event.target.files[0];if(!file)return;if(file.size>2000000)return valueMessage('Use a comparable CSV smaller than 2 MB.',true);try{csv=await file.text();valueMessage(`${file.name} ready. Click Calculate to match comparable listings.`);}catch{valueMessage('Could not read CSV.',true);}};
const dollars=value=>value==null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
$('vehicle').onsubmit=async event=>{event.preventDefault();if(marketBusy)return;marketBusy=true;const token=valueGeneration;controls();valueMessage('Checking current market evidence…');
  try{const response=await fetch('/api/value',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vehicle:vehicle(),listings_csv:csv,use_market_provider:$('provider').checked})});const result=await response.json();if(!response.ok)throw Error(result.error);if(token!==valueGeneration)return;report={...report,...result};renderCondition(result.condition);const v=result.valuation;$('valuation').hidden=v.status!=='available';
    if(v.status!=='available'){valueMessage(v.note);return;}$('price').textContent=dollars(v.baseline_usd);$('price-source').textContent=`${v.source} · ${v.as_of}${v.sample_count===null?'':` · ${v.sample_count} comparable listings`}`;$('price-range').textContent=v.asking_range_usd?v.asking_range_usd.map(dollars).join(' – '):'Not provided';$('scenario').textContent=dollars(v.condition_scenario_usd);$('purchase-change').textContent=dollars(v.change_from_purchase_usd);$('value-note').textContent=`${v.note} ${v.condition_note||''} ${v.purchase_change_note||''}`;$('history').replaceChildren();for(const item of v.market_history||[])$('history').append(node('p','helper',`${item.month}: ${dollars(item.median_asking_usd)} median asking · ${item.sample_count} listings`));valueMessage('Market estimate ready. Condition scenario is separate and uncalibrated.');$('export').disabled=false;
  }catch(error){if(token===valueGeneration){$('valuation').hidden=true;valueMessage(error.message||'Market request failed.',true);}}
  finally{marketBusy=false;controls();}
};
$('export').onclick=()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=node('a');link.href=url;link.download='exterior-inspection.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});window.addEventListener('pagehide',stopCamera);
async function statusCheck(){try{const response=await fetch('/api/status');if(!response.ok)throw Error('Server unavailable');const result=await response.json();checkpointReady=result.model.checkpoint_present;if(!hydrated){renderCondition(result.condition);hydrated=true;if(result.condition.coverage.captured.length)message('Restored this browser session’s inspection. Choose New inspection when switching cars.');}$('model-state').textContent=checkpointReady?(result.model.rating_enabled?'EXPERIMENTAL MODEL':'RESEARCH ONLY · RATING WITHHELD'):'MODEL TRAINING / NOT READY';$('model-detail').textContent=JSON.stringify(result.model,null,2);$('provider').disabled=!result.market_provider_configured;
  }catch{checkpointReady=false;$('model-state').textContent='SERVER DISCONNECTED';}controls();setTimeout(statusCheck,10000);}
statusCheck();
