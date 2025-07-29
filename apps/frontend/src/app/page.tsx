'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, Users, BarChart3, Bot, Shield, Zap } from 'lucide-react'

export default function HomePage() {
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    // Check backend health
    fetch('/api/health')
      .then(res => res.json())
      .then(() => setBackendStatus('online'))
      .catch(() => setBackendStatus('offline'))
  }, [])

  const features = [
    {
      icon: Users,
      title: 'Multi-Tenant Architecture',
      description: 'Enterprise-grade isolation and security',
      phase: 'Phase 1: Core Foundation',
      status: 'In Progress'
    },
    {
      icon: Clock,
      title: 'Smart Attendance Tracking',
      description: 'PIN, QR, FaceID, & location-aware check-ins',
      phase: 'Phase 2: Core Attendance System',
      status: 'Coming Soon'
    },
    {
      icon: Bot,
      title: 'AI Assistant with Memory',
      description: 'Automate HR tasks with persistent context',
      phase: 'Phase 3: Advanced Features',
      status: 'Coming Soon'
    },
    {
      icon: BarChart3,
      title: 'Live Dashboards',
      description: '47+ KPIs, anomaly alerts, and predictive insights',
      phase: 'Phase 3: Advanced Features',
      status: 'Coming Soon'
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Google OAuth, SOC2, ISO27001, RLS',
      phase: 'Phase 1: Core Foundation',
      status: 'In Progress'
    },
    {
      icon: Zap,
      title: 'Kiosk Mode',
      description: 'Touchless, device-aware interface',
      phase: 'Phase 4: Enterprise Capabilities',
      status: 'Planned'
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b bg-white/50 backdrop-blur-sm dark:bg-slate-900/50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-3xl font-bold punch-gradient bg-clip-text text-transparent">
                PUNCH⏰CLOCK
              </div>
              <Badge variant="secondary" className="text-xs">
                v2.0.0 - Enterprise Rebuild
              </Badge>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`h-2 w-2 rounded-full ${
                backendStatus === 'online' ? 'bg-green-500' : 
                backendStatus === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
              }`} />
              <span className="text-sm text-muted-foreground">
                API {backendStatus === 'checking' ? 'Checking...' : 
                     backendStatus === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
            Enterprise Workforce Orchestration Platform
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Transform from Base44-dependent architecture to a fully independent, 
            production-ready enterprise workforce management platform with complete source code control.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Badge className="px-4 py-2 text-sm">Multi-Tenant</Badge>
            <Badge className="px-4 py-2 text-sm">AI-Powered</Badge>
            <Badge className="px-4 py-2 text-sm">SOC2 Ready</Badge>
            <Badge className="px-4 py-2 text-sm">47+ KPIs</Badge>
            <Badge className="px-4 py-2 text-sm">Enterprise Security</Badge>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          🚀 Feature Implementation Roadmap
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="punch-card hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-brand-primary/10">
                    <feature.icon className="h-6 w-6 text-brand-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                    <Badge 
                      variant={feature.status === 'In Progress' ? 'default' : 'secondary'}
                      className="text-xs mt-1"
                    >
                      {feature.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-3">{feature.description}</p>
                <div className="text-sm font-medium text-brand-primary">
                  {feature.phase}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Status Section */}
      <section className="container mx-auto px-4 py-16">
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl text-center">
              🏗️ Enterprise Rebuild Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">✅ Phase 1: Core Foundation</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center">
                    <div className="h-2 w-2 bg-green-500 rounded-full mr-3" />
                    Project structure with monorepo
                  </li>
                  <li className="flex items-center">
                    <div className="h-2 w-2 bg-green-500 rounded-full mr-3" />
                    Database schema design (PostgreSQL)
                  </li>
                  <li className="flex items-center">
                    <div className="h-2 w-2 bg-yellow-500 rounded-full mr-3" />
                    Authentication system (In Progress)
                  </li>
                  <li className="flex items-center">
                    <div className="h-2 w-2 bg-green-500 rounded-full mr-3" />
                    API Gateway with rate limiting
                  </li>
                  <li className="flex items-center">
                    <div className="h-2 w-2 bg-yellow-500 rounded-full mr-3" />
                    Docker containerization (Next)
                  </li>
                </ul>
              </div>
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">🔄 Next Phases</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center">
                    <div className="h-2 w-2 bg-slate-300 rounded-full mr-3" />
                    Employee management system
                  </li>
                  <li className="flex items-center">
                    <div className="h-2 w-2 bg-slate-300 rounded-full mr-3" />
                    Attendance tracking (PIN, QR, FaceID)
                  </li>
                  <li className="flex items-center">
                    <div className="h-2 w-2 bg-slate-300 rounded-full mr-3" />
                    AI Assistant with persistent memory
                  </li>
                  <li className="flex items-center">
                    <div className="h-2 w-2 bg-slate-300 rounded-full mr-3" />
                    Live dashboards with 47+ KPIs
                  </li>
                  <li className="flex items-center">
                    <div className="h-2 w-2 bg-slate-300 rounded-full mr-3" />
                    Kiosk mode & mobile apps
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="border-t pt-6">
              <div className="text-center">
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button className="punch-gradient text-white" size="lg" onClick={() => window.location.href = '/dashboard'}>
                    🚀 View Live Dashboard
                  </Button>
                  <Button variant="outline" size="lg">
                    📖 View Documentation
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Complete platform independence from Base44 • Production-ready codebase • Enterprise-grade security
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t bg-white/50 backdrop-blur-sm dark:bg-slate-900/50 mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">
            <p className="text-sm">
              © 2025 W3JDev Technologies • PUNCH⏰CLOCK Enterprise Rebuild
            </p>
            <p className="text-xs mt-2">
              Redefining Workforce Management Through AI-Powered Precision
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}