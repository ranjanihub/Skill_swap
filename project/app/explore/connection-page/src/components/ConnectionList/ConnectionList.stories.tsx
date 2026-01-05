import React from 'react';
import { ConnectionList } from './ConnectionList';

export default {
  title: 'Components/ConnectionList',
  component: ConnectionList,
};

const connections = [
  {
    id: '1',
    name: 'John Doe',
    profilePhotoUrl: 'https://via.placeholder.com/150',
    connectionType: 'Friend',
    status: 'Active',
  },
  {
    id: '2',
    name: 'Jane Smith',
    profilePhotoUrl: 'https://via.placeholder.com/150',
    connectionType: 'Colleague',
    status: 'Pending',
  },
];

const Template = (args) => <ConnectionList {...args} />;

export const Default = Template.bind({});
Default.args = {
  connections: connections,
};

export const EmptyState = Template.bind({});
EmptyState.args = {
  connections: [],
};