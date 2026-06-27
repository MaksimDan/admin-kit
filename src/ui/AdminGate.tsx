'use client'

import { ReactNode } from 'react';
import type { Session } from 'next-auth';

interface AdminGateProps {
  session: Session | null;
  isLoading: boolean;
  children: ReactNode;
}

// Renders a login prompt when unauthenticated, a loading state while data
// loads, and the page content otherwise. Centralizes the guard that every
// admin management page repeated.
export const AdminGate = ({ session, isLoading, children }: AdminGateProps) => {
  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Please log in to access this page</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
};
