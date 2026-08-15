import { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { V35AccountsPanel } from './V35AccountsPanel';
import { V35CategoriesPanel } from './V35CategoriesPanel';
import { V35GoalsPanel } from './V35GoalsPanel';
import { SharingPanel } from './SharingPanel';
import { V35SupportingForms } from './V35SupportingForms';

type ManageDestination = 'Accounts' | 'Categories' | 'Sharing' | 'Goals';

function requestedManageDestination(): ManageDestination {
  if (typeof window === 'undefined') return 'Accounts';
  const requested = sessionStorage.getItem('coinbuddy_manage_destination') as ManageDestination | null;
  return requested === 'Categories' || requested === 'Sharing' || requested === 'Goals' ? requested : 'Accounts';
}

export function ManageFinances() {
  const { isManageCategoriesOpen, setManageCategoriesOpen } = useAppContext();
  const [destination, setDestination] = useState<ManageDestination>(requestedManageDestination);

  useEffect(() => {
    if (!isManageCategoriesOpen) return;
    setDestination('Categories');
    setManageCategoriesOpen(false);
  }, [isManageCategoriesOpen, setManageCategoriesOpen]);

  useEffect(() => {
    const requested = sessionStorage.getItem('coinbuddy_manage_destination') as ManageDestination | null;
    if (requested === 'Accounts' || requested === 'Categories' || requested === 'Sharing' || requested === 'Goals') setDestination(requested);
    sessionStorage.removeItem('coinbuddy_manage_destination');

    const handleDestination = (event: Event) => {
      const next = (event as CustomEvent<ManageDestination>).detail;
      if (next === 'Accounts' || next === 'Categories' || next === 'Sharing' || next === 'Goals') setDestination(next);
    };
    document.addEventListener('coinbuddy:manage-destination', handleDestination);
    return () => document.removeEventListener('coinbuddy:manage-destination', handleDestination);
  }, []);

  useEffect(() => {
    sessionStorage.setItem('coinbuddy_current_manage_destination', destination);
    document.dispatchEvent(new CustomEvent<ManageDestination>('coinbuddy:manage-current', { detail: destination }));
  }, [destination]);

  return (
    <div data-testid="page-manage" className="w-full animate-fade-in pb-safe touch-pan-y">
      <V35SupportingForms destination={destination} />
      {destination === 'Accounts' ? <V35AccountsPanel /> : null}
      {destination === 'Categories' ? <V35CategoriesPanel /> : null}
      {destination === 'Sharing' ? <SharingPanel /> : null}
      {destination === 'Goals' ? <V35GoalsPanel /> : null}
    </div>
  );
}
