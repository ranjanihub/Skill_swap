import React from 'react';

const EmptyState: React.FC = () => {
    return (
        <div className="empty-state">
            <h2>No Connections Available</h2>
            <p>You currently have no active or pending connections. Start connecting with others to build your network!</p>
            <button onClick={() => {/* Add action to navigate to connection creation or suggestions */}}>
                Find Connections
            </button>
        </div>
    );
};

export default EmptyState;