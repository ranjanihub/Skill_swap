import React from 'react';

interface ConnectionFiltersValue {
    status: string;
    skillCategory: string;
}

interface ConnectionFiltersProps {
    onFilterChange: (filters: ConnectionFiltersValue) => void;
}

const ConnectionFilters: React.FC<ConnectionFiltersProps> = ({ onFilterChange }) => {
    const [status, setStatus] = React.useState('');
    const [skillCategory, setSkillCategory] = React.useState('');

    const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newStatus = event.target.value;
        setStatus(newStatus);
        onFilterChange({ status: newStatus, skillCategory });
    };

    const handleSkillCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newSkillCategory = event.target.value;
        setSkillCategory(newSkillCategory);
        onFilterChange({ status, skillCategory: newSkillCategory });
    };

    return (
        <div className="connection-filters">
            <select value={status} onChange={handleStatusChange}>
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="inactive">Inactive</option>
            </select>
            <select value={skillCategory} onChange={handleSkillCategoryChange}>
                <option value="">All Skills</option>
                <option value="programming">Programming</option>
                <option value="design">Design</option>
                <option value="marketing">Marketing</option>
            </select>
        </div>
    );
};

export default ConnectionFilters;