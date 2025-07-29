'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Users, 
  Clock, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle,
  XCircle,
  BarChart3,
  Calendar,
  Coffee,
  Timer
} from 'lucide-react'

interface DashboardStats {
  totalEmployees: number
  presentToday: number
  lateArrivals: number
  earlyDepartures: number
  attendanceRate: number
  punctualityRate: number
  avgHoursWorked: number
  totalOvertimeHours: number
}

interface RealtimeEmployee {
  id: string
  name: string
  status: 'checked_in' | 'checked_out' | 'on_break' | 'not_checked_in'
  checkInTime?: string
  department: string
  isLate?: boolean
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    presentToday: 0,
    lateArrivals: 0,
    earlyDepartures: 0,
    attendanceRate: 0,
    punctualityRate: 0,
    avgHoursWorked: 0,
    totalOvertimeHours: 0
  })

  const [realtimeEmployees, setRealtimeEmployees] = useState<RealtimeEmployee[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Fetch dashboard data
    fetchDashboardData()
    
    // Set up real-time updates (WebSocket connection would go here)
    const interval = setInterval(fetchDashboardData, 30000) // Refresh every 30 seconds
    
    return () => clearInterval(interval)
  }, [])

  const fetchDashboardData = async () => {
    try {
      // Simulate API call - replace with actual API endpoints
      setStats({
        totalEmployees: 150,
        presentToday: 142,
        lateArrivals: 8,
        earlyDepartures: 3,
        attendanceRate: 94.7,
        punctualityRate: 91.5,
        avgHoursWorked: 8.2,
        totalOvertimeHours: 15.5
      })

      setRealtimeEmployees([
        { id: '1', name: 'John Smith', status: 'checked_in', checkInTime: '09:15', department: 'Engineering', isLate: true },
        { id: '2', name: 'Sarah Johnson', status: 'on_break', checkInTime: '08:45', department: 'Marketing' },
        { id: '3', name: 'Mike Wilson', status: 'checked_in', checkInTime: '08:30', department: 'Sales' },
        { id: '4', name: 'Emma Davis', status: 'not_checked_in', department: 'HR' },
        { id: '5', name: 'Alex Brown', status: 'checked_out', checkInTime: '08:00', department: 'Finance' },
      ])

      setIsLoading(false)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      setIsLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'checked_in': return 'bg-green-500'
      case 'on_break': return 'bg-yellow-500'
      case 'checked_out': return 'bg-blue-500'
      case 'not_checked_in': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'checked_in': return <CheckCircle className="h-4 w-4" />
      case 'on_break': return <Coffee className="h-4 w-4" />
      case 'checked_out': return <XCircle className="h-4 w-4" />
      case 'not_checked_in': return <AlertTriangle className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Real-time workforce management overview
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-muted-foreground">Live</span>
              <Button variant="outline" size="sm">
                <Calendar className="h-4 w-4 mr-2" />
                Today
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEmployees}</div>
              <p className="text-xs text-muted-foreground">Active workforce</p>
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
                {stats.attendanceRate.toFixed(1)}% attendance rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Late Arrivals</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.lateArrivals}</div>
              <p className="text-xs text-muted-foreground">
                {stats.punctualityRate.toFixed(1)}% punctuality rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Hours</CardTitle>
              <Timer className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.avgHoursWorked}</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalOvertimeHours}h overtime total
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Real-time Employee Status */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center">
                <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
                Real-time Employee Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {realtimeEmployees.map((employee) => (
                  <div
                    key={employee.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`h-3 w-3 rounded-full ${getStatusColor(employee.status)}`}></div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{employee.name}</span>
                          {employee.isLate && (
                            <Badge variant="destructive" className="text-xs">Late</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{employee.department}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(employee.status)}
                      <div className="text-right">
                        <p className="text-sm font-medium capitalize">
                          {employee.status.replace('_', ' ')}
                        </p>
                        {employee.checkInTime && (
                          <p className="text-xs text-muted-foreground">
                            {employee.checkInTime}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <Button variant="outline" className="w-full">
                  View All Employees
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full justify-start" variant="outline">
                <Users className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <BarChart3 className="h-4 w-4 mr-2" />
                Generate Report
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <TrendingUp className="h-4 w-4 mr-2" />
                View Analytics
              </Button>
              <Button className="w-full justify-start" variant="outline">
                <Clock className="h-4 w-4 mr-2" />
                Manage Shifts
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Alerts Section */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-orange-600" />
              Today's Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-orange-600 mr-3" />
                <div className="flex-1">
                  <p className="font-medium text-orange-800">
                    8 employees arrived late today
                  </p>
                  <p className="text-sm text-orange-600">
                    Above average for this time of week
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  View Details
                </Button>
              </div>
              
              <div className="flex items-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <TrendingUp className="h-4 w-4 text-blue-600 mr-3" />
                <div className="flex-1">
                  <p className="font-medium text-blue-800">
                    Overtime increasing in Engineering department
                  </p>
                  <p className="text-sm text-blue-600">
                    15.5 hours total this week
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Analyze
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}