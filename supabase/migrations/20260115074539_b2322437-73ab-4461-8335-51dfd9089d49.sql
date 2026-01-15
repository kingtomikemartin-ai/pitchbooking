-- Drop the current restrictive policies that require auth.uid()
DROP POLICY IF EXISTS "Users can delete their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated users can create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can leave their own sessions" ON public.booking_participants;
DROP POLICY IF EXISTS "Authenticated users can join sessions" ON public.booking_participants;

-- Create policies that work with the current name-based system
-- These policies are permissive for INSERT but track ownership for DELETE via application logic
-- For bookings: anyone can create, but only the creator (matched by name) should delete in the app
CREATE POLICY "Anyone can create bookings" 
ON public.bookings 
FOR INSERT 
WITH CHECK (true);

-- For bookings DELETE: either auth.uid matches user_id OR user_id is null (legacy support)
-- Application code will enforce creator check via created_by_name
CREATE POLICY "Creator can delete their own bookings" 
ON public.bookings 
FOR DELETE 
USING (
  CASE 
    WHEN user_id IS NOT NULL THEN auth.uid() = user_id
    ELSE true  -- Legacy bookings without user_id can be deleted based on app logic
  END
);

-- For participants: anyone can join
CREATE POLICY "Anyone can join sessions" 
ON public.booking_participants 
FOR INSERT 
WITH CHECK (true);

-- For participants DELETE: either auth.uid matches user_id OR user_id is null
CREATE POLICY "Participant can leave their own sessions" 
ON public.booking_participants 
FOR DELETE 
USING (
  CASE 
    WHEN user_id IS NOT NULL THEN auth.uid() = user_id
    ELSE true  -- Legacy participants without user_id can be deleted based on app logic
  END
);