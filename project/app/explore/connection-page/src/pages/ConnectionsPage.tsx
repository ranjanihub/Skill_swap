import React from 'react';
import ConnectionList from '../components/ConnectionList/ConnectionList';
import ConnectionFilters from '../components/Filters/ConnectionFilters';
import ConnectionSort from '../components/Sort/ConnectionSort';
import QuickActions from '../components/QuickActions/QuickActions';
import EmptyState from '../components/EmptyState/EmptyState';
import { useConnections } from '../hooks/useConnections';
import styles from '../styles/connections.module.css';

const ConnectionsPage: React.FC = () => {
    const {
        connections,
        loading,
        error,
        filters,
        setFilters,
        sortOption,
        setSortOption,
    } = useConnections();

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
            <ConnectionFilters filters={filters} setFilters={setFilters} />
            <ConnectionSort sortOption={sortOption} setSortOption={setSortOption} />
            <ConnectionList connections={connections} />
            <QuickActions />
        </div>
    );
};

export default ConnectionsPage;