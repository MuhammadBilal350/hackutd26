// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
afterEach(cleanup);
it('navigates from home to inspection and gates analysis until both photos exist', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', {name: 'Start inspection'}));
  expect(screen.getByText('Two photos, then we score your car.')).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Analyze'}).getAttribute('aria-disabled')).toBe('true');
});
it('offers appointment confirmation only after selecting a service date', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', {name: 'Service'}));
  fireEvent.click(screen.getByRole('button', {name: 'Tue 10'}));
  fireEvent.click(screen.getByRole('button', {name: 'Book for 9:00 AM'}));
  expect(screen.getByText(/Tue, Nov 10 at 9:00 AM/)).toBeTruthy();
});
it('switches themes and exposes the forecast and dealer flow', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', {name: 'Dark theme'}));
  expect(document.documentElement.dataset.theme).toBe('dark');
  fireEvent.click(screen.getByRole('button', {name: 'Forecast'}));
  expect(screen.getByText('Keep it for now')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name: 'Shop'}));
  fireEvent.click(screen.getByRole('button', {name: 'Compare dealer prices'}));
  expect(screen.getByText('Lakeview Toyota')).toBeTruthy();
});
