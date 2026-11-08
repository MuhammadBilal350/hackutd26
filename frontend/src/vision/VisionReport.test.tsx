// @vitest-environment jsdom
import { expect,it } from 'vitest';
import { render,screen } from '@testing-library/react';
import VisionReport from './VisionReport';
it('shows large visible damage without inventing a condition rating or structural verdict',()=>{
  render(<VisionReport go={()=>{}} report={{year:2019,miles:84210,capturedAt:'2026-11-08',errors:{dashboard:'Not analyzed'},exterior:{model:{checkpoint_present:true,rating_enabled:false},condition:{visible_condition_score:null,rating_enabled:false,rating_note:'Experimental model; ratings withheld.',coverage:{captured:['front'],missing:['rear','left','right'],complete:false},findings:[{label:'dent',confidence:.8,visual_extent:'large_visible_region',view:'front'}],limitations:'Dents and scratches only.'}}}}/>);
  expect(screen.getByText('Large visible dent region')).toBeTruthy();
  expect(screen.getByText('80% model confidence · front view')).toBeTruthy();
  expect(screen.getByText('Rating withheld')).toBeTruthy();
  expect(screen.getByText(/Visible extent is not structural severity/)).toBeTruthy();
});
