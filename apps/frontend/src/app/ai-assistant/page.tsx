'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Bot, 
  Send, 
  Mic, 
  Paperclip,
  MoreVertical,
  Sparkles,
  Clock,
  Users,
  BarChart3,
  AlertTriangle
} from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  suggestions?: string[]
}

interface Conversation {
  id: string
  title: string
  lastMessage: string
  timestamp: Date
}

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentMessage, setCurrentMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Initialize with a welcome message
    setMessages([
      {
        id: '1',
        role: 'assistant',
        content: 'Hello! I\'m your PUNCH⏰CLOCK AI Assistant. I can help you with employee management, attendance analysis, generating reports, and answering HR questions. How can I assist you today?',
        timestamp: new Date(),
        suggestions: [
          'Show today\'s attendance summary',
          'Who is currently late?',
          'Generate weekly attendance report',
          'Show top performing employees'
        ]
      }
    ])

    // Load conversation history
    setConversations([
      {
        id: 'conv1',
        title: 'Attendance Analysis',
        lastMessage: 'Can you analyze this week\'s attendance patterns?',
        timestamp: new Date(Date.now() - 86400000) // 1 day ago
      },
      {
        id: 'conv2',
        title: 'Employee Performance',
        lastMessage: 'Show me the top performing employees',
        timestamp: new Date(Date.now() - 172800000) // 2 days ago
      }
    ])
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleSendMessage = async () => {
    if (!currentMessage.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentMessage,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setCurrentMessage('')
    setIsLoading(true)

    try {
      // Simulate AI response - replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1500))

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: generateAIResponse(currentMessage),
        timestamp: new Date(),
        suggestions: [
          'Tell me more details',
          'Generate a report',
          'Show related analytics',
          'Export this data'
        ]
      }

      setMessages(prev => [...prev, aiResponse])
    } catch (error) {
      console.error('Error getting AI response:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const generateAIResponse = (userMessage: string): string => {
    const lowercaseMessage = userMessage.toLowerCase()

    if (lowercaseMessage.includes('attendance') || lowercaseMessage.includes('present')) {
      return 'Based on today\'s data, here\'s your attendance summary:\n\n📊 **Attendance Overview**\n• Total Employees: 150\n• Present Today: 142 (94.7%)\n• Late Arrivals: 8 employees\n• On Break: 12 employees\n\n📈 **Trends**\n• Attendance rate is 2.3% higher than last week\n• Engineering department has the highest punctuality rate\n• Most common late arrival time: 9:15 AM\n\nWould you like me to analyze specific departments or generate a detailed report?'
    }

    if (lowercaseMessage.includes('late') || lowercaseMessage.includes('tardy')) {
      return '⏰ **Late Arrivals Today**\n\nHere are the employees who arrived late:\n\n1. **John Smith** (Engineering) - 15 minutes late\n2. **Emma Wilson** (Marketing) - 8 minutes late\n3. **Mike Johnson** (Sales) - 22 minutes late\n4. **Sarah Davis** (HR) - 5 minutes late\n\n📊 **Analysis**\n• Average lateness: 12.5 minutes\n• Engineering department needs attention\n• Traffic patterns suggest implementing flexible hours\n\nWould you like me to:\n• Send automated reminders to frequent late arrivals?\n• Analyze weekly patterns?\n• Generate a lateness report for management?'
    }

    if (lowercaseMessage.includes('report') || lowercaseMessage.includes('analytics')) {
      return '📋 **Available Reports**\n\nI can generate the following reports for you:\n\n**📊 Attendance Reports**\n• Daily/Weekly/Monthly summaries\n• Department-wise analysis\n• Individual employee records\n\n**⏱️ Time & Productivity**\n• Hours worked analysis\n• Overtime tracking\n• Break time patterns\n\n**👥 Employee Performance**\n• Punctuality rankings\n• Attendance trends\n• Productivity metrics\n\nWhich report would you like me to generate? Just specify the type and date range!'
    }

    if (lowercaseMessage.includes('performance') || lowercaseMessage.includes('top')) {
      return '🏆 **Top Performing Employees (This Month)**\n\n1. **Sarah Chen** (Engineering)\n   • 100% attendance rate\n   • Average 8.5 hours/day\n   • Zero late arrivals\n\n2. **Alex Rodriguez** (Sales)\n   • 98% attendance rate\n   • Consistent check-in times\n   • 2.5 hours overtime this week\n\n3. **Maria Garcia** (Marketing)\n   • 97% attendance rate\n   • Early arrivals: 95% of days\n   • Excellent break time management\n\n🎯 **Key Insights**\n• Engineering team shows highest consistency\n• Sales team has improved 15% this month\n• Marketing maintains steady performance\n\nWould you like detailed individual reports or team comparisons?'
    }

    // Default response
    return 'I understand you\'re asking about workforce management. I can help you with:\n\n• **Employee Management** - Add, edit, or view employee information\n• **Attendance Tracking** - Real-time status and historical data\n• **Analytics & Reports** - Comprehensive insights and custom reports\n• **Scheduling** - Shift management and planning\n• **HR Policies** - Guidelines and compliance information\n\nCould you be more specific about what you\'d like me to help you with?'
  }

  const handleSuggestionClick = (suggestion: string) => {
    setCurrentMessage(suggestion)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar - Conversation History */}
      <div className="w-80 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg">Conversations</h2>
          <p className="text-sm text-muted-foreground">Your AI assistant chat history</p>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            <Button className="w-full mb-4" variant="outline">
              <Bot className="h-4 w-4 mr-2" />
              New Conversation
            </Button>
            
            <div className="space-y-2">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedConversation === conv.id 
                      ? 'bg-blue-50 border border-blue-200' 
                      : 'hover:bg-slate-50'
                  }`}
                  onClick={() => setSelectedConversation(conv.id)}
                >
                  <h3 className="font-medium text-sm">{conv.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {conv.lastMessage}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {conv.timestamp.toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="p-4 border-t bg-slate-50">
          <div className="space-y-2">
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics Dashboard
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <Users className="h-4 w-4 mr-2" />
              Employee Directory
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <Clock className="h-4 w-4 mr-2" />
              Attendance Log
            </Button>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="font-semibold">PUNCH⏰CLOCK AI Assistant</h1>
                <div className="flex items-center text-sm text-muted-foreground">
                  <div className="h-2 w-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                  Online • Powered by GPT-4
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                <Sparkles className="h-3 w-3 mr-1" />
                AI-Powered
              </Badge>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-3xl ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
                {message.role === 'assistant' && (
                  <div className="flex items-center mb-2">
                    <div className="h-6 w-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mr-2">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-sm font-medium">AI Assistant</span>
                  </div>
                )}
                
                <div
                  className={`rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border shadow-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  <div className={`text-xs mt-2 ${
                    message.role === 'user' ? 'text-blue-100' : 'text-muted-foreground'
                  }`}>
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>

                {/* Suggestions */}
                {message.role === 'assistant' && message.suggestions && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.suggestions.map((suggestion, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-3xl">
                <div className="flex items-center mb-2">
                  <div className="h-6 w-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mr-2">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-medium">AI Assistant</span>
                </div>
                <div className="bg-white border shadow-sm rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                    <span className="text-sm text-muted-foreground">AI is thinking...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t bg-white p-4">
          <div className="flex items-end space-x-2">
            <div className="flex-1">
              <div className="relative">
                <textarea
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask me anything about workforce management..."
                  className="w-full p-3 pr-12 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] max-h-32"
                  rows={1}
                />
                <div className="absolute right-2 bottom-2 flex items-center space-x-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Mic className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Press Enter to send, Shift+Enter for new line
              </div>
            </div>
            <Button 
              onClick={handleSendMessage}
              disabled={!currentMessage.trim() || isLoading}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}