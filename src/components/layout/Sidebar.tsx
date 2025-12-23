import { NavLink } from 'react-router-dom';
import { 
  MessageSquare, 
  Calendar, 
  Users, 
  Sparkles, 
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useIsAdmin } from '@/hooks/useIsAdmin';

const navItems = [
  { path: '/', icon: MessageSquare, label: 'Feed' },
  { path: '/daily', icon: Calendar, label: 'Daily' },
  { path: '/traders', icon: Users, label: 'Copy Traders' },
  { path: '/analysis', icon: Sparkles, label: 'Analysis' },
  { path: '/ic', icon: ClipboardCheck, label: 'IC' },
  { path: '/discrepancies', icon: AlertTriangle, label: 'Discrepancies' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { isAdmin } = useIsAdmin();

  return (
    <aside className={cn(
      "fixed left-0 top-16 h-[calc(100vh-64px)] bg-card border-r border-border transition-all duration-300 z-40",
      collapsed ? "w-16" : "w-64"
    )}>
      <div className="flex flex-col h-full">
        {/* Toggle button */}
        <div className="p-2 flex justify-end">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onToggle}
            className="h-8 w-8"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive 
                  ? "bg-primary text-primary-foreground" 
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                collapsed && "justify-center px-2"
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}

          {/* Admin link - only visible to admins */}
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive 
                  ? "bg-primary text-primary-foreground" 
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                collapsed && "justify-center px-2"
              )}
            >
              <Settings className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>Admin Sync</span>}
            </NavLink>
          )}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="p-4 border-t border-border">
            <div className="text-xs text-muted-foreground">
              <p>InvestResearch v1.0</p>
              <p className="mt-1">Powered by AI</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
