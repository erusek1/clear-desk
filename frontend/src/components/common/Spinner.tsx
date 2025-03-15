// frontend/src/components/common/Spinner.tsx

import React from 'react';

/**
 * Spinner props
 */
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Spinner component for loading states
 */
export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className = '' }) => {
  // Determine size classes
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4',
  };

  return (
    <div className={`${className} inline-block`}>
      <div
        className={`${sizeClasses[size]} animate-spin rounded-full border-solid border-primary border-t-transparent`}
        role="status"
        aria-label="loading"
      />
    </div>
  );
};
