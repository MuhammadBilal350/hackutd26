// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import Assistant from './Assistant';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('opens only one microphone while permission is pending and cleans up on unmount',async()=>{
  let resolvePermission!:(media:MediaStream)=>void;
  const getUserMedia=vi.fn(()=>new Promise<MediaStream>(resolve=>{resolvePermission=resolve;}));
  const stop=vi.fn();vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}});vi.stubGlobal('MediaRecorder',vi.fn());
  const view=render(<Assistant/>);const button=screen.getByRole('button',{name:'Use microphone'});
  fireEvent.click(button);fireEvent.click(button);expect(getUserMedia).toHaveBeenCalledTimes(1);
  view.unmount();await act(async()=>resolvePermission({getTracks:()=>[{stop}]} as unknown as MediaStream));
  expect(stop).toHaveBeenCalledTimes(1);
});
it('releases the microphone if recorder creation fails',async()=>{
  const stop=vi.fn();vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop}]})}});
  vi.stubGlobal('MediaRecorder',class {constructor(){throw new Error('unsupported');}});
  render(<Assistant/>);fireEvent.click(screen.getByRole('button',{name:'Use microphone'}));
  await waitFor(()=>expect(stop).toHaveBeenCalledTimes(1));
});
it('sends the latest inspection context and displays a real API answer',async()=>{
  let sent:Record<string,unknown>|undefined;
  vi.stubGlobal('fetch',async(_url:string,options:RequestInit)=>{sent=JSON.parse(String(options.body));return new Response(JSON.stringify({answer:'Your oil pressure warning needs attention.'}),{status:200});});
  render(<Assistant inspection={{year:2019,miles:84210,capturedAt:'2026-11-08',errors:{exterior:'Checkpoint unavailable'}}}/>);
  fireEvent.change(screen.getByLabelText('Your question'),{target:{value:'Explain my warning lights'}});
  fireEvent.click(screen.getByRole('button',{name:'Send question'}));
  expect(await screen.findByText('Your oil pressure warning needs attention.')).toBeTruthy();
  expect(sent).toMatchObject({message:'Explain my warning lights',history:[],inspectionResults:{errors:{exterior:'Checkpoint unavailable'}}});
});
it('displays provider authentication failure without fabricating an answer',async()=>{
  vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({error:'AI provider request failed (HTTP 401).'}),{status:502}));
  render(<Assistant/>);fireEvent.change(screen.getByLabelText('Your question'),{target:{value:'Check my car'}});fireEvent.click(screen.getByRole('button',{name:'Send question'}));
  expect(await screen.findByText('AI provider request failed (HTTP 401).')).toBeTruthy();
  expect(screen.queryByText('Your oil pressure warning needs attention.')).toBeNull();
});
