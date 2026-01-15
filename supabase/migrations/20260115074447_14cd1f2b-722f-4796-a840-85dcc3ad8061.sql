-- Add user_id column to bookings table to track the authenticated creator
ALTER TABLE public.bookings 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to booking_participants table to track authenticated participants
ALTER TABLE public.booking_participants 
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop the old permissive DELETE policy on bookings
DROP POLICY IF EXISTS "Anyone can delete their own bookings" ON public.bookings;

-- Create new DELETE policy that only allows users to delete their own bookings
CREATE POLICY "Users can delete their own bookings" 
ON public.bookings 
FOR DELETE 
USING (auth.uid() = user_id);

-- Drop the old permissive DELETE policy on booking_participants
DROP POLICY IF EXISTS "Anyone can leave sessions" ON public.booking_participants;

-- Create new DELETE policy that only allows users to remove their own participation
CREATE POLICY "Users can leave their own sessions" 
ON public.booking_participants 
FOR DELETE 
USING (auth.uid() = user_id);

-- Update INSERT policy to ensure user_id is set correctly on bookings
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;

CREATE POLICY "Authenticated users can create bookings" 
ON public.bookings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Update INSERT policy for participants
DROP POLICY IF EXISTS "Anyone can join sessions" ON public.booking_participants;

CREATE POLICY "Authenticated users can join sessions" 
ON public.booking_participants 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);