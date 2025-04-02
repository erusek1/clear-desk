// frontend/src/components/specialized/TimelineView.tsx

import React, { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { format, parseISO, addDays, isAfter, isBefore, differenceInDays } from 'date-fns';
import { Calendar, Clock, AlertCircle, Check, FileCog, FileCheck, FileWarning, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Spinner } from '../common/Spinner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../common/Tabs';

interface TimelineViewProps {
  projectId: string;
  estimateId?: string;
  className?: string;
}

interface TimelineEvent {
  id: string;
  title: string;
  date: string;
  type: 'permit' | 'inspection' | 'phase' | 'milestone' | 'estimate';
  status: 'pending' | 'completed' | 'overdue' | 'upcoming' | 'in-progress';
  phase?: string;
  description?: string;
  icon?: React.ReactNode;
}

interface TimelinePrediction {
  phaseId: string;
  phaseName: string;
  startDate: string;
  endDate: string;
  confidence: number;
  dependencies: string[];
  riskFactors?: string[];
}

const mockEvents: TimelineEvent[] = [
  {
    id: '1',
    title: 'Estimate Created',
    date: '2025-03-15',
    type: 'estimate',
    status: 'completed',
    description: 'Estimate created and sent to customer'
  },
  {
    id: '2',
    title: 'Estimate Approved',
    date: '2025-03-20',
    type: 'estimate',
    status: 'completed',
    description: 'Customer approved the estimate'
  },
  {
    id: '3',
    title: 'Electrical Permit Submitted',
    date: '2025-03-25',
    type: 'permit',
    status: 'completed',
    description: 'Electrical permit submitted to city'
  },
  {
    id: '4',
    title: 'Permit Approved',
    date: '2025-04-05',
    type: 'permit',
    status: 'in-progress',
    description: 'Waiting for permit approval from city'
  },
  {
    id: '5',
    title: 'Rough Phase',
    date: '2025-04-10',
    type: 'phase',
    phase: 'rough',
    status: 'upcoming',
    description: 'Start rough electrical work'
  },
  {
    id: '6',
    title: 'Rough Inspection',
    date: '2025-04-20',
    type: 'inspection',
    phase: 'rough',
    status: 'upcoming',
    description: 'Schedule rough inspection with city'
  },
  {
    id: '7',
    title: 'Service Phase',
    date: '2025-04-25',
    type: 'phase',
    phase: 'service',
    status: 'upcoming',
    description: 'Start service work after rough inspection passes'
  },
  {
    id: '8',
    title: 'Service Inspection',
    date: '2025-05-05',
    type: 'inspection',
    phase: 'service',
    status: 'upcoming',
    description: 'Schedule service inspection with city'
  },
  {
    id: '9',
    title: 'Finish Phase',
    date: '2025-05-10',
    type: 'phase',
    phase: 'finish',
    status: 'upcoming',
    description: 'Start finish work after service inspection passes'
  },
  {
    id: '10',
    title: 'Final Inspection',
    date: '2025-05-20',
    type: 'inspection',
    phase: 'finish',
    status: 'upcoming',
    description: 'Schedule final inspection with city'
  }
];

const mockPredictions: TimelinePrediction[] = [
  {
    phaseId: 'rough',
    phaseName: 'Rough Phase',
    startDate: '2025-04-10',
    endDate: '2025-04-20',
    confidence: 0.85,
    dependencies: ['permit_approval'],
    riskFactors: ['Material delivery delays', 'Weather conditions']
  },
  {
    phaseId: 'service',
    phaseName: 'Service Phase',
    startDate: '2025-04-25',
    endDate: '2025-05-05',
    confidence: 0.75,
    dependencies: ['rough_inspection'],
    riskFactors: ['Inspector availability', 'Crew scheduling conflicts']
  },
  {
    phaseId: 'finish',
    phaseName: 'Finish Phase',
    startDate: '2025-05-10',
    endDate: '2025-05-20',
    confidence: 0.65,
    dependencies: ['service_inspection'],
    riskFactors: ['Appliance delivery', 'Fixture availability', 'Final customer selections']
  }
];

const getEventIcon = (event: TimelineEvent) => {
  switch (event.type) {
    case 'permit':
      return <FileCog className="h-5 w-5" />;
    case 'inspection':
      return <FileCheck className="h-5 w-5" />;
    case 'phase':
      return <Clock className="h-5 w-5" />;
    case 'milestone':
      return <Calendar className="h-5 w-5" />;
    case 'estimate':
      return <FileWarning className="h-5 w-5" />;
    default:
      return <Clock className="h-5 w-5" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'in-progress':
      return 'bg-blue-100 text-blue-800';
    case 'upcoming':
      return 'bg-gray-100 text-gray-800';
    case 'overdue':
      return 'bg-red-100 text-red-800';
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const TimelineView: React.FC<TimelineViewProps> = ({ projectId, estimateId, className = '' }) => {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [view, setView] = useState<'timeline' | 'gantt'>('timeline');
  const [timeFilter, setTimeFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [filteredEvents, setFilteredEvents] = useState<TimelineEvent[]>(mockEvents);

  // Fetch project timeline data
  const { data: timelineData, isLoading, error } = useQuery(
    ['projectTimeline', projectId],
    async () => {
      // This would be replaced with a real API call
      // const response = await api.get(`/projects/${projectId}/timeline`);
      // return response.data;

      // Mock data response for now
      return {
        events: mockEvents,
        predictions: mockPredictions
      };
    },
    {
      enabled: !!projectId,
      onError: (err: any) => {
        toast.error(`Failed to load timeline: ${err.message}`);
      }
    }
  );

  // Filter events based on timeFilter
  useEffect(() => {
    if (!timelineData?.events) {
      setFilteredEvents([]);
      return;
    }

    const today = new Date();
    
    let filtered = [...timelineData.events];
    
    if (timeFilter === 'upcoming') {
      filtered = filtered.filter(event => 
        isAfter(parseISO(event.date), today) || 
        event.status === 'in-progress' || 
        event.status === 'upcoming'
      );
    } else if (timeFilter === 'past') {
      filtered = filtered.filter(event => 
        isBefore(parseISO(event.date), today) || 
        event.status === 'completed'
      );
    }
    
    // Sort events by date
    filtered.sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
    
    setFilteredEvents(filtered);
  }, [timelineData, timeFilter]);

  const toggleEventDetails = (eventId: string) => {
    if (expandedEvent === eventId) {
      setExpandedEvent(null);
    } else {
      setExpandedEvent(eventId);
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center p-6">
          <Spinner size="lg" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-red-500 mr-2" />
            <p className="text-red-500">Failed to load timeline data. Please try again.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Project Timeline</CardTitle>
            <CardDescription>Track project milestones, phases, and inspections</CardDescription>
          </div>
          
          <div className="flex space-x-2">
            <Button 
              variant={timeFilter === 'all' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setTimeFilter('all')}
            >
              All
            </Button>
            <Button 
              variant={timeFilter === 'upcoming' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setTimeFilter('upcoming')}
            >
              Upcoming
            </Button>
            <Button 
              variant={timeFilter === 'past' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setTimeFilter('past')}
            >
              Past
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <Tabs defaultValue="timeline" className="w-full">
          <div className="px-6 border-b">
            <TabsList>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="gantt">Gantt Chart</TabsTrigger>
              <TabsTrigger value="predictions">Predictions</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="timeline" className="p-6 pt-4">
            <div className="space-y-6">
              {filteredEvents.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  No timeline events found for the selected filter.
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-9 top-0 bottom-0 w-px bg-gray-200 ml-0.5"></div>
                  
                  <div className="space-y-6">
                    {filteredEvents.map((event, index) => (
                      <div key={event.id} className="relative">
                        <div className="flex items-start">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white z-10 mr-4">
                            {getEventIcon(event)}
                          </div>
                          
                          <div className="flex-1">
                            <div 
                              className="flex flex-col sm:flex-row sm:items-center justify-between cursor-pointer"
                              onClick={() => toggleEventDetails(event.id)}
                            >
                              <div>
                                <div className="font-medium">{event.title}</div>
                                <div className="text-sm text-gray-500">
                                  {format(parseISO(event.date), 'MMM d, yyyy')}
                                </div>
                              </div>
                              
                              <div className="flex items-center mt-2 sm:mt-0">
                                <Badge className={getStatusColor(event.status)}>
                                  {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                                </Badge>
                                <Button variant="ghost" size="sm" className="ml-2">
                                  {expandedEvent === event.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                            
                            {expandedEvent === event.id && (
                              <div className="mt-3 border rounded-md p-3 bg-gray-50">
                                <p className="text-sm text-gray-700">{event.description}</p>
                                
                                {event.phase && (
                                  <div className="mt-2 text-sm">
                                    <span className="font-medium">Phase: </span>
                                    <span className="text-gray-700">{event.phase.charAt(0).toUpperCase() + event.phase.slice(1)}</span>
                                  </div>
                                )}
                                
                                {event.type === 'inspection' && (
                                  <div className="mt-2">
                                    <Button variant="outline" size="sm" className="mr-2">
                                      Schedule
                                    </Button>
                                    <Button variant="outline" size="sm">
                                      View Checklist
                                    </Button>
                                  </div>
                                )}
                                
                                {event.type === 'permit' && (
                                  <div className="mt-2">
                                    <Button variant="outline" size="sm" className="mr-2">
                                      View Permit
                                    </Button>
                                    <Button variant="outline" size="sm">
                                      Update Status
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="gantt" className="p-6">
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="grid grid-cols-1 gap-4">
                  {mockPredictions.map((prediction) => {
                    const startDate = parseISO(prediction.startDate);
                    const endDate = parseISO(prediction.endDate);
                    const durationDays = differenceInDays(endDate, startDate);
                    const startDateRelative = differenceInDays(startDate, parseISO(mockPredictions[0].startDate));
                    const totalDuration = differenceInDays(
                      parseISO(mockPredictions[mockPredictions.length - 1].endDate),
                      parseISO(mockPredictions[0].startDate)
                    );
                    
                    // Calculate position and width percentages
                    const leftPercent = (startDateRelative / totalDuration) * 100;
                    const widthPercent = (durationDays / totalDuration) * 100;
                    
                    return (
                      <div key={prediction.phaseId} className="mb-4">
                        <div className="flex items-center mb-1">
                          <div className="w-32 font-medium text-sm mr-2">{prediction.phaseName}</div>
                          <div className="flex-1 h-6 bg-gray-100 rounded-md relative">
                            <div 
                              className="absolute h-6 bg-blue-200 rounded-md"
                              style={{ 
                                left: `${leftPercent}%`, 
                                width: `${widthPercent}%` 
                              }}
                            ></div>
                          </div>
                        </div>
                        <div className="flex text-xs text-gray-500 ml-32">
                          <div>{format(startDate, 'MMM d')}</div>
                          <div className="mx-auto">{durationDays} days</div>
                          <div>{format(endDate, 'MMM d')}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="mt-6 pt-6 border-t">
                  <div className="text-sm font-medium mb-2">Timeline Legend</div>
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex items-center">
                      <div className="w-4 h-4 bg-blue-200 rounded-sm mr-2"></div>
                      <span>Predicted Duration</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="predictions" className="p-6">
            <div className="space-y-6">
              {mockPredictions.map((prediction) => (
                <div key={prediction.phaseId} className="border rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2">
                    <div className="font-medium text-lg">{prediction.phaseName}</div>
                    <div className="text-sm">
                      <Badge className={
                        prediction.confidence > 0.8 ? 'bg-green-100 text-green-800' :
                        prediction.confidence > 0.6 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }>
                        {Math.round(prediction.confidence * 100)}% confidence
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                    <div>
                      <div className="text-sm text-gray-500">Start Date</div>
                      <div className="font-medium">{format(parseISO(prediction.startDate), 'MMMM d, yyyy')}</div>
                    </div>
                    
                    <div>
                      <div className="text-sm text-gray-500">End Date</div>
                      <div className="font-medium">{format(parseISO(prediction.endDate), 'MMMM d, yyyy')}</div>
                    </div>
                  </div>
                  
                  <div className="mt-3">
                    <div className="text-sm text-gray-500 mb-1">Dependencies</div>
                    <div className="flex flex-wrap gap-2">
                      {prediction.dependencies.map((dep) => (
                        <Badge key={dep} variant="outline" className="bg-gray-100">
                          {dep.replace('_', ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  {prediction.riskFactors && prediction.riskFactors.length > 0 && (
                    <div className="mt-3">
                      <div className="text-sm text-gray-500 mb-1">Risk Factors</div>
                      <div className="text-sm">
                        <ul className="list-disc pl-5 text-gray-700">
                          {prediction.riskFactors.map((risk, index) => (
                            <li key={index}>{risk}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default TimelineView;