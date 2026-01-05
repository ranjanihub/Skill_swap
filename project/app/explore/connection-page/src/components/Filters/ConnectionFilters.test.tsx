import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConnectionFilters from './ConnectionFilters';

describe('ConnectionFilters', () => {
  const mockOnFilterChange = jest.fn();

  beforeEach(() => {
    render(<ConnectionFilters onFilterChange={mockOnFilterChange} />);
  });

  it('renders filter options', () => {
    expect(screen.getByLabelText(/learning\/teaching status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/connection status/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/skill category/i)).toBeInTheDocument();
  });

  it('calls onFilterChange when a filter is changed', () => {
    const statusSelect = screen.getByLabelText(/connection status/i);
    fireEvent.change(statusSelect, { target: { value: 'active' } });
    expect(mockOnFilterChange).toHaveBeenCalledWith({ status: 'active' });
  });

  it('displays the correct number of filter options', () => {
    const statusSelect = screen.getByLabelText(/connection status/i);
    expect(statusSelect.children.length).toBeGreaterThan(0);
  });
});