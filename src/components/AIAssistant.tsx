import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, X, MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/lib/userContext';
import { format, addDays, isWeekend, parseISO } from 'date-fns';
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

export function AIAssistant() {
  const { user } = useUser();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [bookings, setBookings] = useState<BookingWithParticipants[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [conversationStep, setConversationStep] = useState<ConversationStep>('greeting');
  const [bookingState, setBookingState] = useState<BookingState>({});

  useEffect(() => {
    if (isOpen) {
      fetchBookings();
      if (conversationStep === 'greeting') {
        startConversation();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const startConversation = () => {
    const greeting = getTimeBasedGreeting();
    addBotMessage(
      `${greeting} ${user?.name || 'there'}! ⚽\n\nI'm here to help you book the pitch or join a game. When would you like to play?`,
      ['Today', 'Tomorrow', 'This weekend', 'Next week']
    );
    setConversationStep('ask_when');
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
    const isToday = format(targetDate, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd');
    
    const slots: { time: string; isAvailable: boolean; openSession?: BookingWithParticipants }[] = [];
    
    for (let hour = 8; hour < 20; hour++) {
      const timeStr = `${hour.toString().padStart(2, '0')}:00`;
      
      if (isToday && hour <= now.getHours()) continue;

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
        "I didn't quite catch that. Which day were you thinking?",
        ['Today', 'Tomorrow', 'This weekend', 'Next week']
      );
      return;
    }

    const dateStr = format(targetDate, 'yyyy-MM-dd');
    const dayName = format(targetDate, 'EEEE, MMMM d');
    const slots = getAvailableSlotsForDate(targetDate);

    if (slots.length === 0) {
      addBotMessage(
        `Hmm, ${dayName} looks fully booked! 😅 Want to try another day?`,
        ['Tomorrow', 'This weekend', 'Next week']
      );
      return;
    }

    // Separate open sessions and free slots
    const openSessions = slots.filter(s => s.openSession);
    const freeSlots = slots.filter(s => !s.openSession);

    setBookingState({ date: dateStr });

    let response = `Great choice! Here's what's available on **${dayName}**:\n\n`;
    const quickReplies: string[] = [];

    if (openSessions.length > 0) {
      response += `🎮 **Open games you can join:**\n`;
      openSessions.slice(0, 3).forEach(slot => {
        const session = slot.openSession!;
        const spotsLeft = (session.max_players || 10) - (session.participants.length + 1);
        response += `• ${slot.time} - ${session.created_by_name}'s game (${spotsLeft} spots left)\n`;
        quickReplies.push(`Join ${slot.time}`);
      });
      response += '\n';
    }

    if (freeSlots.length > 0) {
      response += `🏟️ **Empty slots to book:**\n`;
      const displaySlots = freeSlots.slice(0, 5);
      response += displaySlots.map(s => s.time).join(', ') + '\n';
      quickReplies.push(`Book ${freeSlots[0].time}`);
      if (freeSlots.length > 1) {
        quickReplies.push(`Book ${freeSlots[Math.floor(freeSlots.length / 2)].time}`);
      }
    }

    response += '\nWould you like to **join** an existing game or **book** a new slot?';
    
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
          `Perfect! You want to join **${session.created_by_name}'s game** at **${time}** on **${format(parseISO(dateStr), 'EEEE')}**.\n\nThere are ${spotsLeft} spots remaining. Ready to join?`,
          ['Yes, join now!', 'No, show other options']
        );
        setConversationStep('confirm_join');
        return;
      } else {
        addBotMessage(
          `I couldn't find an open session at ${time}. Would you like to book that slot instead?`,
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
          `That slot is already taken! Try another time or join an open game.`,
          ['Show available slots', 'Pick another day']
        );
        return;
      }

      setBookingState(prev => ({ ...prev, time }));
      addBotMessage(
        `Got it! You want to book **${time}** on **${format(parseISO(dateStr), 'EEEE')}**.\n\nWhat type of session would you like?\n\n• **Open** - Others can join your game\n• **Closed** - Private session, just you`,
        ['Open session', 'Closed session']
      );
      setConversationStep('ask_session_type');
      return;
    }

    // If just "join" or "book" without time
    if (lower.includes('join')) {
      const openSessions = bookings.filter(b => 
        b.date === bookingState.date && 
        b.session_type === 'open'
      );
      
      if (openSessions.length > 0) {
        const quickReplies = openSessions.slice(0, 4).map(s => `Join ${s.start_time}`);
        addBotMessage(
          `Which game would you like to join?`,
          quickReplies
        );
      } else {
        addBotMessage(
          `There are no open games to join on that day. Would you like to book a new slot instead?`,
          ['Yes, book a slot', 'Pick another day']
        );
      }
      return;
    }

    if (lower.includes('book')) {
      const slots = getAvailableSlotsForDate(parseISO(bookingState.date!)).filter(s => !s.openSession);
      if (slots.length > 0) {
        const quickReplies = slots.slice(0, 4).map(s => `Book ${s.time}`);
        addBotMessage(
          `What time would you like to book?`,
          quickReplies
        );
      } else {
        addBotMessage(
          `No empty slots available. Would you like to try another day?`,
          ['Tomorrow', 'This weekend', 'Next week']
        );
        setConversationStep('ask_when');
      }
      return;
    }

    // Fallback
    addBotMessage(
      `Would you like to join an existing open game or book a new slot?`,
      ['Join a game', 'Book a slot', 'Pick another day']
    );
  };

  const handleSessionTypeResponse = (userMessage: string) => {
    const lower = userMessage.toLowerCase();
    
    if (lower.includes('open')) {
      setBookingState(prev => ({ ...prev, sessionType: 'open' }));
      addBotMessage(
        `Great! How many players max should be able to join your open session?`,
        ['10 players', '14 players', '20 players']
      );
      setConversationStep('ask_max_players');
    } else if (lower.includes('closed') || lower.includes('private')) {
      setBookingState(prev => ({ ...prev, sessionType: 'closed', maxPlayers: undefined }));
      addBotMessage(
        `Private session it is! 🔒 How long do you need the pitch?`,
        ['1 hour', '2 hours']
      );
      setConversationStep('ask_duration');
    } else {
      addBotMessage(
        `Please choose a session type:`,
        ['Open session', 'Closed session']
      );
    }
  };

  const handleMaxPlayersResponse = (userMessage: string) => {
    const numMatch = userMessage.match(/(\d+)/);
    const maxPlayers = numMatch ? parseInt(numMatch[1]) : 14;
    
    setBookingState(prev => ({ ...prev, maxPlayers }));
    addBotMessage(
      `Perfect! ${maxPlayers} players max. How long do you need the pitch?`,
      ['1 hour', '2 hours']
    );
    setConversationStep('ask_duration');
  };

  const handleDurationResponse = async (userMessage: string) => {
    const duration = userMessage.includes('2') ? 2 : 1;
    const newState = { ...bookingState, duration };
    setBookingState(newState);

    const { date, time, sessionType } = newState;
    const dayName = format(parseISO(date!), 'EEEE, MMMM d');

    addBotMessage(
      `Here's your booking:\n\n📅 **${dayName}** at **${time}**\n⏱️ **${duration} hour${duration > 1 ? 's' : ''}**\n🎮 **${sessionType === 'open' ? `Open session (max ${newState.maxPlayers} players)` : 'Private session'}**\n\nShall I book this for you?`,
      ['Yes, book it!', 'No, start over']
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
          title: 'Booking Created! ⚽',
          description: `Your session on ${format(parseISO(date!), 'EEEE')} at ${time} is confirmed.`,
        });

        addBotMessage(
          `Done! ✅ Your ${sessionType} session is booked!\n\n${sessionType === 'open' ? '👥 Others can now join your game!' : '🔒 The pitch is all yours!'}\n\nSee you on the field! ⚽`,
          ['Book another session', 'Thanks, bye!']
        );
        setConversationStep('done');
        setBookingState({});
      } catch (error: any) {
        console.error('Booking error:', error);
        toast({
          title: 'Booking Failed',
          description: error.message,
          variant: 'destructive',
        });
        addBotMessage(
          `Oops, something went wrong! ${error.message}. Want to try again?`,
          ['Try again', 'Start over']
        );
      } finally {
        setIsLoading(false);
      }
    } else {
      resetConversation();
    }
  };

  const handleConfirmJoin = async (userMessage: string) => {
    const lower = userMessage.toLowerCase();
    
    if (lower.includes('yes') || lower.includes('join')) {
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
          title: 'Joined Session! 🎉',
          description: `You've joined ${session.created_by_name}'s game.`,
        });

        addBotMessage(
          `You're in! 🎉\n\nYou've joined **${session.created_by_name}'s game** on **${format(parseISO(session.date), 'EEEE')}** at **${session.start_time}**.\n\nHave a great game! ⚽`,
          ['Book my own session', 'Join another game', 'Thanks, bye!']
        );
        setConversationStep('done');
        setBookingState({});
      } catch (error: any) {
        console.error('Join error:', error);
        toast({
          title: 'Failed to Join',
          description: error.message,
          variant: 'destructive',
        });
        addBotMessage(
          `Oops, couldn't join. ${error.message}. Want to try again?`,
          ['Try again', 'Show other options']
        );
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
    addBotMessage(
      `No problem! When would you like to play?`,
      ['Today', 'Tomorrow', 'This weekend', 'Next week']
    );
    setConversationStep('ask_when');
  };

  const handleDoneResponse = (userMessage: string) => {
    const lower = userMessage.toLowerCase();
    
    if (lower.includes('book') || lower.includes('another')) {
      resetConversation();
    } else if (lower.includes('join')) {
      addBotMessage(
        `When would you like to join a game?`,
        ['Today', 'Tomorrow', 'This weekend']
      );
      setConversationStep('ask_when');
    } else if (lower.includes('bye') || lower.includes('thanks')) {
      addBotMessage(
        `Anytime! Have a great game! ⚽👋`,
        ['Start new booking']
      );
    } else {
      resetConversation();
    }
  };

  const processMessage = async (userMessage: string) => {
    addUserMessage(userMessage);
    
    // Handle "start over" or "cancel" at any point
    const lower = userMessage.toLowerCase();
    if (lower.includes('start over') || lower.includes('cancel') || lower.includes('reset')) {
      resetConversation();
      return;
    }

    // Handle "pick another day" or "different day"
    if (lower.includes('another day') || lower.includes('different day') || lower.includes('pick another')) {
      addBotMessage(
        `Sure! When would you like to play instead?`,
        ['Today', 'Tomorrow', 'This weekend', 'Next week']
      );
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
    await processMessage(userMessage);
  };

  const handleQuickReply = (reply: string) => {
    sendMessage(reply);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-primary shadow-lg z-50 animate-bounce hover:animate-none"
      >
        <MessageSquare className="w-6 h-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 w-[380px] max-w-[calc(100vw-3rem)] h-[520px] max-h-[calc(100vh-6rem)] shadow-xl z-50 flex flex-col animate-scale-in border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b shrink-0 bg-gradient-to-r from-primary/10 to-transparent">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span>Play Finder</span>
            <span className="text-xs font-normal text-muted-foreground">Book or join games</span>
          </div>
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsOpen(false)}>
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div key={index} className="space-y-2">
              <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted text-foreground rounded-bl-md'
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
                      onClick={() => handleQuickReply(reply)}
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
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Working on it...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <CardContent className="p-3 border-t shrink-0 bg-muted/30">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer..."
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
  );
}
