import { useEffect, useState } from 'react';
import { fetchConnections } from '../services/connectionsApi';
import { Connection } from '../types/connections';

const useConnections = () => {
    const [connections, setConnections] = useState<Connection[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadConnections = async () => {
            try {
                const data = await fetchConnections();
                setConnections(data);
            } catch (err) {
                setError('Failed to load connections');
            } finally {
                setLoading(false);
            }
        };

        loadConnections();
    }, []);

    const updateConnectionStatus = (id: string, status: string) => {
        setConnections(prevConnections =>
            prevConnections.map(connection =>
                connection.id === id ? { ...connection, status } : connection
            )
        );
    };

    return { connections, loading, error, updateConnectionStatus };
};

export default useConnections;