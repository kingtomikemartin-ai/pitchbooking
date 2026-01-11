import { useUser } from '@/lib/userContext';
import { useBookings } from '@/hooks/useBookings';
import { BookingWithParticipants, TIME_SLOTS } from '@/types/booking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Clock, Users, Lock, UserPlus, UserMinus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface BookingListProps {
  selectedDate: Date | undefined;
  bookings: BookingWithParticipants[];
}

export function BookingList({ selectedDate, bookings }: BookingListProps) {
  const { user } = useUser();
  const { joinSession, leaveSession, deleteBooking } = useBookings(selectedDate);

  const getTimeLabel = (time: string) => {
    const slot = TIME_SLOTS.find((s) => s.time === time);
    return slot?.label || time;
  };

  const isUserInSession = (booking: BookingWithParticipants) => {
    if (!user) return false;
    
    // Check if user is the creator
    if (booking.created_by_name === user.name && booking.created_by_level === user.level) {
      return true;
    }
    
    // Check if user is a participant
    return booking.participants.some(
      (p) => p.player_name === user.name && p.player_level === user.level
    );
  };

  const isSessionFull = (booking: BookingWithParticipants) => {
    if (booking.session_type === 'closed') return true;
    const totalPlayers = booking.participants.length + 1; // +1 for creator
    return totalPlayers >= (booking.max_players || 0);
  };

  const canJoin = (booking: BookingWithParticipants) => {
    return booking.session_type === 'open' && !isUserInSession(booking) && !isSessionFull(booking);
  };

  const canLeave = (booking: BookingWithParticipants) => {
    if (!user) return false;
    // Only participants can leave, not the creator
    return booking.participants.some(
      (p) => p.player_name === user.name && p.player_level === user.level
    );
  };

  const canDelete = (booking: BookingWithParticipants) => {
    if (!user) return false;
    return booking.created_by_name === user.name && booking.created_by_level === user.level;
  };

  const handleJoin = (booking: BookingWithParticipants) => {
    if (!user) return;
    joinSession.mutate({
      bookingId: booking.id,
      playerName: user.name,
      playerLevel: user.level,
    });
  };

  const handleLeave = (booking: BookingWithParticipants) => {
    if (!user) return;
    leaveSession.mutate({
      bookingId: booking.id,
      playerName: user.name,
      playerLevel: user.level,
    });
  };

  const handleDelete = (booking: BookingWithParticipants) => {
    deleteBooking.mutate(booking.id);
  };

  if (!selectedDate) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="w-5 h-5 text-primary" />
            Today's Bookings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Select a date to view bookings</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="w-5 h-5 text-primary" />
          Bookings for {format(selectedDate, 'MMM d')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {bookings.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">
            No bookings for this date. Be the first to book!
          </p>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => {
              const totalPlayers = booking.participants.length + 1;
              const isFull = isSessionFull(booking);
              const userInSession = isUserInSession(booking);

              return (
                <div
                  key={booking.id}
                  className={`p-4 rounded-lg border transition-colors ${
                    userInSession ? 'bg-primary/5 border-primary/30' : 'bg-muted/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">
                          {getTimeLabel(booking.start_time)}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-sm text-muted-foreground">
                          {booking.duration}h
                        </span>
                        <Badge variant={booking.session_type === 'open' ? 'default' : 'secondary'} className="ml-1">
                          {booking.session_type === 'open' ? (
                            <><Users className="w-3 h-3 mr-1" /> Open</>
                          ) : (
                            <><Lock className="w-3 h-3 mr-1" /> Closed</>
                          )}
                        </Badge>
                        {isFull && booking.session_type === 'open' && (
                          <Badge variant="outline" className="text-warning border-warning">
                            Full
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm mt-1">
                        <span className="text-muted-foreground">By:</span>{' '}
                        <span className="font-medium">{booking.created_by_name}</span>{' '}
                        <span className="text-muted-foreground">(L{booking.created_by_level})</span>
                      </p>

                      {booking.session_type === 'open' && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground">
                            Players: {totalPlayers}/{booking.max_players}
                          </p>
                          {booking.participants.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {booking.participants.map((p) => (
                                <Badge key={p.id} variant="outline" className="text-xs">
                                  {p.player_name} (L{p.player_level})
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      {canJoin(booking) && (
                        <Button
                          size="sm"
                          onClick={() => handleJoin(booking)}
                          disabled={joinSession.isPending}
                          className="gap-1"
                        >
                          <UserPlus className="w-3 h-3" />
                          Join
                        </Button>
                      )}
                      {canLeave(booking) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleLeave(booking)}
                          disabled={leaveSession.isPending}
                          className="gap-1"
                        >
                          <UserMinus className="w-3 h-3" />
                          Leave
                        </Button>
                      )}
                      {canDelete(booking) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(booking)}
                          disabled={deleteBooking.isPending}
                          className="gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
