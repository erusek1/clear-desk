// frontend/src/pages/auth/LoginPage.tsx

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Spinner } from '../../components/common/Spinner';

// Form validation schema
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const LoginPage = () => {
  const { login } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  // Form submission handler
  const onSubmit = async (data: LoginFormValues) => {
    try {
      setIsSubmitting(true);
      setError(null);
      await login({
        email: data.email,
        password: data.password,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during login');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="mb-6 text-center text-2xl font-bold text-gray-900">
        Sign in to your account
      </h2>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mb-4">
          <label
            htmlFor="email"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            {...register('email')}
            className={`block w-full rounded-md border ${
              errors.email ? 'border-red-500' : 'border-gray-300'
            } px-3 py-2 focus:border-primary focus:outline-none focus:ring-primary sm:text-sm`}
            placeholder="Enter your email"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
          )}
        </div>

        <div className="mb-4">
          <label
            htmlFor="password"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            {...register('password')}
            className={`block w-full rounded-md border ${
              errors.password ? 'border-red-500' : 'border-gray-300'
            } px-3 py-2 focus:border-primary focus:outline-none focus:ring-primary sm:text-sm`}
            placeholder="Enter your password"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
          )}
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center">
            <input
              id="rememberMe"
              type="checkbox"
              {...register('rememberMe')}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <label
              htmlFor="rememberMe"
              className="ml-2 block text-sm text-gray-700"
            >
              Remember me
            </label>
          </div>
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-primary hover:text-primary/80"
          >
            Forgot password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-70"
        >
          {isSubmitting ? (
            <>
              <Spinner size="sm" className="mr-2" /> Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <div className="mt-4 text-center text-sm text-gray-600">
        Don't have an account?{' '}
        <Link
          to="/register"
          className="font-medium text-primary hover:text-primary/80"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
};

export default LoginPage;