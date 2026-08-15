import React, { useRef, useState } from 'react';
import { Camera, UserRound, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { V35ModalFrame } from './ui/V35ModalFrame';

export function EditProfileModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { profile, setProfile } = useAppContext();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    setProfile({ ...profile, name, avatar });
    onClose();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = loadEvent => {
      if (typeof loadEvent.target?.result === 'string') setAvatar(loadEvent.target.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <V35ModalFrame size="sm" testId="profile-edit-sheet" labelledBy="profile-edit-title" panelClassName="overflow-y-auto">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-outline-variant/25 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserRound className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h2 id="profile-edit-title" className="text-lg font-semibold text-on-surface">Edit Profile</h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">Profile details stay on this device.</p>
          </div>
        </div>
        <button type="button" aria-label="Close profile editor" onClick={onClose} className="v35-focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="space-y-6 p-5 sm:p-6">
        <div className="flex items-center gap-4 rounded-2xl border border-outline-variant/25 bg-surface-container-low p-4">
          <div className="relative shrink-0">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-high text-2xl font-semibold text-on-surface-variant">
              {avatar ? <img src={avatar} alt="Profile" className="h-full w-full object-cover" /> : (name.trim().charAt(0) || 'C')}
            </div>
            <button type="button" aria-label="Change profile photo" onClick={() => fileInputRef.current?.click()} className="v35-focus-ring absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-xl border border-outline-variant/25 bg-primary text-on-primary shadow-lg">
              <Camera className="h-4 w-4" />
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface">Profile picture</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">Choose an image from this device. It remains part of your local CoinBuddy profile.</p>
          </div>
        </div>

        <div>
          <label htmlFor="profile-full-name" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Full Name</label>
          <input id="profile-full-name" aria-label="Full Name" type="text" value={name} onChange={event => setName(event.target.value)} className="v35-focus-ring w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm font-medium text-on-surface" placeholder="Your name" />
        </div>
      </div>

      <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-outline-variant/20 bg-surface-container/95 px-5 py-4 backdrop-blur sm:flex-row sm:justify-end sm:px-6">
        <button type="button" onClick={onClose} className="v35-focus-ring min-h-11 rounded-xl border border-outline-variant/30 px-4 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high sm:min-w-24">Cancel</button>
        <button type="button" onClick={handleSave} disabled={!name.trim()} className="v35-focus-ring min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">Save Changes</button>
      </footer>
    </V35ModalFrame>
  );
}
