import { cn } from '@/lib/utils';

interface RiskGaugeProps {
  score: number; // 1-10
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function RiskGauge({ score, size = 'md', showLabel = true }: RiskGaugeProps) {
  const clampedScore = Math.max(1, Math.min(10, score));
  const percentage = (clampedScore / 10) * 100;
  
  // Calculate rotation angle (0 to 180 degrees)
  const rotation = (clampedScore / 10) * 180 - 90;

  const getColor = (score: number) => {
    if (score <= 3) return 'text-gain';
    if (score <= 6) return 'text-amber-500';
    return 'text-loss';
  };

  const getLabel = (score: number) => {
    if (score <= 3) return 'Low Risk';
    if (score <= 6) return 'Medium Risk';
    return 'High Risk';
  };

  const sizeClasses = {
    sm: 'w-24 h-12',
    md: 'w-32 h-16',
    lg: 'w-40 h-20',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  return (
    <div className="flex flex-col items-center">
      <div className={cn("relative", sizeClasses[size])}>
        {/* Background arc */}
        <svg viewBox="0 0 100 50" className="w-full h-full">
          <defs>
            <linearGradient id="riskGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(var(--gain))" />
              <stop offset="50%" stopColor="hsl(45 100% 50%)" />
              <stop offset="100%" stopColor="hsl(var(--loss))" />
            </linearGradient>
          </defs>
          
          {/* Background track */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="8"
            strokeLinecap="round"
          />
          
          {/* Filled arc */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="url(#riskGradient)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${percentage * 1.26} 126`}
          />
          
          {/* Needle */}
          <line
            x1="50"
            y1="50"
            x2="50"
            y2="18"
            stroke="hsl(var(--foreground))"
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${rotation}, 50, 50)`}
          />
          
          {/* Center dot */}
          <circle cx="50" cy="50" r="4" fill="hsl(var(--foreground))" />
        </svg>

        {/* Score display */}
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1">
          <span className={cn("font-bold", textSizes[size], getColor(clampedScore))}>
            {clampedScore}
          </span>
        </div>
      </div>

      {showLabel && (
        <span className={cn("text-xs mt-1", getColor(clampedScore))}>
          {getLabel(clampedScore)}
        </span>
      )}
    </div>
  );
}
