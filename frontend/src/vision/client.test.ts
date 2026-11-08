import { expect,it } from 'vitest';
import { analyzePhotos } from './client';
const dashboard={reading:{lights:[],likely_bulb_check:false},reliability:{score:87,grade:'B',drive_safe:'yes',faults:[],actions:[],odometer_miles:84210},limitations:'Experimental visual estimate'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const photo=new File(['photo'],'dashboard.jpg',{type:'image/jpeg'});
it('submits actual photo bodies and returns partial dashboard results when exterior is unavailable',async()=>{
  const calls:{url:string;body:unknown}[]=[];
  const fetcher:typeof fetch=async(url,init)=>{calls.push({url:String(url),body:init?.body});return String(url).includes('dashboard')?json(dashboard):json({error:'Exterior checkpoint is not available'},503);};
  const result=await analyzePhotos({dashboard:photo,exterior:photo,year:2019,miles:84210,angle:'front'},fetcher);
  expect(result.dashboard?.reliability.score).toBe(87);
  expect(result.exterior).toBeUndefined();
  expect(result.errors.exterior).toContain('checkpoint');
  expect(calls.every(c=>c.body===photo)).toBe(true);
  expect(calls.some(c=>c.url.includes('miles=84210')&&c.url.includes('year=2019'))).toBe(true);
});
it('fails clearly if neither service analyzes the photos',async()=>{
  await expect(analyzePhotos({dashboard:photo,exterior:photo,year:2019,miles:84210,angle:'front'},async()=>json({error:'Service unavailable'},503))).rejects.toThrow('Service unavailable');
});
it('rejects invalid vehicle metadata before uploading photos',async()=>{
  let calls=0;
  await expect(analyzePhotos({dashboard:photo,exterior:photo,year:2019,miles:-1,angle:'front'},async()=>{calls++;return json(dashboard);})).rejects.toThrow(/mileage/);
  expect(calls).toBe(0);
});
