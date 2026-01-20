import { Link } from 'react-router-dom';
import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">D</span>
              </div>
              <span className="font-semibold text-xl text-gray-900">Dryrun</span>
            </Link>
            <nav className="flex items-center gap-4">
              <Link
                to="/"
                className="text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                New Test
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-white border-t border-gray-200 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            Dryrun - AI-Powered UX Testing
          </p>
        </div>
      </footer>
    </div>
  );
}
