import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, X, MessageSquare, Loader2, Calendar, Clock, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/lib/userContext';
import { format, addDays, isWeekend, setHours, isBefore, isAfter } from 'date-fns';
import { BookingWithParticipants } from '@/types/booking';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  quickReplies?: string[];
}

interface TimeSlot {
  date: Date;
  time: string;
  isAvailable: boolean;
  openSession?: BookingWithParticipants;
}

export function AIAssistant() {
  const { user } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [bookings, setBookings] = useState<BookingWithParticipants[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hasGreeted, setHasGreeted] = useState(false);

  // Fetch bookings when assistant opens
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
        content: `${greeting} ${user?.name || 'there'}! 🎉 Ready to kick some balls? When are you thinking of playing?`,
        quickReplies: ['Today', 'Tomorrow', 'This weekend', 'Show me available slots'],
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
    
    // Check each hour from 8 AM to 8 PM
    for (let hour = 8; hour < 20; hour++) {
      const slotTime = setHours(targetDate, hour);
      const timeStr = `${hour.toString().padStart(2, '0')}:00`;
      
      // Skip past times for today
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

  const getRecommendations = (userIntent: string): string => {
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
      // Find next weekend
      for (let i = 0; i <= 7; i++) {
        const d = addDays(today, i);
        if (isWeekend(d)) targetDates.push(d);
        if (targetDates.length >= 2) break;
      }
      contextMessage = "this weekend";
    } else if (lowerIntent.includes('available') || lowerIntent.includes('slot') || lowerIntent.includes('show')) {
      // Show next 3 days
      targetDates = [today, addDays(today, 1), addDays(today, 2)];
      contextMessage = "the next few days";
    } else {
      // Default to today and tomorrow
      targetDates = [today, addDays(today, 1)];
      contextMessage = "soon";
    }

    let allSlots: TimeSlot[] = [];
    targetDates.forEach(date => {
      allSlots = [...allSlots, ...findAvailableSlots(date)];
    });

    if (allSlots.length === 0) {
      return `Hmm, looks like ${contextMessage} is pretty packed! 😅 Want me to check other days?`;
    }

    // Find open sessions to join
    const openSessions = allSlots.filter(s => s.openSession);
    const freeSlots = allSlots.filter(s => !s.openSession);

    let response = `Here's what I found for ${contextMessage}:\n\n`;

    if (openSessions.length > 0) {
      response += `⚽ **Join an open game:**\n`;
      openSessions.slice(0, 3).forEach(slot => {
        const spotsLeft = (slot.openSession!.max_players || 10) - (slot.openSession!.participants.length + 1);
        response += `• ${format(slot.date, 'EEEE')} at ${slot.time} - ${spotsLeft} spots left (hosted by ${slot.openSession!.created_by_name})\n`;
      });
      response += '\n';
    }

    if (freeSlots.length > 0) {
      response += `🏟️ **Available slots to book:**\n`;
      // Group by date for cleaner display
      const byDate = new Map<string, string[]>();
      freeSlots.forEach(slot => {
        const dateKey = format(slot.date, 'EEEE, MMM d');
        if (!byDate.has(dateKey)) byDate.set(dateKey, []);
        byDate.get(dateKey)!.push(slot.time);
      });
      
      byDate.forEach((times, date) => {
        const displayTimes = times.slice(0, 4).join(', ') + (times.length > 4 ? '...' : '');
        response += `• ${date}: ${displayTimes}\n`;
      });
    }

    response += `\nWhat sounds good to you? 🎯`;
    return response;
  };

  const sendMessage = async (messageText?: string) => {
    const userMessage = (messageText || input).trim();
    if (!userMessage || isLoading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      // First, try to handle common intents locally for instant response
      const lowerMessage = userMessage.toLowerCase();
      const isAvailabilityQuery = 
        lowerMessage.includes('today') ||
        lowerMessage.includes('tomorrow') ||
        lowerMessage.includes('weekend') ||
        lowerMessage.includes('available') ||
        lowerMessage.includes('slot') ||
        lowerMessage.includes('when') ||
        lowerMessage.includes('show');

      if (isAvailabilityQuery) {
        const recommendations = getRecommendations(userMessage);
        setMessages((prev) => [
          ...prev,
          { 
            role: 'assistant', 
            content: recommendations,
            quickReplies: ['Book a slot', 'Join an open game', 'Check another day']
          },
        ]);
        setIsLoading(false);
        return;
      }

      // For other queries, use AI
      const bookingsContext = getBookingsContext();
      const systemContext = `You are a friendly, enthusiastic football pitch booking assistant chatbot. Your personality is like a helpful teammate who's excited about football!

Current user: ${user?.name} (Skill Level: ${user?.level})
Current date/time: ${format(new Date(), 'yyyy-MM-dd HH:mm (EEEE)')}

Upcoming bookings:
${bookingsContext}

Your job:
1. Help users find the BEST time to play based on their preferences
2. Recommend joining open sessions if they want to meet other players
3. Suggest booking their own session if they want private time
4. Be conversational and ask follow-up questions!

Booking rules:
- Hours: 8 AM - 8 PM
- Duration: 1 or 2 hours
- Session types: OPEN (others can join) or CLOSED (private)
- Open sessions show available spots

Keep responses SHORT and friendly. Use emojis sparingly. Ask ONE follow-up question to help them decide.`;

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
        { 
          role: 'assistant', 
          content: assistantMessage,
          quickReplies: getContextualQuickReplies(assistantMessage)
        },
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

  const getContextualQuickReplies = (response: string): string[] => {
    const lower = response.toLowerCase();
    if (lower.includes('when') || lower.includes('time')) {
      return ['Morning (8-12)', 'Afternoon (12-5)', 'Evening (5-8)'];
    }
    if (lower.includes('book') || lower.includes('session')) {
      return ['Open session', 'Private booking', 'Show available times'];
    }
    return ['Today', 'Tomorrow', 'This weekend'];
  };

  const getBookingsContext = () => {
    const today = new Date();
    const upcomingBookings = bookings
      .filter((b) => new Date(b.date) >= today)
      .slice(0, 15)
      .map((b) => ({
        date: format(new Date(b.date), 'yyyy-MM-dd (EEEE)'),
        time: b.start_time,
        duration: `${b.duration}h`,
        type: b.session_type,
        createdBy: b.created_by_name,
        spotsLeft: b.session_type === 'open' ? (b.max_players || 10) - b.participants.length - 1 : 0,
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
            <span className="text-xs font-normal text-muted-foreground">Find your perfect game time</span>
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
                <span className="text-sm text-muted-foreground">Finding best slots...</span>
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
