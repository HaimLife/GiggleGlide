import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../App';

describe('App Setup', () => {
  it('renders without crashing', () => {
    const { getByText } = render(<App />);
    expect(getByText('Home Screen')).toBeTruthy();
  });
});