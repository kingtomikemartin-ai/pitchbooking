import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Booking, BookingParticipant, BookingWithParticipants } from '@/types/booking';
import { useToast } from '@/hooks/use-toast';
import { queryClient as appQueryClient } from '@/lib/queryClient';

export function useBookings(selectedDate?: Date) {
  // Pass the singleton client explicitly so this hook works even if the bundler
  // accidentally duplicates the React Query context.
  const queryClient = useQueryClient(appQueryClient);
  const { toast } = useToast();

  const bookingsQuery = useQuery(
    {
      queryKey: ['bookings', selectedDate?.toISOString().split('T')[0]],
      queryFn: async () => {
        let query = supabase
          .from('bookings')
          .select('*')
          .order('date', { ascending: true })
          .order('start_time', { ascending: true });

        if (selectedDate) {
          const dateStr = selectedDate.toISOString().split('T')[0];
          query = query.eq('date', dateStr);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as Booking[];
      },
    },
    appQueryClient
  );

  const participantsQuery = useQuery(
    {
      queryKey: ['participants', bookingsQuery.data?.map((b) => b.id)],
      queryFn: async () => {
        if (!bookingsQuery.data?.length) return [];

        const bookingIds = bookingsQuery.data.map((b) => b.id);
        const { data, error } = await supabase
          .from('booking_participants')
          .select('*')
          .in('booking_id', bookingIds);

        if (error) throw error;
        return data as BookingParticipant[];
      },
      enabled: !!bookingsQuery.data?.length,
    },
    appQueryClient
  );

  const bookingsWithParticipants: BookingWithParticipants[] = (bookingsQuery.data || []).map(
    (booking) => ({
      ...booking,
      session_type: booking.session_type as 'open' | 'closed',
      participants: (participantsQuery.data || []).filter((p) => p.booking_id === booking.id),
    })
  );

  const createBooking = useMutation(
    {
      mutationFn: async (booking: Omit<Booking, 'id' | 'created_at'>) => {
        const { data, error } = await supabase.from('bookings').insert(booking).select().single();

        if (error) throw error;
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
        toast({
          title: 'Booking Created!',
          description: 'Your pitch booking has been confirmed.',
        });
      },
      onError: (error) => {
        toast({
          title: 'Booking Failed',
          description: error.message,
          variant: 'destructive',
        });
      },
    },
    appQueryClient
  );

  const joinSession = useMutation(
    {
      mutationFn: async ({
        bookingId,
        playerName,
        playerLevel,
      }: {
        bookingId: string;
        playerName: string;
        playerLevel: string;
      }) => {
        const { data, error } = await supabase
          .from('booking_participants')
          .insert({
            booking_id: bookingId,
            player_name: playerName,
            player_level: playerLevel,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
        queryClient.invalidateQueries({ queryKey: ['participants'] });
        toast({
          title: 'Joined Session!',
          description: 'You have joined the open session.',
        });
      },
      onError: (error) => {
        toast({
          title: 'Failed to Join',
          description: error.message,
          variant: 'destructive',
        });
      },
    },
    appQueryClient
  );

  const leaveSession = useMutation(
    {
      mutationFn: async ({
        bookingId,
        playerName,
        playerLevel,
      }: {
        bookingId: string;
        playerName: string;
        playerLevel: string;
      }) => {
        const { error } = await supabase
          .from('booking_participants')
          .delete()
          .eq('booking_id', bookingId)
          .eq('player_name', playerName)
          .eq('player_level', playerLevel);

        if (error) throw error;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
        queryClient.invalidateQueries({ queryKey: ['participants'] });
        toast({
          title: 'Left Session',
          description: 'You have left the session.',
        });
      },
      onError: (error) => {
        toast({
          title: 'Failed to Leave',
          description: error.message,
          variant: 'destructive',
        });
      },
    },
    appQueryClient
  );

  const deleteBooking = useMutation(
    {
      mutationFn: async (bookingId: string) => {
        const { error } = await supabase.from('bookings').delete().eq('id', bookingId);

        if (error) throw error;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
        toast({
          title: 'Booking Deleted',
          description: 'The booking has been removed.',
        });
      },
      onError: (error) => {
        toast({
          title: 'Failed to Delete',
          description: error.message,
          variant: 'destructive',
        });
      },
    },
    appQueryClient
  );

  return {
    bookings: bookingsWithParticipants,
    isLoading: bookingsQuery.isLoading || participantsQuery.isLoading,
    error: bookingsQuery.error || participantsQuery.error,
    createBooking,
    joinSession,
    leaveSession,
    deleteBooking,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
  };
}

export function useAllBookings() {
  const { toast } = useToast();
  const queryClient = useQueryClient(appQueryClient);

  const bookingsQuery = useQuery(
    {
      queryKey: ['all-bookings'],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .order('date', { ascending: true })
          .order('start_time', { ascending: true });

        if (error) throw error;
        return data as Booking[];
      },
    },
    appQueryClient
  );

  const participantsQuery = useQuery(
    {
      queryKey: ['all-participants'],
      queryFn: async () => {
        const { data, error } = await supabase.from('booking_participants').select('*');

        if (error) throw error;
        return data as BookingParticipant[];
      },
    },
    appQueryClient
  );

  const bookingsWithParticipants: BookingWithParticipants[] = (bookingsQuery.data || []).map(
    (booking) => ({
      ...booking,
      session_type: booking.session_type as 'open' | 'closed',
      participants: (participantsQuery.data || []).filter((p) => p.booking_id === booking.id),
    })
  );

  const deleteBooking = useMutation(
    {
      mutationFn: async (bookingId: string) => {
        const { error } = await supabase.from('bookings').delete().eq('id', bookingId);

        if (error) throw error;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['all-bookings'] });
        toast({
          title: 'Booking Deleted',
          description: 'The booking has been removed.',
        });
      },
      onError: (error) => {
        toast({
          title: 'Failed to Delete',
          description: error.message,
          variant: 'destructive',
        });
      },
    },
    appQueryClient
  );

  return {
    bookings: bookingsWithParticipants,
    isLoading: bookingsQuery.isLoading || participantsQuery.isLoading,
    error: bookingsQuery.error || participantsQuery.error,
    deleteBooking,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: ['all-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['all-participants'] });
    },
  };
}

