import { Connection } from '../types/connections';

const API_BASE_URL = 'https://api.example.com/connections'; // Replace with your actual API base URL

export const fetchConnections = async (): Promise<Connection[]> => {
    const response = await fetch(API_BASE_URL);
    if (!response.ok) throw new Error('Failed to fetch connections');
    return (await response.json()) as Connection[];
};

export const updateConnectionStatus = async (connectionId: string, status: string): Promise<Connection> => {
    const response = await fetch(`${API_BASE_URL}/${connectionId}`,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        }
    );
    if (!response.ok) throw new Error('Failed to update connection');
    return (await response.json()) as Connection;
};

export const deleteConnection = async (connectionId: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/${connectionId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete connection');
};

export const createConnection = async (connectionData: Omit<Connection, 'id'>): Promise<Connection> => {
    const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectionData),
    });
    if (!response.ok) throw new Error('Failed to create connection');
    return (await response.json()) as Connection;
};