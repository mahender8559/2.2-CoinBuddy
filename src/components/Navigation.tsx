import { LayoutDashboard, ReceiptText, CreditCard, LineChart, Settings, ShieldCheck } from 'lucide-react';
import { Tab } from '../types';

interface NavProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export function Navigation({ activeTab, setActiveTab }: NavProps) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'manage', label: 'Manage', icon: ShieldCheck },
    { id: 'activity', label: 'Activity', icon: ReceiptText },
    { id: 'insights', label: 'Insights', icon: LineChart },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <>
      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 w-full z-50 bg-surface-container-low border-t border-outline-variant/50 px-4 py-2 pb-safe flex justify-around items-center">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as Tab)}
            className={`flex flex-col items-center p-2 rounded-xl min-w-[64px] transition-colors ${
              activeTab === id 
                ? 'text-primary bg-secondary-container/30' 
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icon className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-semibold">{label}</span>
          </button>
        ))}
      </nav>

      {/* Desktop Side Nav */}
      <nav className="hidden md:flex fixed top-16 left-0 bottom-0 w-20 bg-surface-container-low border-r border-outline-variant/50 flex-col items-center py-8 gap-6 z-40">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as Tab)}
            title={label}
            className={`p-3 rounded-xl transition-colors ${
              activeTab === id 
                ? 'text-primary bg-secondary-container/30' 
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <Icon className="w-6 h-6" />
          </button>
        ))}
      </nav>
    </>
  );
}
