import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, X, MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/lib/userContext';
import { useAllBookings } from '@/hooks/useBookings';
import { format } from 'date-fns';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function AIAssistant() {
  const { user } = useUser();
  const { bookings } = useAllBookings();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your pitch booking assistant. I can help you check availability, create bookings, or answer questions about the system. What would you like to do?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getBookingsContext = () => {
    const today = new Date();
    const upcomingBookings = bookings
      .filter((b) => new Date(b.date) >= today)
      .slice(0, 20)
      .map((b) => ({
        date: format(new Date(b.date), 'yyyy-MM-dd (EEEE)'),
        time: b.start_time,
        duration: `${b.duration}h`,
        type: b.session_type,
        createdBy: b.created_by_name,
        players: b.session_type === 'open' ? `${b.participants.length + 1}/${b.max_players}` : 'N/A',
      }));

    return JSON.stringify(upcomingBookings, null, 2);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const bookingsContext = getBookingsContext();
      const systemContext = `You are a helpful assistant for a university football pitch booking system. 
      
Current user: ${user?.name} (Level ${user?.level})
Current date: ${format(new Date(), 'yyyy-MM-dd (EEEE)')}

Upcoming bookings:
${bookingsContext}

Rules:
- The pitch can have CLOSED sessions (exclusive use) or OPEN sessions (others can join)
- Booking hours are 8 AM to 8 PM
- Duration can be 1 or 2 hours
- Double booking is not allowed for closed sessions
- Open sessions can have up to their max_players limit

Help users:
1. Check if a time slot is available
2. Explain how to create bookings (open vs closed)
3. Tell them about upcoming bookings
4. Answer questions about the system

Be friendly, concise, and helpful. If asked about availability, check the bookings list and give accurate info.`;

      const response = await supabase.functions.invoke('chat', {
        body: {
          messages: [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage },
          ],
          systemPrompt: systemContext,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const assistantMessage = response.data?.message || "I'm sorry, I couldn't process that request.";
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantMessage }]);
    } catch (error) {
      console.error('AI error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Sorry, I'm having trouble connecting. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
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
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full gradient-pitch shadow-pitch z-50"
      >
        <MessageSquare className="w-6 h-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 w-[360px] max-w-[calc(100vw-3rem)] h-[500px] max-h-[calc(100vh-6rem)] shadow-xl z-50 flex flex-col animate-scale-in">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 border-b shrink-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="w-5 h-5 text-primary" />
          Booking Assistant
        </CardTitle>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsOpen(false)}>
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <CardContent className="p-3 border-t shrink-0">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about bookings..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="gradient-pitch"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
