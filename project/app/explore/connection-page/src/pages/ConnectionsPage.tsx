import React from 'react';
import ConnectionList from '../components/ConnectionList/ConnectionList';
import ConnectionFilters from '../components/Filters/ConnectionFilters';
import ConnectionSort from '../components/Sort/ConnectionSort';
import QuickActions from '../components/QuickActions/QuickActions';
import EmptyState from '../components/EmptyState/EmptyState';
import useConnections from '../hooks/useConnections';
import styles from '../styles/connections.module.css';

const ConnectionsPage: React.FC = () => {
    const { connections, loading, error } = useConnections();

    const [filters, setFilters] = React.useState({ status: '', skillCategory: '' });
    const [sortOption, setSortOption] = React.useState('');

    const filteredConnections = connections.filter((connection) => {
        if (filters.status && connection.status !== filters.status) return false;
        return true;
    });

    const sortedConnections = [...filteredConnections].sort((a, b) => {
        if (sortOption === 'alphabetical') return a.name.localeCompare(b.name);
        return 0;
    });

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error loading connections.</div>;
    }

    if (connections.length === 0) {
        return <EmptyState />;
    }

    return (
        <div className={styles.connectionsPage}>
            <ConnectionFilters onFilterChange={setFilters} />
            <ConnectionSort onSortChange={setSortOption} />
            <ConnectionList connections={sortedConnections} />
            <QuickActions />
        </div>
    );
};

export default ConnectionsPage;