import axios from 'axios';
import { Connection } from '../types/connections';

const API_BASE_URL = 'https://api.example.com/connections'; // Replace with your actual API base URL

export const fetchConnections = async (): Promise<Connection[]> => {
    const response = await axios.get<Connection[]>(API_BASE_URL);
    return response.data;
};

export const updateConnectionStatus = async (connectionId: string, status: string): Promise<Connection> => {
    const response = await axios.patch<Connection>(`${API_BASE_URL}/${connectionId}`, { status });
    return response.data;
};

export const deleteConnection = async (connectionId: string): Promise<void> => {
    await axios.delete(`${API_BASE_URL}/${connectionId}`);
};

export const createConnection = async (connectionData: Omit<Connection, 'id'>): Promise<Connection> => {
    const response = await axios.post<Connection>(API_BASE_URL, connectionData);
    return response.data;
};