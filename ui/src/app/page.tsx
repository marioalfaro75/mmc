import { StatsCards } from '@/components/dashboard/StatsCards';
import { ActiveDownloads } from '@/components/dashboard/ActiveDownloads';
import { UpcomingReleases } from '@/components/dashboard/UpcomingReleases';
import { SystemHealth } from '@/components/dashboard/SystemHealth';
import { DownloadStats } from '@/components/dashboard/DownloadStats';
import { PendingRequests } from '@/components/dashboard/PendingRequests';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <StatsCards />
      <div className="grid gap-6 lg:grid-cols-2">
        <ActiveDownloads />
        <UpcomingReleases />
        <SystemHealth />
        <DownloadStats />
        <PendingRequests />
      </div>
    </div>
  );
}
