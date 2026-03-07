'use client';

import { Card, CardHeader, CardTitle } from '@/components/common/Card';
import { BarChart3 } from 'lucide-react';

export function DownloadStats() {
  // Placeholder — Recharts integration for download history chart
  // Data would come from Sonarr/Radarr history APIs
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Download Stats
          </div>
        </CardTitle>
      </CardHeader>
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Download history chart — data loads after services are configured
      </div>
    </Card>
  );
}
