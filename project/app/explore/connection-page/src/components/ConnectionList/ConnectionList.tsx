import React from 'react';
import ConnectionItem from '../ConnectionItem/ConnectionItem';
import { Connection } from '../../types/connections';
import styles from '../../styles/connections.module.css';

interface ConnectionListProps {
  connections: Connection[];
}

const ConnectionList: React.FC<ConnectionListProps> = ({ connections }) => {
  return (
    <div className={styles.connectionList}>
      {connections.length > 0 ? (
        connections.map((connection) => (
          <ConnectionItem key={connection.id} connection={connection} />
        ))
      ) : (
        <div className={styles.emptyState}>
          No connections available.
        </div>
      )}
    </div>
  );
};

export default ConnectionList;