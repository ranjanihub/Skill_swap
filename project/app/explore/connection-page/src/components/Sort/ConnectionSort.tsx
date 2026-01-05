import React from 'react';

const ConnectionSort: React.FC<{ onSortChange: (sortType: string) => void }> = ({ onSortChange }) => {
    const handleSortChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        onSortChange(event.target.value);
    };

    return (
        <div className="connection-sort">
            <label htmlFor="sort-options">Sort by:</label>
            <select id="sort-options" onChange={handleSortChange}>
                <option value="recent">Recent Activity</option>
                <option value="upcoming">Upcoming Sessions</option>
                <option value="alphabetical">Alphabetically</option>
            </select>
        </div>
    );
};

export default ConnectionSort;