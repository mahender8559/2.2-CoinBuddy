import React, { useState, useRef } from 'react';
import { X, Camera } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export function EditProfileModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { profile, setProfile } = useAppContext();
  
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [avatar, setAvatar] = useState(profile.avatar);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    setProfile({ ...profile, name, email, avatar });
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (typeof e.target?.result === 'string') {
          setAvatar(e.target.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-background flex flex-col animate-fade-in pb-safe">
      <div className="flex items-center justify-between p-4 border-b border-outline-variant/30 bg-surface/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 hover:bg-surface-variant rounded-full text-on-surface">
            <X className="w-6 h-6" />
          </button>
          <h2 className="text-xl font-bold text-on-surface">Edit Profile</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-8 items-center max-w-lg mx-auto w-full">
        {/* Avatar Selection */}
        <div className="relative mt-4">
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-surface-container bg-surface-variant flex items-center justify-center">
            {avatar ? (
              <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <div className="text-4xl text-on-surface-variant">{name.charAt(0)}</div>
            )}
          </div>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 bg-primary text-on-primary p-3 rounded-full hover:bg-primary/90 transition-colors shadow-lg"
          >
            <Camera className="w-5 h-5" />
          </button>
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
        </div>

        {/* Form Fields */}
        <div className="w-full space-y-5">
          <div>
            <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2 block">Full Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-container border border-outline-variant/50 rounded-xl p-4 text-on-surface focus:outline-none focus:border-primary/50 transition-colors"
              placeholder="Your name"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full mt-auto pt-8 flex flex-col gap-3">
          <button 
            onClick={handleSave}
            className="w-full bg-primary text-on-primary font-bold py-4 rounded-xl hover:bg-primary/90 transition-colors"
          >
            Save Changes
          </button>
          <button 
            onClick={onClose}
            className="w-full bg-surface-container text-on-surface-variant font-bold py-4 rounded-xl hover:bg-surface-variant transition-colors border border-outline-variant/30"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
