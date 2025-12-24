import { NavLink } from 'react-router-dom';
import { 
  MessageSquare, 
  Calendar, 
  Users, 
  Sparkles, 
  ClipboardCheck,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const baseNavItems = [
  { path: '/', icon: MessageSquare, label: 'Feed' },
  { path: '/daily', icon: Calendar, label: 'Daily' },
  { path: '/traders', icon: Users, label: 'Traders' },
  { path: '/analysis', icon: Sparkles, label: 'Analysis' },
  { path: '/ic', icon: ClipboardCheck, label: 'IC' },
];

const adminNavItem = { path: '/admin', icon: Settings, label: 'Admin' };

export function MobileNav() {
  const { isAdmin } = useAuth();
  const navItems = isAdmin ? [...baseNavItems, adminNavItem] : baseNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border z-50 px-2 safe-area-pb">
      <div className="flex items-center justify-around h-full">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg min-w-[60px] transition-colors",
              isActive 
                ? "text-primary" 
                : "text-muted-foreground"
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
