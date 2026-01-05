export const formatDate = (dateString: string): string => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
};

export const formatConnectionStatus = (status: string): string => {
    switch (status) {
        case 'active':
            return 'Active Connection';
        case 'pending':
            return 'Pending Connection';
        case 'blocked':
            return 'Blocked Connection';
        default:
            return 'Unknown Status';
    }
};

export const formatSkillList = (skills: string[]): string => {
    return skills.join(', ');
};