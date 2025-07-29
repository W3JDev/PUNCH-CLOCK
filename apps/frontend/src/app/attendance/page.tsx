'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Clock, 
  MapPin, 
  QrCode, 
  Fingerprint, 
  Smartphone,
  Coffee,
  Play,
  Square,
  CheckCircle,
  AlertTriangle,
  Timer,
  Calendar
} from 'lucide-react'

interface AttendanceRecord {
  id: string
  employee: {
    name: string
    employeeId: string
    department: string
  }
  date: string
  checkInTime?: string
  checkOutTime?: string
  status: 'checked_in' | 'checked_out' | 'on_break' | 'not_checked_in'
  hoursWorked?: number
  isLate?: boolean
  breakRecords: Array<{
    startTime: string
    endTime?: string
    type: string
  }>
}

export default function AttendancePage() {
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [checkInMethod, setCheckInMethod] = useState<'PIN' | 'QR_CODE' | 'FACE_ID' | 'MANUAL'>('PIN')
  const [isLoading, setIsLoading] = useState(true)
  const [showCheckInModal, setShowCheckInModal] = useState(false)
  const [pinCode, setPinCode] = useState('')
  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null)

  useEffect(() => {
    fetchAttendanceRecords()
    getCurrentLocation()
  }, [])

  const fetchAttendanceRecords = async () => {
    try {
      // Simulate API call - replace with actual API endpoint
      setAttendanceRecords([
        {
          id: '1',
          employee: { name: 'John Smith', employeeId: 'EMP001', department: 'Engineering' },
          date: '2024-07-29',
          checkInTime: '09:15',
          status: 'checked_in',
          isLate: true,
          breakRecords: []
        },
        {
          id: '2',
          employee: { name: 'Sarah Johnson', employeeId: 'EMP002', department: 'Marketing' },
          date: '2024-07-29',
          checkInTime: '08:45',
          status: 'on_break',
          breakRecords: [{ startTime: '12:00', type: 'LUNCH' }]
        },
        {
          id: '3',
          employee: { name: 'Mike Wilson', employeeId: 'EMP003', department: 'Sales' },
          date: '2024-07-29',
          checkInTime: '08:30',
          checkOutTime: '17:45',
          status: 'checked_out',
          hoursWorked: 8.25,
          breakRecords: []
        },
        {
          id: '4',
          employee: { name: 'Emma Davis', employeeId: 'EMP004', department: 'HR' },
          date: '2024-07-29',
          status: 'not_checked_in',
          breakRecords: []
        },
      ])
      setIsLoading(false)
    } catch (error) {
      console.error('Error fetching attendance:', error)
      setIsLoading(false)
    }
  }

  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          })
        },
        (error) => {
          console.error('Error getting location:', error)
        }
      )
    }
  }

  const handleCheckIn = async () => {
    if (checkInMethod === 'PIN' && (!pinCode || pinCode.length !== 4)) {
      alert('Please enter a valid 4-digit PIN')
      return
    }

    try {
      // Simulate API call
      const checkInData = {
        employeeId: selectedEmployee,
        method: checkInMethod,
        pin: checkInMethod === 'PIN' ? pinCode : undefined,
        latitude: location?.latitude,
        longitude: location?.longitude,
        deviceInfo: {
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        }
      }

      console.log('Check-in data:', checkInData)
      
      // Update local state
      fetchAttendanceRecords()
      setShowCheckInModal(false)
      setPinCode('')
      
    } catch (error) {
      console.error('Error during check-in:', error)
    }
  }

  const handleCheckOut = async (recordId: string) => {
    try {
      // Simulate API call
      console.log('Checking out record:', recordId)
      fetchAttendanceRecords()
    } catch (error) {
      console.error('Error during check-out:', error)
    }
  }

  const handleBreakStart = async (recordId: string) => {
    try {
      console.log('Starting break for record:', recordId)
      fetchAttendanceRecords()
    } catch (error) {
      console.error('Error starting break:', error)
    }
  }

  const handleBreakEnd = async (recordId: string) => {
    try {
      console.log('Ending break for record:', recordId)
      fetchAttendanceRecords()
    } catch (error) {
      console.error('Error ending break:', error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'checked_in': return 'bg-green-100 text-green-800'
      case 'on_break': return 'bg-yellow-100 text-yellow-800'
      case 'checked_out': return 'bg-blue-100 text-blue-800'
      case 'not_checked_in': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'PIN': return <Clock className="h-4 w-4" />
      case 'QR_CODE': return <QrCode className="h-4 w-4" />
      case 'FACE_ID': return <Fingerprint className="h-4 w-4" />
      case 'MANUAL': return <Smartphone className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading attendance data...</p>
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
              <h1 className="text-2xl font-bold text-gray-900">Attendance Tracking</h1>
              <p className="text-sm text-muted-foreground">
                Real-time attendance monitoring with multiple check-in methods
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {location && (
                <div className="flex items-center text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 mr-1" />
                  Location detected
                </div>
              )}
              <Button onClick={() => setShowCheckInModal(true)}>
                <Clock className="h-4 w-4 mr-2" />
                Quick Check-In
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Today's Summary */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {attendanceRecords.filter(r => r.status === 'checked_in' || r.status === 'on_break').length}
              </div>
              <p className="text-xs text-muted-foreground">Currently Present</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">
                {attendanceRecords.filter(r => r.status === 'checked_out').length}
              </div>
              <p className="text-xs text-muted-foreground">Checked Out</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">
                {attendanceRecords.filter(r => r.status === 'not_checked_in').length}
              </div>
              <p className="text-xs text-muted-foreground">Not Checked In</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-orange-600">
                {attendanceRecords.filter(r => r.isLate).length}
              </div>
              <p className="text-xs text-muted-foreground">Late Arrivals</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">
                {attendanceRecords.filter(r => r.status === 'on_break').length}
              </div>
              <p className="text-xs text-muted-foreground">On Break</p>
            </CardContent>
          </Card>
        </div>

        {/* Attendance Records */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                Today's Attendance - {new Date().toLocaleDateString()}
              </div>
              <Badge className="bg-green-100 text-green-800">Live</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {attendanceRecords.map((record) => (
                <div key={record.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="flex flex-col items-center">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                        record.status === 'checked_in' ? 'bg-green-100' :
                        record.status === 'on_break' ? 'bg-yellow-100' :
                        record.status === 'checked_out' ? 'bg-blue-100' :
                        'bg-red-100'
                      }`}>
                        {record.status === 'checked_in' && <CheckCircle className="h-6 w-6 text-green-600" />}
                        {record.status === 'on_break' && <Coffee className="h-6 w-6 text-yellow-600" />}
                        {record.status === 'checked_out' && <Square className="h-6 w-6 text-blue-600" />}
                        {record.status === 'not_checked_in' && <AlertTriangle className="h-6 w-6 text-red-600" />}
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-medium">{record.employee.name}</h3>
                        {record.isLate && <Badge variant="destructive" className="text-xs">Late</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {record.employee.employeeId} • {record.employee.department}
                      </p>
                      <div className="flex items-center space-x-4 mt-1">
                        {record.checkInTime && (
                          <span className="text-sm">
                            In: {record.checkInTime}
                          </span>
                        )}
                        {record.checkOutTime && (
                          <span className="text-sm">
                            Out: {record.checkOutTime}
                          </span>
                        )}
                        {record.hoursWorked && (
                          <span className="text-sm font-medium">
                            {record.hoursWorked}h worked
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(record.status)}>
                      {record.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                    
                    {record.status === 'checked_in' && (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleBreakStart(record.id)}
                        >
                          <Coffee className="h-4 w-4 mr-1" />
                          Break
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleCheckOut(record.id)}
                        >
                          <Square className="h-4 w-4 mr-1" />
                          Check Out
                        </Button>
                      </>
                    )}
                    
                    {record.status === 'on_break' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleBreakEnd(record.id)}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        End Break
                      </Button>
                    )}
                    
                    {record.status === 'not_checked_in' && (
                      <Button 
                        size="sm"
                        onClick={() => {
                          setSelectedEmployee(record.employee.employeeId)
                          setShowCheckInModal(true)
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Check In
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Check-In Modal */}
        {showCheckInModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <CardTitle>Employee Check-In</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Employee ID</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={selectedEmployee}
                    onChange={(e) => setSelectedEmployee(e.target.value)}
                    placeholder="Enter employee ID"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Check-In Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['PIN', 'QR_CODE', 'FACE_ID', 'MANUAL'] as const).map((method) => (
                      <button
                        key={method}
                        className={`p-3 border rounded-lg flex flex-col items-center space-y-2 ${
                          checkInMethod === method 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => setCheckInMethod(method)}
                      >
                        {getMethodIcon(method)}
                        <span className="text-xs">{method.replace('_', ' ')}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {checkInMethod === 'PIN' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">PIN Code</label>
                    <input
                      type="password"
                      maxLength={4}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg tracking-widest"
                      value={pinCode}
                      onChange={(e) => setPinCode(e.target.value)}
                      placeholder="----"
                    />
                  </div>
                )}

                {location && (
                  <div className="flex items-center text-sm text-green-600">
                    <MapPin className="h-4 w-4 mr-2" />
                    Location verified - within allowed area
                  </div>
                )}

                <div className="flex space-x-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => {
                      setShowCheckInModal(false)
                      setPinCode('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    className="flex-1"
                    onClick={handleCheckIn}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Check In
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}