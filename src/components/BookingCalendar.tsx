import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays } from 'lucide-react';

interface BookingCalendarProps {
  selectedDate: Date | undefined;
  onSelectDate: (date: Date | undefined) => void;
  bookedDates?: Date[];
}

export function BookingCalendar({ selectedDate, onSelectDate, bookedDates = [] }: BookingCalendarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="w-5 h-5 text-primary" />
          Select Date
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={onSelectDate}
          disabled={(date) => date < today}
          modifiers={{
            booked: bookedDates,
          }}
          modifiersStyles={{
            booked: {
              backgroundColor: 'hsl(var(--primary) / 0.1)',
              color: 'hsl(var(--primary))',
              fontWeight: '600',
            },
          }}
          className="rounded-md border-0 p-0"
        />
      </CardContent>
    </Card>
  );
}
