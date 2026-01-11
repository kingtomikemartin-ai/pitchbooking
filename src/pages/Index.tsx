import { useState, useEffect } from 'react';
import { useUser } from '@/lib/userContext';
import { useBookings } from '@/hooks/useBookings';
import { LoginForm } from '@/components/LoginForm';
import { Header } from '@/components/Header';
import { BookingCalendar } from '@/components/BookingCalendar';
import { BookingForm } from '@/components/BookingForm';
import { BookingList } from '@/components/BookingList';
import { AIAssistant } from '@/components/AIAssistant';
import { supabase } from '@/integrations/supabase/client';

function BookingDashboard() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const { bookings, isLoading, refetch } = useBookings(selectedDate);

  // Set up realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('booking-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => refetch()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_participants' },
        () => refetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container px-4 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Book the Pitch</h2>
          <p className="text-muted-foreground mt-1">
            Select a date and time to reserve the football pitch
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-6">
            <BookingCalendar
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
            <BookingForm
              selectedDate={selectedDate}
              existingBookings={bookings}
            />
          </div>

          <div>
            <BookingList selectedDate={selectedDate} bookings={bookings} />
          </div>
        </div>
      </main>

      <AIAssistant />
    </div>
  );
}

const Index = () => {
  const { isLoggedIn } = useUser();

  if (!isLoggedIn) {
    return <LoginForm />;
  }

  return <BookingDashboard />;
};

export default Index;
