import { describe, expect, it } from 'vitest';
import { createRoadsideFinder } from '../../../shared/roadside';
const location={lat:32.9483,lon:-96.7299};
const feature=(id:string,name:string,lat=32.95,lon=-96.73)=>({properties:{place_id:id,name,lat,lon,formatted:'123 Test Street',phone:'+15551234567'}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
describe('shared workshop search',()=>{
  it('prefers Toyota listings, deduplicates them and orders by driving time',async()=>{
    const calls:{url:string;body:unknown}[]=[];
    const fetcher:typeof fetch=async(input,init)=>{
      calls.push({url:String(input),body:init?.body?JSON.parse(String(init.body)):null});
      return calls.length===1?json({features:[feature('a','Toyota A'),feature('a','Toyota A'),feature('b','Toyota B'),feature('c','Other garage')]}):json({sources_to_targets:[[{distance:3218.68,time:600},{distance:1609.34,time:300}]]});
    };
    const result=await createRoadsideFinder('test-key',fetcher)(location);
    expect(result.centers.map(c=>c.id)).toEqual(['b','a']);
    expect(result.nearest?.drivingDistanceMiles).toBeCloseTo(1);
    expect(result.nearest?.durationMinutes).toBe(5);
    expect(result.usedFallback).toBe(false);
    expect(result.routingAvailable).toBe(true);
    expect(calls[0].url).toContain('circle%3A-96.7299%2C32.9483%2C40234');
    expect(calls[1].body).toMatchObject({mode:'drive',sources:[{location:[-96.7299,32.9483]}],targets:[{location:[-96.73,32.95]},{location:[-96.73,32.95]}]});
  });
  it('falls back to nearby repair shops and air distance if routing is unavailable',async()=>{
    let requests=0;
    const finder=createRoadsideFinder('test-key',async()=>++requests===1?json({features:[feature('a','Independent repair')]}):json({},503));
    const result=await finder(location);
    expect(result.usedFallback).toBe(true);
    expect(result.routingAvailable).toBe(false);
    expect(result.nearest?.drivingDistanceMiles).toBeNull();
    expect(result.nearest?.distanceMiles).toBeGreaterThan(0);
  });
  it('drops invalid coordinates and does not call routing for empty results',async()=>{
    let requests=0;
    const result=await createRoadsideFinder('test-key',async()=>{requests++;return json({features:[feature('bad','Toyota',99)]});})(location);
    expect(result.nearest).toBeNull();expect(result.centers).toEqual([]);expect(requests).toBe(1);
  });
  it('rejects invalid input before making requests',async()=>{
    let requests=0;const fetcher:typeof fetch=async()=>{requests++;return json({});};
    await expect(createRoadsideFinder('',fetcher)(location)).rejects.toThrow(/configured/);
    await expect(createRoadsideFinder('key',fetcher)({lat:NaN,lon:0})).rejects.toThrow(/coordinates/);
    await expect(createRoadsideFinder('key',fetcher)(location,0)).rejects.toThrow(/radius/);
    expect(requests).toBe(0);
  });
  it('surfaces failed places requests without exposing provider keys or response bodies',async()=>{
    await expect(createRoadsideFinder('secret-key',async()=>new Response('secret-key',{status:401}))(location)).rejects.toThrow('Workshop search failed (401). Please try again.');
  });
  it('keeps unreachable destinations after reachable ones and never shows negative travel times',async()=>{
    let requests=0;
    const result=await createRoadsideFinder('key',async()=>++requests===1?json({features:[feature('a','Toyota A'),feature('b','Toyota B')]}):json({sources_to_targets:[[{distance:-1,time:-1},{distance:1000,time:90}]]}))(location);
    expect(result.centers.map(c=>c.id)).toEqual(['b','a']);
    expect(result.centers[1].durationMinutes).toBeNull();
  });
});
