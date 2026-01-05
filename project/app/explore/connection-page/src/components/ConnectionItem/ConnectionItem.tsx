import React from 'react';
import { Connection } from '../../types/connections';
import QuickActions from '../QuickActions/QuickActions';
import styles from '../../styles/connections.module.css';

interface ConnectionItemProps {
  connection: Connection;
}

const ConnectionItem: React.FC<ConnectionItemProps> = ({ connection }) => {
  const photoSrc = connection.profilePhotoUrl || connection.profilePhoto || '';
  const connectionTypeLabel = connection.connectionType || connection.type || '';

  return (
    <div className={styles.connectionItem}>
      <img src={photoSrc} alt={`${connection.name}'s profile`} className={styles.profilePhoto} />
      <div className={styles.connectionDetails}>
        <h3 className={styles.connectionName}>{connection.name}</h3>
        <span className={styles.connectionType}>{connectionTypeLabel}</span>
        <span className={styles.connectionStatus}>{connection.status || ''}</span>
      </div>
      <QuickActions />
    </div>
  );
};

export default ConnectionItem;