-- Create a function to validate player limit before joining
CREATE OR REPLACE FUNCTION public.validate_player_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_participant_count INTEGER;
  booking_max_players INTEGER;
  booking_session_type TEXT;
BEGIN
  -- Get the booking details
  SELECT max_players, session_type 
  INTO booking_max_players, booking_session_type
  FROM public.bookings 
  WHERE id = NEW.booking_id;
  
  -- If booking not found, reject
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  
  -- If closed session, don't allow joining
  IF booking_session_type = 'closed' THEN
    RAISE EXCEPTION 'Cannot join a closed session';
  END IF;
  
  -- Count current participants (excluding creator who is counted separately)
  SELECT COUNT(*) 
  INTO current_participant_count
  FROM public.booking_participants 
  WHERE booking_id = NEW.booking_id;
  
  -- Check if adding this player would exceed the limit
  -- Total players = creator (1) + current participants + new participant (1)
  IF booking_max_players IS NOT NULL AND (current_participant_count + 2) > booking_max_players THEN
    RAISE EXCEPTION 'Session is full. Maximum % players allowed.', booking_max_players;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to validate before insert
DROP TRIGGER IF EXISTS check_player_limit ON public.booking_participants;
CREATE TRIGGER check_player_limit
  BEFORE INSERT ON public.booking_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_player_limit();