import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, X, MessageSquare, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/lib/userContext';
import { format, addDays, isWeekend, parseISO } from 'date-fns';
import { BookingWithParticipants } from '@/types/booking';
import { useToast } from '@/hooks/use-toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  quickReplies?: string[];
  action?: {
    type: 'book' | 'join';
    data: any;
  };
}

interface TimeSlot {
  date: Date;
  time: string;
  isAvailable: boolean;
  openSession?: BookingWithParticipants;
}

interface PendingAction {
  type: 'book' | 'join';
  date: string;
  time: string;
  sessionType?: 'open' | 'closed';
  duration?: number;
  maxPlayers?: number;
  bookingId?: string;
  hostName?: string;
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
  const [hasGreeted, setHasGreeted] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchBookings();
      if (!hasGreeted) {
        startConversation();
        setHasGreeted(true);
      }
    }
  }, [isOpen]);

  const startConversation = () => {
    const greeting = getTimeBasedGreeting();
    setMessages([
      {
        role: 'assistant',
        content: `${greeting} ${user?.name || 'there'}! ⚽ Ready to play? When are you thinking of hitting the pitch?`,
        quickReplies: ['Today', 'Tomorrow', 'This weekend', 'Show available slots'],
      },
    ]);
  };

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const findAvailableSlots = (targetDate: Date): TimeSlot[] => {
    const slots: TimeSlot[] = [];
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    const now = new Date();
    
    for (let hour = 8; hour < 20; hour++) {
      const timeStr = `${hour.toString().padStart(2, '0')}:00`;
      
      if (format(targetDate, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd') && hour <= now.getHours()) {
        continue;
      }

      const conflictingBooking = bookings.find(
        (b) => b.date === dateStr && b.start_time === timeStr
      );

      if (!conflictingBooking) {
        slots.push({ date: targetDate, time: timeStr, isAvailable: true });
      } else if (conflictingBooking.session_type === 'open') {
        const spotsLeft = (conflictingBooking.max_players || 10) - (conflictingBooking.participants.length + 1);
        if (spotsLeft > 0) {
          slots.push({ 
            date: targetDate, 
            time: timeStr, 
            isAvailable: true, 
            openSession: conflictingBooking 
          });
        }
      }
    }
    return slots;
  };

  const createBooking = async (date: string, time: string, sessionType: 'open' | 'closed', duration: number, maxPlayers?: number) => {
    if (!user) return false;
    
    try {
      const { error } = await supabase.from('bookings').insert({
        created_by_name: user.name,
        created_by_level: user.level,
        date,
        start_time: time,
        duration,
        session_type: sessionType,
        max_players: sessionType === 'open' ? (maxPlayers || 14) : null,
      });

      if (error) throw error;
      
      await fetchBookings();
      toast({
        title: 'Booking Created! ⚽',
        description: `Your ${sessionType} session on ${format(parseISO(date), 'EEEE')} at ${time} is confirmed.`,
      });
      return true;
    } catch (error: any) {
      console.error('Failed to create booking:', error);
      toast({
        title: 'Booking Failed',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  const joinSession = async (bookingId: string) => {
    if (!user) return false;
    
    try {
      const { error } = await supabase.from('booking_participants').insert({
        booking_id: bookingId,
        player_name: user.name,
        player_level: user.level,
      });

      if (error) throw error;
      
      await fetchBookings();
      toast({
        title: 'Joined Session! 🎉',
        description: 'You have successfully joined the open session.',
      });
      return true;
    } catch (error: any) {
      console.error('Failed to join session:', error);
      toast({
        title: 'Failed to Join',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  const getRecommendations = (userIntent: string): { message: string; quickReplies: string[] } => {
    const today = new Date();
    let targetDates: Date[] = [];
    let contextMessage = '';

    const lowerIntent = userIntent.toLowerCase();

    if (lowerIntent.includes('today') || lowerIntent.includes('now')) {
      targetDates = [today];
      contextMessage = "today";
    } else if (lowerIntent.includes('tomorrow')) {
      targetDates = [addDays(today, 1)];
      contextMessage = "tomorrow";
    } else if (lowerIntent.includes('weekend') || lowerIntent.includes('saturday') || lowerIntent.includes('sunday')) {
      for (let i = 0; i <= 7; i++) {
        const d = addDays(today, i);
        if (isWeekend(d)) targetDates.push(d);
        if (targetDates.length >= 2) break;
      }
      contextMessage = "this weekend";
    } else if (lowerIntent.includes('available') || lowerIntent.includes('slot') || lowerIntent.includes('show')) {
      targetDates = [today, addDays(today, 1), addDays(today, 2)];
      contextMessage = "the next few days";
    } else {
      targetDates = [today, addDays(today, 1)];
      contextMessage = "soon";
    }

    let allSlots: TimeSlot[] = [];
    targetDates.forEach(date => {
      allSlots = [...allSlots, ...findAvailableSlots(date)];
    });

    if (allSlots.length === 0) {
      return {
        message: `Hmm, looks like ${contextMessage} is pretty packed! 😅 Want me to check other days?`,
        quickReplies: ['Check next week', 'Show all bookings']
      };
    }

    const openSessions = allSlots.filter(s => s.openSession);
    const freeSlots = allSlots.filter(s => !s.openSession);

    let response = `Here's what I found for ${contextMessage}:\n\n`;
    const quickReplies: string[] = [];

    if (openSessions.length > 0) {
      response += `🎮 **Join an open game:**\n`;
      openSessions.slice(0, 3).forEach((slot, i) => {
        const spotsLeft = (slot.openSession!.max_players || 10) - (slot.openSession!.participants.length + 1);
        const dayName = format(slot.date, 'EEEE');
        response += `${i + 1}. ${dayName} at ${slot.time} - ${spotsLeft} spots (${slot.openSession!.created_by_name}'s game)\n`;
        quickReplies.push(`Join ${dayName} ${slot.time}`);
      });
      response += '\n';
    }

    if (freeSlots.length > 0) {
      response += `🏟️ **Book a new slot:**\n`;
      const byDate = new Map<string, TimeSlot[]>();
      freeSlots.forEach(slot => {
        const dateKey = format(slot.date, 'yyyy-MM-dd');
        if (!byDate.has(dateKey)) byDate.set(dateKey, []);
        byDate.get(dateKey)!.push(slot);
      });
      
      let slotIndex = 0;
      byDate.forEach((slots, dateKey) => {
        if (slotIndex >= 3) return;
        const date = parseISO(dateKey);
        const dayName = format(date, 'EEEE');
        const displayTimes = slots.slice(0, 3).map(s => s.time).join(', ');
        response += `• ${dayName}: ${displayTimes}\n`;
        
        if (quickReplies.length < 4) {
          quickReplies.push(`Book ${dayName} ${slots[0].time}`);
        }
        slotIndex++;
      });
    }

    response += `\nTap a quick action or tell me what works for you! 🎯`;
    
    if (quickReplies.length === 0) {
      quickReplies.push('Check another day');
    }

    return { message: response, quickReplies };
  };

  const handleBookingIntent = (userMessage: string): { handled: boolean; response?: string; quickReplies?: string[]; action?: PendingAction } => {
    const lower = userMessage.toLowerCase();
    
    // Handle confirmation of pending action
    if (pendingAction && (lower.includes('yes') || lower.includes('confirm') || lower.includes('do it') || lower.includes('book it') || lower === 'yes')) {
      return { handled: true }; // Will be handled in sendMessage
    }

    // Handle cancellation
    if (pendingAction && (lower.includes('no') || lower.includes('cancel') || lower.includes('nevermind'))) {
      setPendingAction(null);
      return {
        handled: true,
        response: "No problem! What else can I help you with? ⚽",
        quickReplies: ['Today', 'Tomorrow', 'This weekend']
      };
    }

    // Parse "Join [Day] [Time]" pattern
    const joinMatch = lower.match(/join\s+(\w+)\s+(\d{1,2}):?(\d{2})?/i);
    if (joinMatch) {
      const dayName = joinMatch[1];
      const hour = joinMatch[2].padStart(2, '0');
      const time = `${hour}:00`;
      
      const targetDate = findDateByDayName(dayName);
      if (targetDate) {
        const dateStr = format(targetDate, 'yyyy-MM-dd');
        const session = bookings.find(b => 
          b.date === dateStr && 
          b.start_time === time && 
          b.session_type === 'open'
        );
        
        if (session) {
          const spotsLeft = (session.max_players || 10) - (session.participants.length + 1);
          if (spotsLeft > 0) {
            const action: PendingAction = {
              type: 'join',
              date: dateStr,
              time,
              bookingId: session.id,
              hostName: session.created_by_name
            };
            setPendingAction(action);
            return {
              handled: true,
              response: `Great choice! 🎉 You're about to join ${session.created_by_name}'s game on ${format(targetDate, 'EEEE')} at ${time}.\n\n${spotsLeft} spots remaining.\n\nShall I add you to this session?`,
              quickReplies: ['Yes, join!', 'No, show other options']
            };
          }
        }
      }
    }

    // Parse "Book [Day] [Time]" pattern
    const bookMatch = lower.match(/book\s+(\w+)\s+(\d{1,2}):?(\d{2})?/i);
    if (bookMatch) {
      const dayName = bookMatch[1];
      const hour = bookMatch[2].padStart(2, '0');
      const time = `${hour}:00`;
      
      const targetDate = findDateByDayName(dayName);
      if (targetDate) {
        const dateStr = format(targetDate, 'yyyy-MM-dd');
        
        // Check if slot is available
        const conflicting = bookings.find(b => b.date === dateStr && b.start_time === time);
        if (!conflicting) {
          const action: PendingAction = {
            type: 'book',
            date: dateStr,
            time,
            sessionType: 'open',
            duration: 1,
            maxPlayers: 14
          };
          setPendingAction(action);
          return {
            handled: true,
            response: `Perfect! 🏟️ Let's book ${format(targetDate, 'EEEE')} at ${time}.\n\nWhat type of session?\n• **Open** - Others can join your game\n• **Closed** - Private session just for you`,
            quickReplies: ['Open session', 'Closed session']
          };
        } else {
          return {
            handled: true,
            response: `That slot is already taken! 😅 Want me to show you what's available?`,
            quickReplies: ['Show available slots', 'Check another day']
          };
        }
      }
    }

    // Handle session type selection for pending booking
    if (pendingAction?.type === 'book' && !pendingAction.sessionType) {
      if (lower.includes('open')) {
        setPendingAction({ ...pendingAction, sessionType: 'open' });
        return {
          handled: true,
          response: `Got it - open session! 👥 How many players max? (I'll default to 14 if you're not sure)`,
          quickReplies: ['14 players', '10 players', '20 players', 'Just book it']
        };
      }
      if (lower.includes('closed') || lower.includes('private')) {
        setPendingAction({ ...pendingAction, sessionType: 'closed' });
        return {
          handled: true,
          response: `Private session it is! 🔒\n\nReady to book ${format(parseISO(pendingAction.date), 'EEEE')} at ${pendingAction.time} for 1 hour?\n\n(Say "2 hours" if you want a longer session)`,
          quickReplies: ['Yes, book it!', '2 hours instead', 'Cancel']
        };
      }
    }

    // Handle max players or duration
    if (pendingAction?.type === 'book' && pendingAction.sessionType) {
      const playerMatch = lower.match(/(\d+)\s*player/);
      if (playerMatch) {
        setPendingAction({ ...pendingAction, maxPlayers: parseInt(playerMatch[1]) });
      }
      
      if (lower.includes('2 hour')) {
        setPendingAction({ ...pendingAction, duration: 2 });
        return {
          handled: true,
          response: `2-hour session! Ready to confirm ${format(parseISO(pendingAction.date), 'EEEE')} at ${pendingAction.time}?`,
          quickReplies: ['Yes, book it!', 'Cancel']
        };
      }
    }

    return { handled: false };
  };

  const findDateByDayName = (dayName: string): Date | null => {
    const lower = dayName.toLowerCase();
    const today = new Date();
    
    if (lower === 'today') return today;
    if (lower === 'tomorrow') return addDays(today, 1);
    
    const dayMap: Record<string, number> = {
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
      'thursday': 4, 'friday': 5, 'saturday': 6
    };
    
    const targetDay = dayMap[lower];
    if (targetDay !== undefined) {
      const currentDay = today.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      return addDays(today, daysUntil);
    }
    
    return null;
  };

  const sendMessage = async (messageText?: string) => {
    const userMessage = (messageText || input).trim();
    if (!userMessage || isLoading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // Handle confirmation of pending action
      const lower = userMessage.toLowerCase();
      if (pendingAction && (lower.includes('yes') || lower.includes('confirm') || lower.includes('do it') || lower.includes('book it') || lower === 'yes' || lower.includes('just book'))) {
        let success = false;
        
        if (pendingAction.type === 'join' && pendingAction.bookingId) {
          success = await joinSession(pendingAction.bookingId);
          if (success) {
            setMessages((prev) => [
              ...prev,
              { 
                role: 'assistant', 
                content: `You're in! 🎉 See you on ${format(parseISO(pendingAction.date), 'EEEE')} at ${pendingAction.time}. Have a great game!`,
                quickReplies: ['Book another slot', 'Show my bookings']
              },
            ]);
          }
        } else if (pendingAction.type === 'book') {
          success = await createBooking(
            pendingAction.date,
            pendingAction.time,
            pendingAction.sessionType || 'open',
            pendingAction.duration || 1,
            pendingAction.maxPlayers
          );
          if (success) {
            const sessionType = pendingAction.sessionType || 'open';
            setMessages((prev) => [
              ...prev,
              { 
                role: 'assistant', 
                content: `Booked! ✅ Your ${sessionType} session on ${format(parseISO(pendingAction.date), 'EEEE')} at ${pendingAction.time} is confirmed.\n\n${sessionType === 'open' ? 'Others can now join your game!' : 'The pitch is all yours!'} ⚽`,
                quickReplies: ['Book another', 'Show my bookings', 'Thanks!']
              },
            ]);
          }
        }

        if (!success) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: "Oops, something went wrong. Let's try again!", quickReplies: ['Try again', 'Show available slots'] },
          ]);
        }

        setPendingAction(null);
        setIsLoading(false);
        return;
      }

      // Check for booking/joining intents
      const bookingIntent = handleBookingIntent(userMessage);
      if (bookingIntent.handled && bookingIntent.response) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: bookingIntent.response, quickReplies: bookingIntent.quickReplies },
        ]);
        setIsLoading(false);
        return;
      }

      // Check for availability queries
      const isAvailabilityQuery = 
        lower.includes('today') ||
        lower.includes('tomorrow') ||
        lower.includes('weekend') ||
        lower.includes('available') ||
        lower.includes('slot') ||
        lower.includes('when') ||
        lower.includes('show');

      if (isAvailabilityQuery) {
        const { message, quickReplies } = getRecommendations(userMessage);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: message, quickReplies },
        ]);
        setIsLoading(false);
        return;
      }

      // For other queries, use AI
      const bookingsContext = getBookingsContext();
      const systemContext = `You are a friendly football pitch booking chatbot. Help users book sessions or join games.

Current user: ${user?.name} (Level ${user?.level})
Current date: ${format(new Date(), 'yyyy-MM-dd (EEEE)')}

Bookings:
${bookingsContext}

IMPORTANT: Guide users to either:
1. "Book [Day] [Time]" - to create a new booking
2. "Join [Day] [Time]" - to join an open session

Keep responses SHORT (2-3 sentences max). Be enthusiastic about football! ⚽`;

      const response = await supabase.functions.invoke('chat', {
        body: {
          messages: [
            ...messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage },
          ],
          systemPrompt: systemContext,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const assistantMessage = response.data?.message || "I'm sorry, I couldn't process that request.";
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: assistantMessage, quickReplies: ['Today', 'Tomorrow', 'This weekend'] },
      ]);
    } catch (error) {
      console.error('AI error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Oops! Had a little stumble there. Try again? ⚽" },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const getBookingsContext = () => {
    const today = new Date();
    const upcomingBookings = bookings
      .filter((b) => new Date(b.date) >= today)
      .slice(0, 10)
      .map((b) => ({
        date: format(new Date(b.date), 'yyyy-MM-dd (EEEE)'),
        time: b.start_time,
        type: b.session_type,
        host: b.created_by_name,
        spots: b.session_type === 'open' ? (b.max_players || 10) - b.participants.length - 1 : 0,
      }));

    return JSON.stringify(upcomingBookings, null, 2);
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
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full gradient-pitch shadow-pitch z-50 animate-bounce hover:animate-none"
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
            <span className="text-xs font-normal text-muted-foreground">Book or join games instantly</span>
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
            placeholder="When do you want to play?"
            className="flex-1 h-10 px-4 rounded-full bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="gradient-pitch rounded-full h-10 w-10"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}