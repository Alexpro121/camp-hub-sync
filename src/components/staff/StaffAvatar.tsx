import { initials } from '@/lib/staffApi';
import { cn } from '@/lib/utils';

const StaffAvatar = ({ name, src, size = 44, className }: { name: string; src?: string | null; size?: number; className?: string }) => (
  <div
    className={cn('shrink-0 rounded-full overflow-hidden bg-primary/15 text-primary font-bold grid place-items-center ring-1 ring-border', className)}
    style={{ width: size, height: size, fontSize: size * 0.36 }}
  >
    {src ? <img src={src} alt={name} className="w-full h-full object-cover" loading="lazy" /> : initials(name) || '?'}
  </div>
);

export default StaffAvatar;
