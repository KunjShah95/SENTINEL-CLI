import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  color?: string;
}

export function FeatureCard({ icon: Icon, title, description, color = 'sentinel' }: FeatureCardProps) {
  const getColorVar = (c: string) => {
    switch (c) {
      case 'critical': return 'var(--color-critical)';
      case 'warning': return 'var(--color-warning)';
      case 'info': return 'var(--color-info)';
      case 'scan': return 'var(--color-scan)';
      default: return 'var(--color-sentinel)';
    }
  };

  const colorVar = getColorVar(color);

  return (
    <div className="group relative p-8 rounded-2xl bg-[var(--color-obsidian)]/50 border border-[var(--color-carbon)] transition-all duration-300 hover:-translate-y-2 overflow-hidden"
      style={{ '--card-color': colorVar } as any}>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(circle at top right, ${colorVar}1A, transparent 70%)`
        }}
      />

      <div className="relative z-10">
        <div
          className="mb-6 p-4 rounded-xl bg-[var(--color-obsidian)] border border-[var(--color-carbon)] inline-block transition-all duration-300 group-hover:scale-110"
          style={{ borderColor: `color-mix(in srgb, ${colorVar} 30%, transparent)` }}
        >
          <Icon className="w-8 h-8 transition-colors duration-300" style={{ color: colorVar }} />
        </div>
        <h3 className="text-xl font-bold mb-3 text-[var(--color-text-primary)] transition-colors font-display"
          style={{
            // simple hover effect via style or just clean class
          }}>
          <span className="group-hover:text-[var(--card-color)] transition-colors duration-300">{title}</span>
        </h3>
        <p className="text-[var(--color-text-secondary)] leading-relaxed">{description}</p>
      </div>

      <div className="absolute bottom-0 left-0 w-full h-1 translate-y-full group-hover:translate-y-0 transition-transform duration-500"
        style={{ background: `linear-gradient(90deg, transparent, ${colorVar}, transparent)` }} />

      {/* Border hover effect */}
      <div className="absolute inset-0 border border-transparent group-hover:border-[var(--card-color)] opacity-30 rounded-2xl pointer-events-none transition-colors duration-300"></div>
    </div>
  );
}
