// @vitest-environment jsdom
import { afterEach,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import App from '../App';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('uses uploaded photo results in the report and synchronizes the home score',async()=>{
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:()=> 'blob:test-photo'});
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:()=>{}});
  vi.stubGlobal('fetch',async(url:string)=>new Response(JSON.stringify(String(url).includes('dashboard')?{reading:{lights:[{id:'check_engine',name:'Check engine',color:'amber',confidence:'high'}],likely_bulb_check:false},reliability:{score:62,grade:'D',drive_safe:'cautious',faults:['check_engine'],actions:['Arrange a vehicle check.'],odometer_miles:90000},limitations:'Experimental visual estimate'}:{error:'Exterior checkpoint is not available'}),{status:String(url).includes('dashboard')?200:503}));
  render(<App/>);fireEvent.click(screen.getByRole('button',{name:'Start inspection'}));
  const photo=new File(['jpeg'],'photo.jpg',{type:'image/jpeg'});
  fireEvent.change(screen.getByLabelText('Add exterior photo'),{target:{files:[photo]}});
  fireEvent.change(screen.getByLabelText('Add dashboard photo'),{target:{files:[photo]}});
  fireEvent.change(screen.getByLabelText('Mileage (mi)'),{target:{value:'90000'}});
  fireEvent.click(screen.getByRole('button',{name:'Analyze'}));
  expect(await screen.findByText('6.2')).toBeTruthy();
  expect(screen.getByText('Check engine')).toBeTruthy();
  expect(screen.getByText('Exterior checkpoint is not available')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Home'}));
  expect(screen.getByText('6.2')).toBeTruthy();
  expect(screen.getByText('Latest photo scan')).toBeTruthy();
});
it('does not claim zero dashboard lights when only exterior analysis succeeds',async()=>{
  Object.defineProperty(URL,'createObjectURL',{configurable:true,value:()=> 'blob:test-photo'});
  Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:()=>{}});
  vi.stubGlobal('fetch',async(url:string)=>new Response(JSON.stringify(String(url).includes('dashboard')?{error:'Dashboard photo could not be read'}:{condition:{visible_condition_score:null,coverage:{captured:['front'],missing:['rear','left','right'],complete:false},findings:[],rating_enabled:false,rating_note:'Rating withheld by model gate.',limitations:'Experimental'},model:{checkpoint_present:true,rating_enabled:false}}),{status:String(url).includes('dashboard')?400:200}));
  render(<App/>);fireEvent.click(screen.getByRole('button',{name:'Start inspection'}));
  const photo=new File(['jpeg'],'photo.jpg',{type:'image/jpeg'});
  fireEvent.change(screen.getByLabelText('Add exterior photo'),{target:{files:[photo]}});
  fireEvent.change(screen.getByLabelText('Add dashboard photo'),{target:{files:[photo]}});
  fireEvent.click(screen.getByRole('button',{name:'Analyze'}));
  expect(await screen.findByText('Rating withheld')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Home'}));
  expect(screen.getByText('Dashboard analysis unavailable')).toBeTruthy();
  expect(screen.queryByText('0 matches in your latest photo')).toBeNull();
});
