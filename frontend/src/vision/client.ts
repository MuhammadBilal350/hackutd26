export interface DashboardReport {
  reading:{lights:{id:string;name:string;color:string;confidence:string}[];likely_bulb_check:boolean};
  reliability:{score:number;grade:string;drive_safe:string;faults:string[];actions:string[];odometer_miles:number;warning?:string;est_repair_cost_usd?:number[]};
  limitations:string;
}
export interface ExteriorReport {
  condition:{visible_condition_score:number|null;coverage:{captured:string[];missing:string[];complete:boolean};findings:{label:string;confidence:number;visual_extent?:string;area_fraction?:number;view?:string}[];rating_enabled:boolean;rating_note:string;limitations:string};
  model:{checkpoint_present:boolean;rating_enabled:boolean};
}
export interface InspectionResult {dashboard?:DashboardReport;exterior?:ExteriorReport;errors:{dashboard?:string;exterior?:string};capturedAt:string;year:number;miles:number;notes?:string}
export interface PhotoInput {dashboard:File;exterior:File;year:number;miles:number;angle:string;signal?:AbortSignal}
export async function analyzePhotos(input:PhotoInput,fetcher:typeof fetch=fetch):Promise<InspectionResult> {
  if(!Number.isInteger(input.year)||input.year<1900||input.year>new Date().getFullYear()+1||!Number.isInteger(input.miles)||input.miles<0||input.miles>2_000_000)throw new Error('Enter a valid vehicle year and mileage.');
  if(!['front','rear','left','right'].includes(input.angle))throw new Error('Choose an exterior photo angle.');
  for(const file of [input.dashboard,input.exterior])if(!file.size||file.size>12*1024*1024)throw new Error('Choose photos smaller than 12 MB.');
  const controller=new AbortController();const abort=()=>controller.abort();input.signal?.addEventListener('abort',abort,{once:true});if(input.signal?.aborted)abort();
  const timer=setTimeout(abort,90_000);
  const base=(import.meta.env.VITE_VISION_API_BASE||'/api/vision').replace(/\/$/,'');
  async function upload(path:string,file:File) {
    let response:Response;
    try{response=await fetcher(`${base}/${path}`,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file,signal:controller.signal});}
    catch{throw new Error('Vision service could not be reached. Start the vision server and try again.');}
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(typeof data?.error==='string'?data.error:'Vision service is unavailable. Please try again.');
    return data;
  }
  try {
    const metadata=new URLSearchParams({miles:String(input.miles),year:String(input.year),unit:'mi'});
    const [dash,exterior]=await Promise.allSettled([upload(`dashboard?${metadata}`,input.dashboard),upload(`exterior?angle=${input.angle}`,input.exterior)]);
    const result:InspectionResult={errors:{},capturedAt:new Date().toISOString(),year:input.year,miles:input.miles};
    if(dash.status==='fulfilled'&&typeof dash.value?.reliability?.score==='number'&&dash.value.reliability.score>=0&&dash.value.reliability.score<=100&&Array.isArray(dash.value?.reading?.lights)&&Array.isArray(dash.value.reliability.actions))result.dashboard=dash.value;
    else result.errors.dashboard=dash.status==='rejected'?String(dash.reason.message):'Dashboard service returned an invalid report.';
    if(exterior.status==='fulfilled'&&Array.isArray(exterior.value?.condition?.findings)&&Array.isArray(exterior.value?.condition?.coverage?.missing))result.exterior=exterior.value;
    else result.errors.exterior=exterior.status==='rejected'?String(exterior.reason.message):'Exterior service returned an invalid report.';
    if(!result.dashboard&&!result.exterior)throw new Error(`Dashboard: ${result.errors.dashboard} Exterior: ${result.errors.exterior}`);
    return result;
  }finally{clearTimeout(timer);input.signal?.removeEventListener('abort',abort);}
}
