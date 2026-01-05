import React from 'react';
import { render, screen } from '@testing-library/react';
import ConnectionList from './ConnectionList';

describe('ConnectionList', () => {
  const mockConnections = [
    {
      id: '1',
      name: 'John Doe',
      profilePhotoUrl: 'john_doe.jpg',
      connectionType: 'Mentor',
      status: 'Active',
    },
    {
      id: '2',
      name: 'Jane Smith',
      profilePhotoUrl: 'jane_smith.jpg',
      connectionType: 'Mentee',
      status: 'Pending',
    },
  ];

  test('renders connection list correctly', () => {
    render(<ConnectionList connections={mockConnections} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  test('displays correct status for each connection', () => {
    render(<ConnectionList connections={mockConnections} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  test('renders empty state when no connections are provided', () => {
    render(<ConnectionList connections={[]} />);

    expect(screen.getByText('No connections available')).toBeInTheDocument();
  });
});