export interface Booking {
  id: string;
  created_by_name: string;
  created_by_level: string;
  date: string;
  start_time: string;
  duration: number;
  session_type: 'open' | 'closed';
  max_players: number | null;
  created_at: string;
}

export interface BookingParticipant {
  id: string;
  booking_id: string;
  player_name: string;
  player_level: string;
  joined_at: string;
}

export interface BookingWithParticipants extends Booking {
  participants: BookingParticipant[];
}

export type TimeSlot = {
  time: string;
  label: string;
};

export const TIME_SLOTS: TimeSlot[] = [
  { time: '08:00', label: '8:00 AM' },
  { time: '09:00', label: '9:00 AM' },
  { time: '10:00', label: '10:00 AM' },
  { time: '11:00', label: '11:00 AM' },
  { time: '12:00', label: '12:00 PM' },
  { time: '13:00', label: '1:00 PM' },
  { time: '14:00', label: '2:00 PM' },
  { time: '15:00', label: '3:00 PM' },
  { time: '16:00', label: '4:00 PM' },
  { time: '17:00', label: '5:00 PM' },
  { time: '18:00', label: '6:00 PM' },
  { time: '19:00', label: '7:00 PM' },
  { time: '20:00', label: '8:00 PM' },
];

export const LEVELS = ['100', '200', '300', '400', '500'];
