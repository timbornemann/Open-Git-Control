import React from 'react';
import { SidebarActivityBar } from './sidebar/SidebarActivityBar';
import { useUIContext } from '../../contexts/AppStateContext';
import { SidebarContentRouter, SidebarHeaderContainer } from './sidebar/AppSidebarPanels';

export const AppSidebar: React.FC = () => {
  const { activeTab, setActiveTab, isSidebarCollapsed, onToggleSidebar } = useUIContext();

  return (
    <>
      <SidebarActivityBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={onToggleSidebar}
      />

      {!isSidebarCollapsed && (
        <div className="sidebar">
          <SidebarHeaderContainer />
          <SidebarContentRouter />
        </div>
      )}
    </>
  );
};
