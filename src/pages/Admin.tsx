import { useUser } from '@/lib/userContext';
import { useAllBookings } from '@/hooks/useBookings';
import { LoginForm } from '@/components/LoginForm';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Users, Lock, Calendar, Clock, UserCheck } from 'lucide-react';
import { format } from 'date-fns';

const Admin = () => {
  const { isLoggedIn } = useUser();
  const { bookings, isLoading, deleteBooking } = useAllBookings();

  if (!isLoggedIn) {
    return <LoginForm />;
  }

  const totalBookings = bookings.length;
  const openSessions = bookings.filter((b) => b.session_type === 'open').length;
  const closedSessions = bookings.filter((b) => b.session_type === 'closed').length;
  const totalParticipants = bookings.reduce((acc, b) => acc + b.participants.length + 1, 0);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Admin Dashboard</h2>
          <p className="text-muted-foreground mt-1">
            View and manage all pitch bookings
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Total Bookings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalBookings}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                Open Sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{openSessions}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Lock className="w-4 h-4" />
                Closed Sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{closedSessions}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <UserCheck className="w-4 h-4" />
                Total Players
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalParticipants}</p>
            </CardContent>
          </Card>
        </div>

        {/* Bookings Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Bookings</CardTitle>
            <CardDescription>Complete list of all pitch reservations</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-center py-8 text-muted-foreground">Loading bookings...</p>
            ) : bookings.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No bookings yet</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Players</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell className="font-medium">
                          {format(new Date(booking.date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>{booking.start_time.slice(0, 5)}</TableCell>
                        <TableCell>{booking.duration}h</TableCell>
                        <TableCell>
                          <Badge variant={booking.session_type === 'open' ? 'default' : 'secondary'}>
                            {booking.session_type === 'open' ? (
                              <><Users className="w-3 h-3 mr-1" /> Open</>
                            ) : (
                              <><Lock className="w-3 h-3 mr-1" /> Closed</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {booking.created_by_name}{' '}
                          <span className="text-muted-foreground">(L{booking.created_by_level})</span>
                        </TableCell>
                        <TableCell>
                          {booking.session_type === 'open' ? (
                            <span>
                              {booking.participants.length + 1}/{booking.max_players}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteBooking.mutate(booking.id)}
                            disabled={deleteBooking.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Admin;
