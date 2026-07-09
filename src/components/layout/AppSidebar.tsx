import React from 'react';
import { SidebarActivityBar } from './sidebar/SidebarActivityBar';
import { useUIStore } from '@/contexts/AppStateContext';
import { SidebarContentRouter, SidebarHeaderContainer } from './sidebar/AppSidebarPanels';

const AppSidebarComponent: React.FC = () => {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const isSidebarCollapsed = useUIStore((state) => state.isSidebarCollapsed);
  const onToggleSidebar = useUIStore((state) => state.onToggleSidebar);

  return (
    <>
      <SidebarActivityBar activeTab={activeTab} setActiveTab={setActiveTab} isSidebarCollapsed={isSidebarCollapsed} onToggleSidebar={onToggleSidebar} />

      {!isSidebarCollapsed && (
        <div className="sidebar">
          <SidebarHeaderContainer />
          <SidebarContentRouter />
        </div>
      )}
    </>
  );
};

export const AppSidebar = React.memo(AppSidebarComponent);
