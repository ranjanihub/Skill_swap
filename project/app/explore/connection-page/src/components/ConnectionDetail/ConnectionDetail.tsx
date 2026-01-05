import React from 'react';
import { Connection } from '../../types/connections';
import styles from '../../styles/connections.module.css';

interface ConnectionDetailProps {
    connection: Connection;
}

const ConnectionDetail: React.FC<ConnectionDetailProps> = ({ connection }) => {
    return (
        <div className={styles.connectionDetail}>
            <h2>{connection.name}</h2>
            <div className={styles.profilePreview}>
                <img src={connection.profilePhotoUrl} alt={`${connection.name}'s profile`} />
                <p>Status: {connection.status}</p>
            </div>
            <div className={styles.skillsExchanged}>
                <h3>Skills Exchanged</h3>
                <ul>
                    {connection.skillsExchanged.map(skill => (
                        <li key={skill}>{skill}</li>
                    ))}
                </ul>
            </div>
            <div className={styles.sessionHistory}>
                <h3>Session History</h3>
                <ul>
                    {connection.sessionHistory.map(session => (
                        <li key={session.id}>{session.date} - {session.topic}</li>
                    ))}
                </ul>
            </div>
            <div className={styles.chatHistory}>
                <h3>Chat History</h3>
                <ul>
                    {connection.chatHistory.map(chat => (
                        <li key={chat.id}>{chat.message} - {chat.date}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default ConnectionDetail;