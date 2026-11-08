import { describe, it, expect } from 'vitest';
import { finance, canAnalyze } from './domain';
describe('financing estimates', () => {
  it('calculates amortized monthly payment and total interest', () => {
    const result = finance(36000, 5000, 6.9, 60)!;
    expect(result.monthly).toBeCloseTo(612.37, 1);
    expect(result.interest).toBeCloseTo(result.monthly * 60 - 31000, 2);
  });
  it('handles zero interest and fully paid purchases', () => {
    expect(finance(36000, 6000, 0, 60)).toEqual({ monthly: 500, interest: 0 });
    expect(finance(36000, 40000, 6.9, 60)).toEqual({ monthly: 0, interest: 0 });
  });
  it('rejects invalid and nonfinite values', () => {
    expect(finance(-1, 0, 6, 60)).toBeNull();
    expect(finance(NaN, 0, 6, 60)).toBeNull();
    expect(finance(30000, 0, 6, 0)).toBeNull();
  });
});
it('requires both exterior and dashboard photos before analysis', () => {
  expect(canAnalyze('', '')).toBe(false);
  expect(canAnalyze('exterior', '')).toBe(false);
  expect(canAnalyze('', 'dashboard')).toBe(false);
  expect(canAnalyze('exterior', 'dashboard')).toBe(true);
});
