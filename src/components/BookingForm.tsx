import { useState } from 'react';
import { useUser } from '@/lib/userContext';
import { useBookings } from '@/hooks/useBookings';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { TIME_SLOTS, BookingWithParticipants } from '@/types/booking';
import { Plus, Users, Lock } from 'lucide-react';
import { format } from 'date-fns';

interface BookingFormProps {
  selectedDate: Date | undefined;
  existingBookings: BookingWithParticipants[];
}

export function BookingForm({ selectedDate, existingBookings }: BookingFormProps) {
  const { user } = useUser();
  const { createBooking } = useBookings(selectedDate);
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState<'1' | '2'>('1');
  const [sessionType, setSessionType] = useState<'open' | 'closed'>('closed');
  const [maxPlayers, setMaxPlayers] = useState('14');

  const isSlotAvailable = (time: string, dur: number) => {
    if (!selectedDate) return false;

    const slotStart = parseInt(time.split(':')[0]);
    const slotEnd = slotStart + dur;

    for (const booking of existingBookings) {
      const bookingStart = parseInt(booking.start_time.split(':')[0]);
      const bookingEnd = bookingStart + booking.duration;

      // Check for overlap
      if (slotStart < bookingEnd && slotEnd > bookingStart) {
        // If it's a closed session, it's completely blocked
        if (booking.session_type === 'closed') return false;
        // If it's an open session, it's still blocked for new bookings
        return false;
      }
    }

    return true;
  };

  const availableSlots = TIME_SLOTS.filter((slot) => 
    isSlotAvailable(slot.time, parseInt(duration))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !selectedDate || !startTime) return;

    createBooking.mutate({
      created_by_name: user.name,
      created_by_level: user.level,
      date: format(selectedDate, 'yyyy-MM-dd'),
      start_time: startTime,
      duration: parseInt(duration),
      session_type: sessionType,
      max_players: sessionType === 'open' ? parseInt(maxPlayers) : null,
    });

    // Reset form
    setStartTime('');
    setDuration('1');
    setSessionType('closed');
    setMaxPlayers('14');
  };

  if (!selectedDate) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="w-5 h-5 text-primary" />
            Create Booking
          </CardTitle>
          <CardDescription>Select a date to create a booking</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Plus className="w-5 h-5 text-primary" />
          Create Booking
        </CardTitle>
        <CardDescription>
          Book the pitch for {format(selectedDate, 'EEEE, MMMM d, yyyy')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-3">
            <Label>Session Type</Label>
            <RadioGroup
              value={sessionType}
              onValueChange={(value) => setSessionType(value as 'open' | 'closed')}
              className="grid grid-cols-2 gap-3"
            >
              <div className="relative">
                <RadioGroupItem value="closed" id="closed" className="peer sr-only" />
                <Label
                  htmlFor="closed"
                  className="flex items-center justify-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover:bg-muted"
                >
                  <Lock className="w-4 h-4" />
                  <span>Closed</span>
                </Label>
              </div>
              <div className="relative">
                <RadioGroupItem value="open" id="open" className="peer sr-only" />
                <Label
                  htmlFor="open"
                  className="flex items-center justify-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover:bg-muted"
                >
                  <Users className="w-4 h-4" />
                  <span>Open</span>
                </Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {sessionType === 'closed' 
                ? 'Only you can use the pitch during this time' 
                : 'Other players can join your session'}
            </p>
          </div>

          {sessionType === 'open' && (
            <div className="space-y-2">
              <Label htmlFor="maxPlayers">Maximum Players</Label>
              <Input
                id="maxPlayers"
                type="number"
                min="2"
                max="30"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                className="h-11"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="duration">Duration</Label>
            <Select value={duration} onValueChange={(v) => setDuration(v as '1' | '2')}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Hour</SelectItem>
                <SelectItem value="2">2 Hours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="startTime">Start Time</Label>
            <Select value={startTime} onValueChange={setStartTime}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Select time slot" />
              </SelectTrigger>
              <SelectContent>
                {availableSlots.length > 0 ? (
                  availableSlots.map((slot) => (
                    <SelectItem key={slot.time} value={slot.time}>
                      {slot.label}
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No available slots
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <Button 
            type="submit" 
            className="w-full h-11 gradient-pitch shadow-pitch"
            disabled={!startTime || createBooking.isPending}
          >
            {createBooking.isPending ? 'Creating...' : 'Book Pitch'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
