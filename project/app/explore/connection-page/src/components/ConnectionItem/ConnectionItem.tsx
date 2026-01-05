import React from 'react';
import { Connection } from '../../types/connections';
import QuickActions from '../QuickActions/QuickActions';
import styles from '../../styles/connections.module.css';

interface ConnectionItemProps {
  connection: Connection;
  onAction: (action: string) => void;
}

const ConnectionItem: React.FC<ConnectionItemProps> = ({ connection, onAction }) => {
  return (
    <div className={styles.connectionItem}>
      <img src={connection.profilePhoto} alt={`${connection.name}'s profile`} className={styles.profilePhoto} />
      <div className={styles.connectionDetails}>
        <h3 className={styles.connectionName}>{connection.name}</h3>
        <span className={styles.connectionType}>{connection.type}</span>
        <span className={styles.connectionStatus}>{connection.status}</span>
      </div>
      <QuickActions connectionId={connection.id} onAction={onAction} />
    </div>
  );
};

export default ConnectionItem;