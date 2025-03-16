// frontend/src/components/specialized/CustomerChatInterface.tsx

import React, { useState, useRef, useEffect } from 'react';
import { useMutation } from 'react-query';
import { toast } from 'react-hot-toast';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter 
} from '../common/Card';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';
import { Input } from '../common/Input';
import { Avatar } from '../common/Avatar';
import { Textarea } from '../common/Textarea';
import { Badge } from '../common/Badge';
import { Send, Bot, User, Paperclip, Info } from 'lucide-react';
import { processCustomerQuery } from '../../services/chatbot.service';
import { useAuth } from '../../hooks/useAuth';

interface IMessage {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  sources?: {
    title: string;
    excerpt: string;
    type: string;
  }[];
}

interface ICustomerChatInterfaceProps {
  /** Project ID */
  projectId: string;
  /** Initial messages */
  initialMessages?: IMessage[];
  /** Additional CSS class names */
  className?: string;
}

/**
 * Customer chat interface component for communicating with the AI assistant
 * 
 * Provides a conversational interface with the project chatbot
 */
export const CustomerChatInterface: React.FC<ICustomerChatInterfaceProps> = ({
  projectId,
  initialMessages = [],
  className = '',
}) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<IMessage[]>(initialMessages);
  const [inputValue, setInputValue] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mutation for processing customer queries
  const processMutation = useMutation(
    ({ query, sessionId }: { query: string; sessionId?: string }) => 
      processCustomerQuery(projectId, query, sessionId),
    {
      onSuccess: (data) => {
        // Add AI response to messages
        setMessages(prev => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            content: data.response,
            isUser: false,
            timestamp: new Date(),
            sources: data.sources,
          },
        ]);
        
        // Update session ID if provided
        if (data.sessionId) {
          setSessionId(data.sessionId);
        }
      },
      onError: (error: any) => {
        toast.error(`Failed to process query: ${error.message || 'Unknown error'}`);
        
        // Add error message
        setMessages(prev => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            content: "I'm sorry, I encountered an error processing your request. Please try again later.",
            isUser: false,
            timestamp: new Date(),
          },
        ]);
      },
    }
  );

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle sending a message
  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    
    // Add user message to chat
    const userMessage: IMessage = {
      id: `user-${Date.now()}`,
      content: inputValue,
      isUser: true,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Process query
    processMutation.mutate({ 
      query: inputValue,
      sessionId,
    });
    
    // Clear input
    setInputValue('');
  };

  // Handle input key press (Enter to send)
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Format timestamp
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card className={`flex flex-col h-full bg-white shadow-md ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Project Assistant</CardTitle>
            <CardDescription>
              Ask questions about your project
            </CardDescription>
          </div>
          <Badge variant="outline" className="ml-auto">
            <Bot className="h-3 w-3 mr-1" />
            AI Assistant
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="flex-grow overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500">
            <Bot className="h-12 w-12 mb-2 opacity-50" />
            <p className="text-sm">
              Hello! I'm your project assistant. Ask me anything about your project, 
              and I'll do my best to help.
            </p>
          </div>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-3/4 rounded-lg p-3 
                  ${
                    message.isUser
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }
                `}
              >
                <div className="flex items-center mb-1">
                  {!message.isUser && (
                    <Avatar>
                      <Bot className="h-5 w-5" />
                    </Avatar>
                  )}
                  
                  {message.isUser && (
                    <Avatar>
                      <User className="h-5 w-5" />
                    </Avatar>
                  )}
                  
                  <span className="text-xs ml-2 opacity-75">
                    {formatTime(message.timestamp)}
                  </span>
                </div>
                
                <div className="whitespace-pre-wrap">{message.content}</div>
                
                {/* Source citations */}
                {message.sources && message.sources.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 text-xs">
                    <p className="font-medium flex items-center">
                      <Info className="h-3 w-3 mr-1" />
                      Sources:
                    </p>
                    <ul className="mt-1 space-y-1">
                      {message.sources.map((source, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="mr-1">•</span>
                          <span>
                            <strong>{source.title}</strong>
                            {source.excerpt && `: ${source.excerpt}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        
        {/* Auto-scroll reference */}
        <div ref={messagesEndRef} />
        
        {/* Loading indicator */}
        {processMutation.isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center bg-gray-100 rounded-lg p-3 space-x-2">
              <Spinner size="sm" />
              <span className="text-sm text-gray-600">Thinking...</span>
            </div>
          </div>
        )}
      </CardContent>
      
      <CardFooter className="p-4 border-t">
        <div className="flex w-full items-end space-x-2">
          <Textarea
            placeholder="Ask a question about your project..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            className="flex-grow min-h-10 max-h-32"
            disabled={processMutation.isLoading}
          />
          
          <div className="flex space-x-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-full h-10 w-10 flex-shrink-0"
              disabled={processMutation.isLoading}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            
            <Button
              type="button"
              variant="primary"
              size="icon"
              className="rounded-full h-10 w-10 flex-shrink-0"
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || processMutation.isLoading}
            >
              {processMutation.isLoading ? (
                <Spinner size="sm" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
};

export default CustomerChatInterface;