export interface Connection {
    id: string;
    name: string;
    profilePhotoUrl: string;
    connectionType: 'pending' | 'active';
    status: 'requested' | 'accepted' | 'declined' | 'blocked';
    skillsExchanged: string[];
    lastActive: Date;
}

export interface ConnectionListProps {
    connections: Connection[];
    onConnectionAction: (id: string, action: 'message' | 'viewProfile' | 'reschedule') => void;
}

export interface ConnectionDetailProps {
    connection: Connection;
}

export interface ConnectionFilters {
    status: 'all' | 'active' | 'pending';
    skillCategory: string;
}

export interface ConnectionSortOptions {
    sortBy: 'recentActivity' | 'upcomingSessions' | 'alphabetical';
}