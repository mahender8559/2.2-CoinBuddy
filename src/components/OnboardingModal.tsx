import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Shield, Database, Activity, Lock, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppContext } from '../context/AppContext';

export function OnboardingModal() {
  const { isOnboardingOpen, setOnboardingOpen, setButtonTourOpen } = useAppContext();
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOnboardingOpen) return null;

  const handleClose = () => {
    const isFirstUse = localStorage.getItem('coinbuddy_onboarding_seen') !== 'true';
    localStorage.setItem('coinbuddy_onboarding_seen', 'true');
    setOnboardingOpen(false);
    setCurrentStep(0);
    if (isFirstUse && localStorage.getItem('hasCompletedButtonTour') !== 'true') {
      setButtonTourOpen(true);
    }
  };

  const steps = [
    {
      id: 'welcome',
      title: 'Welcome to CoinBuddy',
      description: 'Your offline-first, highly secure financial ledger. Take complete control over your wealth with advanced tracking and zero-drift relational balances.',
      image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800&auto=format&fit=crop&q=80',
      icon: <Wallet className="w-8 h-8 text-blue-500" />
    },
    {
      id: 'accounts',
      title: 'Accounts & Relational Ledger',
      description: 'Create assets, liabilities, and track everything in a unified view. Real-time computed views ensure absolutely zero balance drift.',
      image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=80',
      icon: <Database className="w-8 h-8 text-indigo-500" />
    },
    {
      id: 'transactions',
      title: 'Transactions & Transfers',
      description: 'Log your income, expenses, and cross-account transfers. Our robust dual-entry system ensures accurate ledger balances.',
      image: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?w=800&auto=format&fit=crop&q=80',
      icon: <Activity className="w-8 h-8 text-emerald-500" />
    },
    {
      id: 'loans',
      title: 'Loans & Liability Tracking',
      description: 'Specialized math support for bullet payments, EMI schedules, and variable interest loans. Know exactly how much you owe.',
      image: 'https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?w=800&auto=format&fit=crop&q=80',
      icon: <Shield className="w-8 h-8 text-purple-500" />
    },
    {
      id: 'security',
      title: 'Encrypted Backups & Security',
      description: 'Your data stays with you. Enjoy AES-256-GCM encrypted local storage and optional cloud synchronization for ultimate peace of mind.',
      image: 'https://images.unsplash.com/photo-1614064641913-6b20a22eb8a9?w=800&auto=format&fit=crop&q=80',
      icon: <Lock className="w-8 h-8 text-rose-500" />
    }
  ];

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(curr => curr + 1);
    } else {
      handleClose();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(curr => curr - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-2xl bg-surface-container-low rounded-3xl border border-outline-variant/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="relative h-48 sm:h-64 overflow-hidden shrink-0">
          <AnimatePresence mode="wait">
            <motion.img
              key={currentStep}
              src={steps[currentStep].image}
              alt={steps[currentStep].title}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/40 to-transparent" />
          
          <button 
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 bg-surface-container/60 hover:bg-surface-container-high text-on-surface rounded-full transition-colors backdrop-blur-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col p-6 sm:p-8 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col flex-1"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-surface-container rounded-2xl border border-outline-variant/20">
                  {steps[currentStep].icon}
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-on-surface leading-tight">
                  {steps[currentStep].title}
                </h2>
              </div>
              <p className="text-lg text-on-surface-variant leading-relaxed">
                {steps[currentStep].description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="p-6 sm:p-8 border-t border-outline-variant/30 bg-surface-container shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {steps.map((_, idx) => (
                <div 
                  key={idx}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentStep 
                      ? 'w-8 bg-primary' 
                      : 'w-2 bg-outline-variant/50'
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-3">
              {currentStep > 0 && (
                <button
                  onClick={prevStep}
                  className="px-4 py-2.5 font-bold text-on-surface hover:bg-surface-container-high rounded-xl transition-colors flex items-center"
                >
                  <ChevronLeft className="w-5 h-5 mr-1" />
                  Back
                </button>
              )}
              
              <button
                onClick={nextStep}
                className="px-6 py-2.5 font-bold text-on-primary bg-primary hover:bg-primary/90 rounded-xl transition-transform active:scale-95 shadow-sm flex items-center"
              >
                {currentStep === steps.length - 1 ? (
                  <>
                    Get Started
                    <Check className="w-5 h-5 ml-2" />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
