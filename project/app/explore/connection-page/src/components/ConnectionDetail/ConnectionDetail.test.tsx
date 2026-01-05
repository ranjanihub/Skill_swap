import React from 'react';
import { render, screen } from '@testing-library/react';
import ConnectionDetail from './ConnectionDetail';

describe('ConnectionDetail', () => {
    const mockConnection = {
        id: '1',
        name: 'John Doe',
        profilePhoto: 'http://example.com/photo.jpg',
        skillsExchanged: ['JavaScript', 'React'],
        sessionHistory: [
            { date: '2023-01-01', topic: 'Intro to React' },
            { date: '2023-01-15', topic: 'Advanced JavaScript' },
        ],
        chatHistory: [
            { date: '2023-01-02', message: 'Looking forward to our session!' },
            { date: '2023-01-10', message: 'Can we reschedule?' },
        ],
    };

    test('renders connection details correctly', () => {
        render(<ConnectionDetail connection={mockConnection} />);

        expect(screen.getByText(mockConnection.name)).toBeInTheDocument();
        expect(screen.getByAltText('Profile photo')).toHaveAttribute('src', mockConnection.profilePhoto);
        expect(screen.getByText('Skills Exchanged:')).toBeInTheDocument();
        expect(screen.getByText(mockConnection.skillsExchanged[0])).toBeInTheDocument();
        expect(screen.getByText(mockConnection.skillsExchanged[1])).toBeInTheDocument();
        expect(screen.getByText('Session History:')).toBeInTheDocument();
        expect(screen.getByText(mockConnection.sessionHistory[0].topic)).toBeInTheDocument();
        expect(screen.getByText(mockConnection.sessionHistory[1].topic)).toBeInTheDocument();
        expect(screen.getByText('Chat History:')).toBeInTheDocument();
        expect(screen.getByText(mockConnection.chatHistory[0].message)).toBeInTheDocument();
        expect(screen.getByText(mockConnection.chatHistory[1].message)).toBeInTheDocument();
    });

    test('displays empty state when no connection is provided', () => {
        render(<ConnectionDetail connection={null} />);

        expect(screen.getByText('No connection details available')).toBeInTheDocument();
    });
});