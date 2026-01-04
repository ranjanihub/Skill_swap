import { Card } from '@/components/ui/card';

export default function MessagesPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-skillswap-dark">Messages</h1>
        <p className="text-skillswap-600">Chat and notifications.</p>
      </div>

      <Card className="p-6 bg-white border-2 border-skillswap-200">
        <p className="text-skillswap-600">
          Messaging is a placeholder for now.
        </p>
      </Card>
    </div>
  );
}
