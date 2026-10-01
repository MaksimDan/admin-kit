'use client'

import { ReactNode } from 'react';
import type { Session } from 'next-auth';

interface AdminGateProps {
  session: Session | null;
  isLoading: boolean;
  children: ReactNode;
}

// Renders a login prompt unless the session is a live admin session, a loading
// state while data loads, and the page content otherwise. Centralizes the guard
// that every admin management page repeated.
export const AdminGate = ({ session, isLoading, children }: AdminGateProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  // Checking the role, not just the session: past the absolute deadline the
  // session callback keeps the session but strips its role, so every request
  // from the page would fail with 401.
  if (session?.user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Please log in to access this page</div>
      </div>
    );
  }

  return <>{children}</>;
};
