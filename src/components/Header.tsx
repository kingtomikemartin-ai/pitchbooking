import { useUser } from '@/lib/userContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut, Shield, Calendar } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export function Header() {
  const { user, logout } = useUser();
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg gradient-pitch flex items-center justify-center shadow-pitch">
            <Calendar className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Pitch Booking</h1>
            <p className="text-xs text-muted-foreground">University Football</p>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          {user && (
            <>
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-sm font-medium">{user.name}</span>
                <Badge variant="secondary">Level {user.level}</Badge>
              </div>

              {location.pathname !== '/admin' && (
                <Link to="/admin">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <Shield className="w-4 h-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </Button>
                </Link>
              )}

              {location.pathname === '/admin' && (
                <Link to="/">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    <span className="hidden sm:inline">Bookings</span>
                  </Button>
                </Link>
              )}

              <Button variant="ghost" size="sm" onClick={logout} className="gap-2">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
