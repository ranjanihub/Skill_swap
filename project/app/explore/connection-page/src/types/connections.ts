export interface Connection {
    id: string;
    name: string;
    profilePhotoUrl?: string;
    profilePhoto?: string;
    connectionType?: string;
    type?: string;
    status?: string;
    skillsExchanged?: string[];
    lastActive?: Date;
    sessionHistory?: {
        id?: string;
        date: string;
        topic: string;
    }[];
    chatHistory?: {
        id?: string;
        date: string;
        message: string;
    }[];
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