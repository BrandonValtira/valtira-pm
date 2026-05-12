"use client";

import { useState, useEffect } from "react";
import { OnboardingConnectModal } from "./onboarding-connect-modal";

const DISMISS_KEY = "valtira-onboarding-dismissed";

export function DashboardOnboardingWrapper({
  children,
  integrations,
}: {
  children: React.ReactNode;
  integrations: { harvest: boolean; jira: boolean; google_drive: boolean };
}) {
  const [showModal, setShowModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const allConnected = integrations.harvest && integrations.jira && integrations.google_drive;
    if (allConnected) {
      setShowModal(false);
      return;
    }
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        const t = parseInt(dismissed, 10);
        if (!isNaN(t) && Date.now() - t < 7 * 24 * 60 * 60 * 1000) {
          setShowModal(false);
          return;
        }
      }
    } catch {
      // ignore
    }
    setShowModal(true);
  }, [mounted, integrations.harvest, integrations.jira, integrations.google_drive]);

  function handleDismiss() {
    setShowModal(false);
    try {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch {
      // ignore
    }
  }

  return (
    <>
      {children}
      {showModal && (
        <OnboardingConnectModal
          integrations={integrations}
          onDismiss={handleDismiss}
        />
      )}
    </>
  );
}
