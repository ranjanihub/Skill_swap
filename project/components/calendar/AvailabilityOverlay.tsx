import React from 'react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

export default function AvailabilityOverlay() {
  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Weekly availability</p>
            <p className="text-sm text-skillswap-600">Toggle days and set times</p>
          </div>
          <Switch />
        </div>
      </Card>

      <Card className="p-3">
        <p className="text-sm text-skillswap-600">Buffer between sessions: 15 minutes</p>
      </Card>
    </div>
  );
}
