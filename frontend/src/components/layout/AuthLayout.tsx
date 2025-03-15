// frontend/src/components/layout/AuthLayout.tsx

import { Outlet } from 'react-router-dom';

const AuthLayout = () => {
  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Left side - Logo and info */}
      <div className="hidden w-1/2 bg-primary lg:block">
        <div className="flex h-full flex-col items-center justify-center p-12 text-primary-foreground">
          <div className="mb-8 text-4xl font-bold">Clear-Desk.com</div>
          <p className="mb-6 text-center text-xl">
            Simplified Electrical Contracting Management
          </p>
          <ul className="space-y-4 text-lg">
            <li className="flex items-center">
              <svg className="mr-3 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Blueprint Processing
            </li>
            <li className="flex items-center">
              <svg className="mr-3 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Automated Estimating
            </li>
            <li className="flex items-center">
              <svg className="mr-3 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Material Management
            </li>
            <li className="flex items-center">
              <svg className="mr-3 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Field Operations
            </li>
          </ul>
        </div>
      </div>

      {/* Right side - Auth forms */}
      <div className="flex w-full flex-col justify-center p-8 lg:w-1/2">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 text-center lg:hidden">
            <h1 className="text-3xl font-bold text-primary">Clear-Desk.com</h1>
            <p className="mt-2 text-gray-600">Simplified Electrical Contracting Management</p>
          </div>
          
          {/* Render the auth form */}
          <div className="rounded-lg bg-white p-8 shadow-md">
            <Outlet />
          </div>
          
          {/* Footer */}
          <div className="mt-6 text-center text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Clear-Desk.com. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;