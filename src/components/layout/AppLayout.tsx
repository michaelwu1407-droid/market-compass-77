import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNav } from './MobileNav';
import { useIsMobile } from '@/hooks/use-mobile';

export function AppLayout() {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      
      <div className="flex">
        {!isMobile && (
          <Sidebar 
            collapsed={sidebarCollapsed} 
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
          />
        )}
        
        <main className={`flex-1 min-h-[calc(100vh-64px)] transition-all duration-300 ${
          isMobile ? 'pb-20' : sidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}>
          <div className="p-4 md:p-6 animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
      
      {isMobile && <MobileNav />}
    </div>
  );
}
