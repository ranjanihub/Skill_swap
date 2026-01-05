import React from 'react';

const QuickActions: React.FC = () => {
    const handleMessage = () => {
        // Logic for messaging the connection
    };

    const handleViewProfile = () => {
        // Logic for viewing the connection's profile
    };

    const handleReschedule = () => {
        // Logic for rescheduling a session
    };

    return (
        <div className="quick-actions">
            <button onClick={handleMessage}>Message</button>
            <button onClick={handleViewProfile}>View Profile</button>
            <button onClick={handleReschedule}>Reschedule Session</button>
        </div>
    );
};

export default QuickActions;