import { Badge } from '@/components/common/Badge';

interface QualityBadgeProps {
  quality?: string;
  hasFile: boolean;
}

export function QualityBadge({ quality, hasFile }: QualityBadgeProps) {
  if (!hasFile) {
    return <Badge variant="outline">Missing</Badge>;
  }
  return <Badge variant="success">{quality || 'Available'}</Badge>;
}
