import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bot, Send, Loader2, Users, Clock, Calendar, 
  Trophy, Flame, Star, Zap, ChevronRight, Sparkles
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/lib/userContext';
import { format, addDays, isWeekend, parseISO, isToday, isTomorrow } from 'date-fns';
import { BookingWithParticipants } from '@/types/booking';
import { useToast } from '@/hooks/use-toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  quickReplies?: string[];
}

type ConversationStep = 
  | 'greeting'
  | 'ask_when'
  | 'show_options'
  | 'ask_action'
  | 'ask_session_type'
  | 'ask_max_players'
  | 'ask_duration'
  | 'confirm_booking'
  | 'confirm_join'
  | 'done';

interface BookingState {
  date?: string;
  time?: string;
  sessionType?: 'open' | 'closed';
  maxPlayers?: number;
  duration?: number;
  bookingToJoin?: BookingWithParticipants;
}

export function FootballBookingExperience() {
  const { user } = useUser();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [bookings, setBookings] = useState<BookingWithParticipants[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [conversationStep, setConversationStep] = useState<ConversationStep>('greeting');
  const [bookingState, setBookingState] = useState<BookingState>({});
  const [hasStartedChat, setHasStartedChat] = useState(false);

  useEffect(() => {
    fetchBookings();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const startConversation = (initialMessage?: string) => {
    setHasStartedChat(true);
    if (messages.length === 0) {
      const greeting = getTimeBasedGreeting();
      addBotMessage(
        `${greeting} ${user?.name || 'there'}! ⚽\n\nReady to hit the pitch? Tell me when you'd like to play!`,
        ['Today', 'Tomorrow', 'This weekend', 'Next week']
      );
      setConversationStep('ask_when');
    }
    if (initialMessage) {
      setTimeout(() => processMessage(initialMessage), 500);
    }
  };

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const addBotMessage = (content: string, quickReplies?: string[]) => {
    setMessages(prev => [...prev, { role: 'assistant', content, quickReplies }]);
  };

  const addUserMessage = (content: string) => {
    setMessages(prev => [...prev, { role: 'user', content }]);
  };

  const fetchBookings = async () => {
    try {
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .gte('date', format(new Date(), 'yyyy-MM-dd'))
        .order('date', { ascending: true });

      if (bookingsError) throw bookingsError;

      const { data: participantsData, error: participantsError } = await supabase
        .from('booking_participants')
        .select('*');

      if (participantsError) throw participantsError;

      const bookingsWithParticipants = (bookingsData || []).map((booking) => ({
        ...booking,
        session_type: booking.session_type as 'open' | 'closed',
        participants: (participantsData || []).filter((p) => p.booking_id === booking.id),
      }));

      setBookings(bookingsWithParticipants);
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
    }
  };

  // Get recommendations
  const getOpenGamesToJoin = () => {
    return bookings
      .filter(b => b.session_type === 'open')
      .filter(b => {
        const spotsLeft = (b.max_players || 10) - (b.participants.length + 1);
        return spotsLeft > 0;
      })
      .slice(0, 3);
  };

  const getPopularTimes = () => {
    const timeCounts: Record<string, number> = {};
    bookings.forEach(b => {
      timeCounts[b.start_time] = (timeCounts[b.start_time] || 0) + 1;
    });
    return Object.entries(timeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([time]) => time);
  };

  const getTodayGames = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return bookings.filter(b => b.date === today && b.session_type === 'open');
  };

  const findDateByDayName = (dayName: string): Date | null => {
    const lower = dayName.toLowerCase();
    const today = new Date();
    
    if (lower.includes('today') || lower.includes('now')) return today;
    if (lower.includes('tomorrow')) return addDays(today, 1);
    
    if (lower.includes('weekend')) {
      for (let i = 0; i <= 7; i++) {
        const d = addDays(today, i);
        if (isWeekend(d)) return d;
      }
    }

    if (lower.includes('next week')) {
      return addDays(today, 7);
    }
    
    const dayMap: Record<string, number> = {
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
      'thursday': 4, 'friday': 5, 'saturday': 6
    };
    
    for (const [day, num] of Object.entries(dayMap)) {
      if (lower.includes(day)) {
        const currentDay = today.getDay();
        let daysUntil = num - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        return addDays(today, daysUntil);
      }
    }
    
    return null;
  };

  const getAvailableSlotsForDate = (targetDate: Date) => {
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    const now = new Date();
    const isTodayDate = format(targetDate, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd');
    
    const slots: { time: string; isAvailable: boolean; openSession?: BookingWithParticipants }[] = [];
    
    for (let hour = 8; hour < 20; hour++) {
      const timeStr = `${hour.toString().padStart(2, '0')}:00`;
      
      if (isTodayDate && hour <= now.getHours()) continue;

      const existingBooking = bookings.find(
        (b) => b.date === dateStr && b.start_time === timeStr
      );

      if (!existingBooking) {
        slots.push({ time: timeStr, isAvailable: true });
      } else if (existingBooking.session_type === 'open') {
        const spotsLeft = (existingBooking.max_players || 10) - (existingBooking.participants.length + 1);
        if (spotsLeft > 0) {
          slots.push({ time: timeStr, isAvailable: true, openSession: existingBooking });
        }
      }
    }
    return slots;
  };

  const handleWhenResponse = (userMessage: string) => {
    const targetDate = findDateByDayName(userMessage);
    
    if (!targetDate) {
      addBotMessage(
        "I didn't quite catch that. Which day works for you?",
        ['Today', 'Tomorrow', 'This weekend', 'Next week']
      );
      return;
    }

    const dateStr = format(targetDate, 'yyyy-MM-dd');
    const dayName = format(targetDate, 'EEEE, MMMM d');
    const slots = getAvailableSlotsForDate(targetDate);

    if (slots.length === 0) {
      addBotMessage(
        `Looks like ${dayName} is fully booked! 😅 Try another day?`,
        ['Tomorrow', 'This weekend', 'Next week']
      );
      return;
    }

    const openSessions = slots.filter(s => s.openSession);
    const freeSlots = slots.filter(s => !s.openSession);

    setBookingState({ date: dateStr });

    let response = `Here's what's available on **${dayName}**:\n\n`;
    const quickReplies: string[] = [];

    if (openSessions.length > 0) {
      response += `🎮 **Games to join:**\n`;
      openSessions.slice(0, 3).forEach(slot => {
        const session = slot.openSession!;
        const spotsLeft = (session.max_players || 10) - (session.participants.length + 1);
        response += `• ${slot.time} - ${session.created_by_name}'s match (${spotsLeft} spots)\n`;
        quickReplies.push(`Join ${slot.time}`);
      });
      response += '\n';
    }

    if (freeSlots.length > 0) {
      response += `🏟️ **Available slots:**\n`;
      const displaySlots = freeSlots.slice(0, 5);
      response += displaySlots.map(s => s.time).join(', ') + '\n';
      quickReplies.push(`Book ${freeSlots[0].time}`);
      if (freeSlots.length > 1) {
        quickReplies.push(`Book ${freeSlots[Math.floor(freeSlots.length / 2)].time}`);
      }
    }

    response += '\nWant to **join** a game or **book** your own slot?';
    
    addBotMessage(response, quickReplies);
    setConversationStep('ask_action');
  };

  const handleActionResponse = (userMessage: string) => {
    const lower = userMessage.toLowerCase();
    const timeMatch = userMessage.match(/(\d{1,2}):?(\d{2})?/);
    const time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:00` : null;

    if (lower.includes('join') && time) {
      const dateStr = bookingState.date!;
      const session = bookings.find(b => 
        b.date === dateStr && 
        b.start_time === time && 
        b.session_type === 'open'
      );

      if (session) {
        const spotsLeft = (session.max_players || 10) - (session.participants.length + 1);
        setBookingState(prev => ({ ...prev, time, bookingToJoin: session }));
        
        addBotMessage(
          `Joining **${session.created_by_name}'s game** at **${time}**!\n\n${spotsLeft} spots left. Ready to play?`,
          ['Yes, count me in!', 'Show other options']
        );
        setConversationStep('confirm_join');
        return;
      } else {
        addBotMessage(
          `No open session at ${time}. Want to book that slot instead?`,
          [`Book ${time}`, 'Show available slots']
        );
        return;
      }
    }

    if (lower.includes('book') && time) {
      const dateStr = bookingState.date!;
      const existingBooking = bookings.find(b => b.date === dateStr && b.start_time === time);
      
      if (existingBooking) {
        addBotMessage(
          `That slot's taken! Try another time.`,
          ['Show available slots', 'Pick another day']
        );
        return;
      }

      setBookingState(prev => ({ ...prev, time }));
      addBotMessage(
        `Booking **${time}** on **${format(parseISO(dateStr), 'EEEE')}**!\n\nWhat type of session?\n\n• **Open** - Others can join\n• **Closed** - Just you`,
        ['Open session', 'Closed session']
      );
      setConversationStep('ask_session_type');
      return;
    }

    if (lower.includes('join')) {
      const openSessions = bookings.filter(b => 
        b.date === bookingState.date && 
        b.session_type === 'open'
      );
      
      if (openSessions.length > 0) {
        const quickReplies = openSessions.slice(0, 4).map(s => `Join ${s.start_time}`);
        addBotMessage(`Which game?`, quickReplies);
      } else {
        addBotMessage(
          `No open games that day. Book a new slot instead?`,
          ['Yes, book a slot', 'Pick another day']
        );
      }
      return;
    }

    if (lower.includes('book')) {
      const slots = getAvailableSlotsForDate(parseISO(bookingState.date!)).filter(s => !s.openSession);
      if (slots.length > 0) {
        const quickReplies = slots.slice(0, 4).map(s => `Book ${s.time}`);
        addBotMessage(`What time?`, quickReplies);
      } else {
        addBotMessage(
          `No empty slots. Try another day?`,
          ['Tomorrow', 'This weekend', 'Next week']
        );
        setConversationStep('ask_when');
      }
      return;
    }

    addBotMessage(
      `Join an existing game or book your own?`,
      ['Join a game', 'Book a slot', 'Pick another day']
    );
  };

  const handleSessionTypeResponse = (userMessage: string) => {
    const lower = userMessage.toLowerCase();
    
    if (lower.includes('open')) {
      setBookingState(prev => ({ ...prev, sessionType: 'open' }));
      addBotMessage(
        `How many players max?`,
        ['10 players', '14 players', '20 players']
      );
      setConversationStep('ask_max_players');
    } else if (lower.includes('closed') || lower.includes('private')) {
      setBookingState(prev => ({ ...prev, sessionType: 'closed', maxPlayers: undefined }));
      addBotMessage(
        `Private match! 🔒 How long do you need?`,
        ['1 hour', '2 hours']
      );
      setConversationStep('ask_duration');
    } else {
      addBotMessage(`Choose a session type:`, ['Open session', 'Closed session']);
    }
  };

  const handleMaxPlayersResponse = (userMessage: string) => {
    const numMatch = userMessage.match(/(\d+)/);
    const maxPlayers = numMatch ? parseInt(numMatch[1]) : 14;
    
    setBookingState(prev => ({ ...prev, maxPlayers }));
    addBotMessage(`${maxPlayers} players max. Duration?`, ['1 hour', '2 hours']);
    setConversationStep('ask_duration');
  };

  const handleDurationResponse = async (userMessage: string) => {
    const duration = userMessage.includes('2') ? 2 : 1;
    const newState = { ...bookingState, duration };
    setBookingState(newState);

    const { date, time, sessionType } = newState;
    const dayName = format(parseISO(date!), 'EEEE, MMMM d');

    addBotMessage(
      `📋 **Your booking:**\n\n📅 ${dayName} at ${time}\n⏱️ ${duration} hour${duration > 1 ? 's' : ''}\n🎮 ${sessionType === 'open' ? `Open (max ${newState.maxPlayers})` : 'Private'}\n\nLock it in?`,
      ['Yes, book it!', 'Start over']
    );
    setConversationStep('confirm_booking');
  };

  const handleConfirmBooking = async (userMessage: string) => {
    const lower = userMessage.toLowerCase();
    
    if (lower.includes('yes') || lower.includes('book')) {
      setIsLoading(true);
      try {
        const { date, time, sessionType, duration, maxPlayers } = bookingState;
        
        const { error } = await supabase.from('bookings').insert({
          created_by_name: user!.name,
          created_by_level: user!.level,
          date: date!,
          start_time: time!,
          duration: duration || 1,
          session_type: sessionType || 'open',
          max_players: sessionType === 'open' ? (maxPlayers || 14) : null,
        });

        if (error) throw error;
        
        await fetchBookings();
        toast({
          title: 'Booked! ⚽',
          description: `${format(parseISO(date!), 'EEEE')} at ${time} is yours.`,
        });

        addBotMessage(
          `✅ **You're all set!**\n\n${sessionType === 'open' ? '👥 Players can now join your game!' : '🔒 The pitch is yours!'}\n\nSee you on the field! ⚽`,
          ['Book another', 'Done!']
        );
        setConversationStep('done');
        setBookingState({});
      } catch (error: any) {
        toast({
          title: 'Booking Failed',
          description: error.message,
          variant: 'destructive',
        });
        addBotMessage(`Something went wrong. Try again?`, ['Try again', 'Start over']);
      } finally {
        setIsLoading(false);
      }
    } else {
      resetConversation();
    }
  };

  const handleConfirmJoin = async (userMessage: string) => {
    const lower = userMessage.toLowerCase();
    
    if (lower.includes('yes') || lower.includes('count me')) {
      setIsLoading(true);
      try {
        const session = bookingState.bookingToJoin!;
        
        const { error } = await supabase.from('booking_participants').insert({
          booking_id: session.id,
          player_name: user!.name,
          player_level: user!.level,
        });

        if (error) throw error;
        
        await fetchBookings();
        toast({
          title: 'Joined! 🎉',
          description: `You're in ${session.created_by_name}'s game.`,
        });

        addBotMessage(
          `🎉 **You're in!**\n\nJoined ${session.created_by_name}'s match on ${format(parseISO(session.date), 'EEEE')} at ${session.start_time}.\n\nLet's gooo! ⚽`,
          ['Book my own', 'Join another', 'Done!']
        );
        setConversationStep('done');
        setBookingState({});
      } catch (error: any) {
        toast({
          title: 'Failed to Join',
          description: error.message,
          variant: 'destructive',
        });
        addBotMessage(`Couldn't join. Try again?`, ['Try again', 'Show other options']);
      } finally {
        setIsLoading(false);
      }
    } else {
      handleWhenResponse(format(parseISO(bookingState.date!), 'EEEE'));
      setConversationStep('ask_action');
    }
  };

  const resetConversation = () => {
    setBookingState({});
    addBotMessage(`When would you like to play?`, ['Today', 'Tomorrow', 'This weekend', 'Next week']);
    setConversationStep('ask_when');
  };

  const handleDoneResponse = (userMessage: string) => {
    const lower = userMessage.toLowerCase();
    
    if (lower.includes('book') || lower.includes('another')) {
      resetConversation();
    } else if (lower.includes('join')) {
      addBotMessage(`When?`, ['Today', 'Tomorrow', 'This weekend']);
      setConversationStep('ask_when');
    } else if (lower.includes('done') || lower.includes('bye') || lower.includes('thanks')) {
      addBotMessage(`See you on the pitch! ⚽👋`, ['Start new booking']);
    } else {
      resetConversation();
    }
  };

  const processMessage = async (userMessage: string) => {
    addUserMessage(userMessage);
    
    const lower = userMessage.toLowerCase();
    if (lower.includes('start over') || lower.includes('cancel') || lower.includes('reset')) {
      resetConversation();
      return;
    }

    if (lower.includes('another day') || lower.includes('different day') || lower.includes('pick another')) {
      addBotMessage(`Sure! When?`, ['Today', 'Tomorrow', 'This weekend', 'Next week']);
      setConversationStep('ask_when');
      return;
    }

    switch (conversationStep) {
      case 'ask_when':
        handleWhenResponse(userMessage);
        break;
      case 'ask_action':
      case 'show_options':
        handleActionResponse(userMessage);
        break;
      case 'ask_session_type':
        handleSessionTypeResponse(userMessage);
        break;
      case 'ask_max_players':
        handleMaxPlayersResponse(userMessage);
        break;
      case 'ask_duration':
        await handleDurationResponse(userMessage);
        break;
      case 'confirm_booking':
        await handleConfirmBooking(userMessage);
        break;
      case 'confirm_join':
        await handleConfirmJoin(userMessage);
        break;
      case 'done':
        handleDoneResponse(userMessage);
        break;
      default:
        resetConversation();
    }
  };

  const sendMessage = async (messageText?: string) => {
    const userMessage = (messageText || input).trim();
    if (!userMessage || isLoading) return;

    setInput('');
    if (!hasStartedChat) {
      startConversation(userMessage);
    } else {
      await processMessage(userMessage);
    }
  };

  const handleQuickAction = (action: string) => {
    if (!hasStartedChat) {
      startConversation(action);
    } else {
      sendMessage(action);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const openGames = getOpenGamesToJoin();
  const popularTimes = getPopularTimes();
  const todayGames = getTodayGames();

  const formatDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Football field pattern background */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px),
              linear-gradient(hsl(var(--primary)) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px'
          }} />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-primary" />
          <div className="absolute top-1/2 left-1/2 w-32 h-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary" />
        </div>

        <div className="container px-4 py-12 relative">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4" />
              AI-Powered Booking
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3">
              Book Your <span className="text-primary">Match</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-md mx-auto">
              Join games or book the pitch with our smart assistant
            </p>
          </div>

          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
            {/* Today's Games */}
            <Card className="bg-card/80 backdrop-blur border-primary/20 hover:border-primary/40 transition-all hover:shadow-lg cursor-pointer group"
                  onClick={() => handleQuickAction('Today')}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Flame className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Today's Games</h3>
                    <p className="text-xs text-muted-foreground">{todayGames.length} open sessions</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Quick join available</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardContent>
            </Card>

            {/* Popular Times */}
            <Card className="bg-card/80 backdrop-blur border-accent/20 hover:border-accent/40 transition-all hover:shadow-lg cursor-pointer group"
                  onClick={() => handleQuickAction('Tomorrow')}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                    <Clock className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Popular Times</h3>
                    <p className="text-xs text-muted-foreground">
                      {popularTimes.length > 0 ? popularTimes.join(', ') : 'Evening slots'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Book tomorrow</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors" />
                </div>
              </CardContent>
            </Card>

            {/* Weekend Match */}
            <Card className="bg-card/80 backdrop-blur border-info/20 hover:border-info/40 transition-all hover:shadow-lg cursor-pointer group"
                  onClick={() => handleQuickAction('This weekend')}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center group-hover:bg-info/20 transition-colors">
                    <Trophy className="w-5 h-5 text-info" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Weekend Match</h3>
                    <p className="text-xs text-muted-foreground">Sat & Sun slots</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Plan ahead</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-info transition-colors" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container px-4 pb-12">
        <div className="grid lg:grid-cols-[1fr_400px] gap-6 max-w-6xl mx-auto">
          {/* Open Games to Join */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Open Games
              </h2>
              <Badge variant="secondary" className="text-xs">
                {openGames.length} available
              </Badge>
            </div>

            {openGames.length > 0 ? (
              <div className="grid gap-3">
                {openGames.map((game) => {
                  const spotsLeft = (game.max_players || 10) - (game.participants.length + 1);
                  return (
                    <Card 
                      key={game.id} 
                      className="group hover:shadow-md transition-all cursor-pointer border-border hover:border-primary/30"
                      onClick={() => {
                        setBookingState({ date: game.date, bookingToJoin: game });
                        handleQuickAction(`Join ${game.start_time}`);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                              <Zap className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground">{game.created_by_name}'s Game</span>
                                <Badge variant="outline" className="text-xs">
                                  Level {game.created_by_level}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5" />
                                  {formatDateLabel(game.date)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" />
                                  {game.start_time}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="w-3.5 h-3.5" />
                                  {spotsLeft} spots
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Join
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                    <Users className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">No open games yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Be the first to create an open session!
                  </p>
                  <Button onClick={() => startConversation('Today')} variant="outline">
                    Start a Game
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* AI Chat Interface */}
          <Card className="h-[600px] flex flex-col shadow-lg border-primary/10">
            <CardHeader className="flex flex-row items-center gap-3 py-4 px-5 border-b bg-gradient-to-r from-primary/5 to-transparent shrink-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base font-semibold">Pitch Assistant</CardTitle>
                <p className="text-xs text-muted-foreground">AI-powered booking</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-xs text-muted-foreground">Online</span>
              </div>
            </CardHeader>

            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              {!hasStartedChat ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4">
                  <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <Star className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">Ready to play?</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-[240px]">
                    I'll help you find a game or book the pitch in seconds!
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {['Play today', 'Tomorrow', 'This weekend'].map((option) => (
                      <Button
                        key={option}
                        variant="outline"
                        size="sm"
                        onClick={() => startConversation(option)}
                        className="rounded-full border-primary/30 hover:bg-primary/10 hover:text-primary"
                      >
                        {option}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message, index) => (
                    <div key={index} className="space-y-2">
                      <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : 'bg-muted text-foreground rounded-bl-sm'
                          }`}
                        >
                          {message.content}
                        </div>
                      </div>
                      {message.role === 'assistant' && message.quickReplies && index === messages.length - 1 && !isLoading && (
                        <div className="flex flex-wrap gap-2 pl-2">
                          {message.quickReplies.map((reply, i) => (
                            <Button
                              key={i}
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 rounded-full border-primary/30 hover:bg-primary/10 hover:text-primary"
                              onClick={() => sendMessage(reply)}
                            >
                              {reply}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">Checking...</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            <CardContent className="p-3 border-t shrink-0 bg-muted/30">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={hasStartedChat ? "Type your answer..." : "When do you want to play?"}
                  className="flex-1 h-10 px-4 rounded-full bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  disabled={isLoading}
                />
                <Button
                  size="icon"
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isLoading}
                  className="bg-primary hover:bg-primary/90 rounded-full h-10 w-10"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
