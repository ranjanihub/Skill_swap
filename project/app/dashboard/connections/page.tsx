import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ConnectionsPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-skillswap-dark">Connections</h1>
        <p className="text-skillswap-600">Find and connect with other SkillSwap members.</p>
      </div>

      <Card className="p-6 bg-white border-2 border-skillswap-200">
        <p className="text-skillswap-600 mb-4">
          This page is a placeholder for the Figma navigation structure.
        </p>
        <Button className="bg-skillswap-500 text-white hover:bg-skillswap-600" asChild>
          <Link href="/explore">Explore skills</Link>
        </Button>
      </Card>
    </div>
  );
}
