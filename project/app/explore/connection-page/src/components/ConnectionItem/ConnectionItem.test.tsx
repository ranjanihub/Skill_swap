import React from 'react';
import { render, screen } from '@testing-library/react';
import ConnectionItem from './ConnectionItem';

describe('ConnectionItem', () => {
  const mockConnection = {
    id: '1',
    name: 'John Doe',
    profilePhoto: 'http://example.com/photo.jpg',
    connectionType: 'Friend',
    status: 'Active',
  };

  test('renders connection item with correct details', () => {
    render(<ConnectionItem connection={mockConnection} />);

    expect(screen.getByText(mockConnection.name)).toBeInTheDocument();
    expect(screen.getByText(mockConnection.connectionType)).toBeInTheDocument();
    expect(screen.getByText(mockConnection.status)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /profile photo/i })).toHaveAttribute('src', mockConnection.profilePhoto);
  });

  test('renders quick action buttons', () => {
    render(<ConnectionItem connection={mockConnection} />);

    expect(screen.getByRole('button', { name: /message/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view profile/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reschedule/i })).toBeInTheDocument();
  });
});