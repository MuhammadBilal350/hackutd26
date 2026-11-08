import type { InspectionResult } from '../vision/client';
import { getLatestWorkshopContext } from '../maps/client';
import { getFinanceContext } from './context';
export type ChatMessage={role:'user'|'assistant';content:string};
export async function apiPost(path:string,body:unknown,signal?:AbortSignal) {
  const base=(import.meta.env.VITE_API_URL||'').replace(/\/$/,'');
  let response:Response;
  try{response=await fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});}
  catch{throw new Error('The assistant service could not be reached. Please try again.');}
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(typeof data?.error==='string'?data.error:'The assistant service is unavailable.');
  return data;
}
export async function askAssistant(message:string,history:ChatMessage[],inspection?:InspectionResult|null,signal?:AbortSignal) {
  const data=await apiPost('analyze',{message,history:history.slice(-8),vehicle:{make:'Toyota',model:'Camry',year:inspection?.year??2019,mileage:inspection?.miles??84210},comparison:getFinanceContext(),nearbyServices:getLatestWorkshopContext(),inspectionResults:inspection?{dashboard:inspection.dashboard,exterior:inspection.exterior,errors:inspection.errors,year:inspection.year,miles:inspection.miles,capturedAt:inspection.capturedAt}:undefined},signal);
  if(typeof data?.answer!=='string'||!data.answer.trim())throw new Error('The assistant returned an empty response.');
  return data.answer as string;
}
