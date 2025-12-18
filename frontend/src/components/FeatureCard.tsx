import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  iconColor?: string;
}

export function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="group relative p-8 rounded-2xl bg-gray-900/50 border border-gray-800 hover:border-emerald-500/50 transition-all duration-300 hover:-translate-y-2 overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative z-10">
        <div 
          className="mb-6 p-4 rounded-xl bg-gray-900 border border-gray-800 inline-block group-hover:scale-110 group-hover:border-emerald-500/30 transition-all duration-300 text-emerald-500"
        >
          <Icon className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold mb-3 text-white group-hover:text-emerald-400 transition-colors">{title}</h3>
        <p className="text-gray-400 leading-relaxed">{description}</p>
      </div>

      <div className="absolute bottom-0 left-0 w-full h-1 bg-linear-to-r from-transparent via-emerald-500/20 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
    </div>
  );
}
