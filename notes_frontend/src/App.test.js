import { render, screen } from '@testing-library/react';
import App from './App';

test('renders notes app title', () => {
  render(<App />);
  expect(screen.getAllByText(/notes/i).length).toBeGreaterThan(0);
});
