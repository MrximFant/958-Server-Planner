import { useState } from 'react';

const STEPS = [
  {
    title: 'Create Your First Alliance',
    description: 'Go to the ALLIANCES tab and click CREATE ALLIANCE. Give it a name and tag. Each alliance represents one group within your server.',
    actionLabel: 'GO TO ALLIANCES →',
    actionType: 'alliances',
  },
  {
    title: 'Copy the Owner Invite Link',
    description: 'In the ALLIANCES tab, click the 👑 OWNER LINK button next to your alliance and copy it. This is a one-time link — once used it becomes inactive.',
    actionLabel: 'GO TO ALLIANCES →',
    actionType: 'alliances',
  },
  {
    title: 'Send It to Your R5 Leader',
    description: 'Paste the owner invite link in Discord. Your R5 clicks it, registers, and becomes the Alliance Owner automatically — no manual setup needed.',
    actionLabel: "I'VE SENT IT →",
    actionType: 'next',
  },
  {
    title: "You're All Set!",
    description: 'Your R5 will share the member invite link with their players from their Alliance HQ → Manage → Settings page. You can add more alliances anytime.',
    actionLabel: 'CLOSE →',
    actionType: 'close',
  },
];

// Determine which step to start on based on actual progress
function getInitialStep(allianceCount, hasOwnerInviteBeenCopied) {
  if (allianceCount === 0) return 0;
  if (!hasOwnerInviteBeenCopied) return 1;
  return 2;
}

export default function SetupWizard({ serverId, navigate, onDismiss, allianceCount = 0 }) {
  // Use localStorage to track whether user has copied owner link
  const copiedKey = 'wizard_owner_copied_' + serverId;
  const hasOwnerInviteBeenCopied = localStorage.getItem(copiedKey) === '1';

  const [currentStep, setCurrentStep] = useState(() => getInitialStep(allianceCount, hasOwnerInviteBeenCopied));
  const step = STEPS[currentStep];

  function handleAction() {
    if (step.actionType === 'alliances') {
      // Navigate but keep wizard open — user comes back after doing the step
      navigate('/server/' + serverId + '/admin?tab=alliances');
      // If we're on step 1 (copy owner link), mark it done when they go there
      if (currentStep === 1) {
        localStorage.setItem(copiedKey, '1');
      }
      onDismiss();
    } else if (step.actionType === 'next') {
      setCurrentStep(s => Math.min(s + 1, STEPS.length - 1));
    } else if (step.actionType === 'close') {
      onDismiss();
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div
        style={{
          background: '#0d1b2a',
          border: '1px solid rgba(0,200,255,0.2)',
          borderRadius: 12,
          padding: 32,
          maxWidth: 480,
          width: '100%',
          position: 'relative',
          fontFamily: "'Rajdhani', sans-serif",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Step indicator */}
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2px', color: '#3a5878', marginBottom: 6 }}>
          STEP {currentStep + 1} OF {STEPS.length}
        </div>

        {/* Title */}
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '3px', color: '#00d4ff', textTransform: 'uppercase', marginBottom: 16 }}>
          FIRST TIME SETUP
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              onClick={() => setCurrentStep(i)}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: i === currentStep ? '#00d4ff' : i < currentStep ? 'rgba(0,212,255,0.4)' : '#1e3550',
                transition: 'all 0.2s',
                cursor: i < currentStep ? 'pointer' : 'default',
              }}
            />
          ))}
        </div>

        {/* Step title */}
        <div style={{ fontSize: 20, fontWeight: 700, color: '#d0e4f4', marginBottom: 12, lineHeight: 1.2 }}>
          {step.title}
        </div>

        {/* Description */}
        <p style={{ color: '#a0c0d8', fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
          {step.description}
        </p>

        {/* Completed step hint */}
        {currentStep > 0 && currentStep < STEPS.length - 1 && (
          <div style={{ fontSize: 11, color: 'rgba(0,212,255,0.5)', marginBottom: 16, letterSpacing: '0.5px' }}>
            ✓ Previous steps completed — pick up from here
          </div>
        )}

        {/* Action button */}
        <button
          onClick={handleAction}
          style={{
            width: '100%',
            background: '#00d4ff',
            color: '#080d14',
            border: 'none',
            borderRadius: 6,
            padding: '13px 20px',
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: '1px',
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          {step.actionLabel}
        </button>

        {/* Navigation row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {currentStep > 0 ? (
            <button
              onClick={() => setCurrentStep(s => s - 1)}
              style={{ background: 'none', border: 'none', color: '#3a5878', cursor: 'pointer', fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '1px', padding: 0 }}
            >
              ← BACK
            </button>
          ) : <span />}
          <button
            onClick={onDismiss}
            style={{ background: 'none', border: 'none', color: '#3a5878', cursor: 'pointer', fontFamily: "'Rajdhani', sans-serif", fontSize: 12, letterSpacing: '1px', padding: 0, textDecoration: 'underline' }}
          >
            skip setup
          </button>
        </div>
      </div>
    </div>
  );
}
