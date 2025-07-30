'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Users, 
  Clock, 
  TrendingUp, 
  Calendar,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react'

// Mock data for demonstration
const mockEmployees = [
  {
    id: '1',
    employeeId: 'EMP001',
    firstName: 'John',
    lastName: 'Doe',
    position: 'Software Engineer',
    department: { name: 'Engineering' },
    status: 'PRESENT',
    checkInTime: '09:00 AM',
    hoursWorked: 8.5
  },
  {
    id: '2',
    employeeId: 'EMP002',
    firstName: 'Jane',
    lastName: 'Smith',
    position: 'Product Manager',
    department: { name: 'Product' },
    status: 'ABSENT',
    checkInTime: null,
    hoursWorked: 0
  },
  {
    id: '3',
    employeeId: 'EMP003',
    firstName: 'Mike',
    lastName: 'Johnson',
    position: 'Designer',
    department: { name: 'Design' },
    status: 'LATE',
    checkInTime: '09:30 AM',
    hoursWorked: 7.5
  }
]

const mockStats = {
  totalEmployees: 125,
  presentToday: 118,
  lateArrivals: 7,
  averageHours: 8.2
}

export default function DashboardPage() {
  const [employees, setEmployees] = useState(mockEmployees)
  const [stats, setStats] = useState(mockStats)
  const [loading, setLoading] = useState(false)
  
  // AI Chat state
  const [showAIChat, setShowAIChat] = useState(false)
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I\'m your AI HR Assistant. I can help you with employee management, attendance tracking, shift scheduling, and generate insights about your workforce. How can I assist you today?',
      timestamp: new Date().toISOString()
    }
  ])
  const [currentMessage, setCurrentMessage] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || aiLoading) return

    const userMessage = {
      role: 'user' as const,
      content: currentMessage,
      timestamp: new Date().toISOString()
    }

    setChatMessages(prev => [...prev, userMessage])
    setCurrentMessage('')
    setAiLoading(true)

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: currentMessage,
          organizationId: 'demo-org-123', // In real app, get from auth context
          userId: 'demo-user-123', // In real app, get from auth context
          conversationId
        })
      })

      const data = await response.json()

      if (data.success) {
        const aiMessage = {
          role: 'assistant' as const,
          content: data.data.message,
          timestamp: data.data.timestamp
        }
        
        setChatMessages(prev => [...prev, aiMessage])
        setConversationId(data.data.conversationId)

        // Handle any AI actions
        if (data.data.actions && data.data.actions.length > 0) {
          console.log('AI Actions:', data.data.actions)
          // In a real app, you might want to show these actions or execute them
        }
      } else {
        throw new Error(data.error || 'Failed to get AI response')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage = {
        role: 'assistant' as const,
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString()
      }
      setChatMessages(prev => [...prev, errorMessage])
    } finally {
      setAiLoading(false)
    }
  }

  const handleAIAction = async (message: string) => {
    setShowAIChat(true)
    setCurrentMessage(message)
    // Small delay to ensure UI updates
    setTimeout(() => {
      handleSendMessage()
    }, 100)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PRESENT':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Present</Badge>
      case 'ABSENT':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Absent</Badge>
      case 'LATE':
        return <Badge className="bg-yellow-100 text-yellow-800"><AlertCircle className="w-3 h-3 mr-1" />Late</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-1">Welcome to PUNCH⏰CLOCK Enterprise</p>
          </div>
          <div className="flex space-x-4">
            <Button variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Employee
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEmployees}</div>
              <p className="text-xs text-muted-foreground">
                +12% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Present Today</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.presentToday}</div>
              <p className="text-xs text-muted-foreground">
                {((stats.presentToday / stats.totalEmployees) * 100).toFixed(1)}% attendance rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Late Arrivals</CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.lateArrivals}</div>
              <p className="text-xs text-muted-foreground">
                -3 from yesterday
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Hours/Day</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.averageHours}</div>
              <p className="text-xs text-muted-foreground">
                +0.3 from last week
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Employee List */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Today&apos;s Attendance</CardTitle>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm">
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
                <Button variant="outline" size="sm">
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Employee</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Department</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Check In</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Hours</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium text-gray-900">
                            {employee.firstName} {employee.lastName}
                          </div>
                          <div className="text-sm text-gray-500">{employee.employeeId}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-900">{employee.department.name}</div>
                        <div className="text-sm text-gray-500">{employee.position}</div>
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(employee.status)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {employee.checkInTime || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {employee.hoursWorked > 0 ? `${employee.hoursWorked}h` : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>🤖 AI Assistant</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <div className="bg-blue-500 text-white rounded-full p-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-blue-800">
                    <strong>AI Insight:</strong> Your attendance rate is up 5% this week! 
                    I noticed that flexible work hours have reduced late arrivals by 40%. 
                    Would you like me to generate a detailed attendance report?
                  </p>
                  <div className="mt-3 flex space-x-2">
                    <Button size="sm" variant="outline" onClick={() => handleAIAction('Generate attendance report for this week')}>
                      Generate Report
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAIChat(true)}>
                      Ask Question
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Chat Modal/Expanded View */}
            {showAIChat && (
              <div className="mt-4 border border-gray-200 rounded-lg p-4 bg-white">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-medium">Chat with AI Assistant</h3>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowAIChat(false)}
                  >
                    ×
                  </Button>
                </div>
                
                <div className="max-h-96 overflow-y-auto mb-4 space-y-3">
                  {chatMessages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        msg.role === 'user' 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        <p className="text-sm">{msg.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 text-gray-800 px-4 py-2 rounded-lg">
                        <p className="text-sm">AI is thinking...</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Ask me about employees, attendance, or anything HR-related..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={aiLoading}
                  />
                  <Button 
                    onClick={handleSendMessage}
                    disabled={aiLoading || !currentMessage.trim()}
                  >
                    Send
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}