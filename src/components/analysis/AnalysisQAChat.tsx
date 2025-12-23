import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import type { Report } from '@/types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface AnalysisQAChatProps {
  report: Partial<Report>;
  reportId?: string;
}

export function AnalysisQAChat({ report, reportId }: AnalysisQAChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Load existing messages for this report
  useEffect(() => {
    if (!reportId || !user) return;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from('report_qa_messages')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(data.map(m => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          created_at: m.created_at,
        })));
      }
    };

    loadMessages();
  }, [reportId, user]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !user) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build context from the report
      const reportContext = `
Report Title: ${report.title || 'Analysis Report'}
Rating: ${report.rating || 'N/A'}
Horizon: ${report.horizon || 'N/A'}
Assets: ${report.input_assets?.join(', ') || 'N/A'}
Summary: ${report.summary || 'N/A'}
Upside Estimate: ${report.upside_pct_estimate != null ? `${report.upside_pct_estimate}%` : 'N/A'}
6M Score: ${report.score_6m || 'N/A'}/10
12M Score: ${report.score_12m || 'N/A'}/10
Long Term Score: ${report.score_long_term || 'N/A'}/10

Full Analysis:
${report.raw_response || report.summary || 'No detailed analysis available.'}
      `.trim();

      // Build messages for the AI
      const aiMessages = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userMessage.content },
      ];

      // Call the report-qa edge function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report-qa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: aiMessages,
          reportContext,
          reportId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to get response');
      }

      // Handle streaming response
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let assistantMessageId = crypto.randomUUID();

      // Add empty assistant message
      setMessages(prev => [...prev, {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
      }]);

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => prev.map(m => 
                m.id === assistantMessageId 
                  ? { ...m, content: assistantContent }
                  : m
              ));
            }
          } catch {
            // Incomplete JSON, will be completed in next chunk
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      // Save messages to database if we have a reportId
      if (reportId && assistantContent) {
        await supabase.from('report_qa_messages').insert([
          { report_id: reportId, user_id: user.id, role: 'user', content: userMessage.content },
          { report_id: reportId, user_id: user.id, role: 'assistant', content: assistantContent },
        ]);
      }

    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to get response',
        variant: 'destructive',
      });
      // Remove the user message if we failed
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Sign in to ask follow-up questions about this report.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4" />
          Ask Follow-up Questions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {messages.length > 0 && (
          <ScrollArea className="h-[300px] pr-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === 'assistant' ? '' : 'justify-end'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[80%] ${
                      message.role === 'assistant'
                        ? 'bg-muted'
                        : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content || '...'}</p>
                  </div>
                  {message.role === 'user' && (
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Ask a question about this analysis..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={!input.trim() || isLoading} size="icon">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
