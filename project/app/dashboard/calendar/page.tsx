import { Card } from '@/components/ui/card';

export default function CalendarPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-skillswap-dark">Calendar</h1>
        <p className="text-skillswap-600">Your upcoming and past sessions.</p>
      </div>

      <Card className="p-6 bg-white border-2 border-skillswap-200">
        <p className="text-skillswap-600">
          Calendar view is a placeholder for now.
        </p>
      </Card>
    </div>
  );
}
