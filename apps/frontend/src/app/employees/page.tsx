'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Users, 
  Search, 
  Plus, 
  Filter, 
  Download, 
  Upload,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye
} from 'lucide-react'

interface Employee {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  position: string
  department: string
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'TEMPORARY'
  hireDate: string
  isActive: boolean
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDepartment, setSelectedDepartment] = useState('all')
  const [selectedEmploymentType, setSelectedEmploymentType] = useState('all')
  const [showBulkImport, setShowBulkImport] = useState(false)

  useEffect(() => {
    fetchEmployees()
  }, [])

  const fetchEmployees = async () => {
    try {
      // Simulate API call - replace with actual API endpoint
      setEmployees([
        {
          id: '1',
          employeeId: 'EMP001',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@company.com',
          position: 'Senior Developer',
          department: 'Engineering',
          employmentType: 'FULL_TIME',
          hireDate: '2023-01-15',
          isActive: true
        },
        {
          id: '2',
          employeeId: 'EMP002',
          firstName: 'Sarah',
          lastName: 'Johnson',
          email: 'sarah.johnson@company.com',
          position: 'Marketing Manager',
          department: 'Marketing',
          employmentType: 'FULL_TIME',
          hireDate: '2022-08-20',
          isActive: true
        },
        {
          id: '3',
          employeeId: 'EMP003',
          firstName: 'Mike',
          lastName: 'Wilson',
          email: 'mike.wilson@company.com',
          position: 'Sales Representative',
          department: 'Sales',
          employmentType: 'FULL_TIME',
          hireDate: '2023-03-10',
          isActive: true
        },
        {
          id: '4',
          employeeId: 'EMP004',
          firstName: 'Emma',
          lastName: 'Davis',
          email: 'emma.davis@company.com',
          position: 'HR Coordinator',
          department: 'HR',
          employmentType: 'PART_TIME',
          hireDate: '2023-05-01',
          isActive: true
        },
        {
          id: '5',
          employeeId: 'EMP005',
          firstName: 'Alex',
          lastName: 'Brown',
          email: 'alex.brown@company.com',
          position: 'Financial Analyst',
          department: 'Finance',
          employmentType: 'CONTRACT',
          hireDate: '2023-02-14',
          isActive: false
        },
      ])
      setIsLoading(false)
    } catch (error) {
      console.error('Error fetching employees:', error)
      setIsLoading(false)
    }
  }

  const filteredEmployees = employees.filter(employee => {
    const matchesSearch = employee.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         employee.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         employee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         employee.employeeId.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesDepartment = selectedDepartment === 'all' || employee.department === selectedDepartment
    const matchesEmploymentType = selectedEmploymentType === 'all' || employee.employmentType === selectedEmploymentType
    
    return matchesSearch && matchesDepartment && matchesEmploymentType
  })

  const getEmploymentTypeBadge = (type: string) => {
    switch (type) {
      case 'FULL_TIME': return <Badge className="bg-green-100 text-green-800">Full Time</Badge>
      case 'PART_TIME': return <Badge className="bg-blue-100 text-blue-800">Part Time</Badge>
      case 'CONTRACT': return <Badge className="bg-purple-100 text-purple-800">Contract</Badge>
      case 'INTERN': return <Badge className="bg-orange-100 text-orange-800">Intern</Badge>
      case 'TEMPORARY': return <Badge className="bg-gray-100 text-gray-800">Temporary</Badge>
      default: return <Badge variant="secondary">{type}</Badge>
    }
  }

  const handleBulkImport = async (file: File) => {
    // Handle bulk import logic
    console.log('Importing file:', file.name)
    setShowBulkImport(false)
  }

  const handleExport = () => {
    // Handle export logic
    console.log('Exporting employees')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading employees...</p>
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
              <h1 className="text-2xl font-bold text-gray-900">Employee Management</h1>
              <p className="text-sm text-muted-foreground">
                Manage your workforce with advanced filtering and bulk operations
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowBulkImport(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search employees..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
              >
                <option value="all">All Departments</option>
                <option value="Engineering">Engineering</option>
                <option value="Marketing">Marketing</option>
                <option value="Sales">Sales</option>
                <option value="HR">HR</option>
                <option value="Finance">Finance</option>
              </select>

              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedEmploymentType}
                onChange={(e) => setSelectedEmploymentType(e.target.value)}
              >
                <option value="all">All Employment Types</option>
                <option value="FULL_TIME">Full Time</option>
                <option value="PART_TIME">Part Time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Intern</option>
                <option value="TEMPORARY">Temporary</option>
              </select>

              <Button variant="outline" className="w-full">
                <Filter className="h-4 w-4 mr-2" />
                More Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Employee Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{employees.length}</div>
              <p className="text-xs text-muted-foreground">Total Employees</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {employees.filter(e => e.isActive).length}
              </div>
              <p className="text-xs text-muted-foreground">Active Employees</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">
                {filteredEmployees.length}
              </div>
              <p className="text-xs text-muted-foreground">Filtered Results</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-purple-600">
                {new Set(employees.map(e => e.department)).size}
              </div>
              <p className="text-xs text-muted-foreground">Departments</p>
            </CardContent>
          </Card>
        </div>

        {/* Employee Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="h-5 w-5 mr-2" />
              Employee Directory
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b">
                  <tr>
                    <th className="text-left py-3 px-4">Employee</th>
                    <th className="text-left py-3 px-4">Department</th>
                    <th className="text-left py-3 px-4">Position</th>
                    <th className="text-left py-3 px-4">Employment Type</th>
                    <th className="text-left py-3 px-4">Hire Date</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-left py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((employee) => (
                    <tr key={employee.id} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-medium">
                            {employee.firstName} {employee.lastName}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {employee.employeeId} • {employee.email}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">{employee.department}</Badge>
                      </td>
                      <td className="py-3 px-4 text-sm">{employee.position}</td>
                      <td className="py-3 px-4">{getEmploymentTypeBadge(employee.employmentType)}</td>
                      <td className="py-3 px-4 text-sm">
                        {new Date(employee.hireDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={employee.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                          {employee.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredEmployees.length === 0 && (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">No employees found</h3>
                <p className="text-muted-foreground">Try adjusting your search or filter criteria</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk Import Modal */}
        {showBulkImport && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <CardTitle>Bulk Import Employees</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-2">
                    Drop your CSV or Excel file here, or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    id="bulk-import-file"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleBulkImport(file)
                    }}
                  />
                  <label htmlFor="bulk-import-file">
                    <Button variant="outline" className="cursor-pointer">
                      Choose File
                    </Button>
                  </label>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>Supported formats: CSV, Excel (.xlsx, .xls)</p>
                  <p>Maximum file size: 10MB</p>
                </div>
                <div className="flex space-x-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setShowBulkImport(false)}
                  >
                    Cancel
                  </Button>
                  <Button className="flex-1">
                    Download Template
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