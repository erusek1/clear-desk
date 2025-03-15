// frontend/src/pages/NotFoundPage.tsx

import { Link } from 'react-router-dom';

const NotFoundPage = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 px-4 text-center">
      <div className="mb-4 text-6xl font-bold text-primary">404</div>
      <h1 className="mb-2 text-3xl font-bold text-gray-900">Page not found</h1>
      <p className="mb-8 text-gray-600">
        Sorry, we couldn't find the page you're looking for.
      </p>
      <Link
        to="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Go back home
      </Link>
    </div>
  );
};

export default NotFoundPage;