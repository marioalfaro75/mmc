import { cn } from '@/lib/utils';

interface ProgressBarProps {
  value: number; // 0.0 to 1.0
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  showLabel?: boolean;
}

const variantClasses = {
  default: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export function ProgressBar({ value, className, variant = 'default', showLabel = false }: ProgressBarProps) {
  const percent = Math.min(Math.max(value * 100, 0), 100);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all duration-300', variantClasses[variant])}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {percent.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
