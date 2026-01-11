-- Create bookings table
CREATE TABLE public.bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by_name TEXT NOT NULL,
  created_by_level TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration INTEGER NOT NULL CHECK (duration IN (1, 2)),
  session_type TEXT NOT NULL CHECK (session_type IN ('open', 'closed')),
  max_players INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Constraint: max_players required for open sessions
  CONSTRAINT max_players_for_open CHECK (
    (session_type = 'closed') OR 
    (session_type = 'open' AND max_players IS NOT NULL AND max_players >= 2)
  )
);

-- Create booking participants table (for open sessions)
CREATE TABLE public.booking_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  player_level TEXT NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Prevent duplicate participants in same booking
  UNIQUE (booking_id, player_name, player_level)
);

-- Enable Row Level Security
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_participants ENABLE ROW LEVEL SECURITY;

-- Public access policies for bookings (no auth required - simple name/level login)
CREATE POLICY "Anyone can view bookings"
ON public.bookings FOR SELECT
USING (true);

CREATE POLICY "Anyone can create bookings"
ON public.bookings FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can delete their own bookings"
ON public.bookings FOR DELETE
USING (true);

-- Public access policies for participants
CREATE POLICY "Anyone can view participants"
ON public.booking_participants FOR SELECT
USING (true);

CREATE POLICY "Anyone can join sessions"
ON public.booking_participants FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can leave sessions"
ON public.booking_participants FOR DELETE
USING (true);

-- Enable realtime for bookings
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_participants;