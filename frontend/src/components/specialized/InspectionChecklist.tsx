// frontend/src/components/specialized/InspectionChecklist.tsx

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../common/Tabs';
import { Checkbox } from '../common/Checkbox';
import { RadioGroup, RadioGroupItem } from '../common/RadioGroup';
import { Textarea } from '../common/Textarea';
import { Badge } from '../common/Badge';
import { Camera, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { 
  getInspectionChecklist, 
  updateInspectionItemResponse, 
  completeInspection 
} from '../../services/inspection.service';
import { useAuth } from '../../hooks/useAuth';
import { InspectionStatus } from '../../types/inspection.types';

interface IInspectionChecklistProps {
  /** Project ID */
  projectId: string;
  /** Project phase */
  phase: string;
  /** Inspection ID */
  inspectionId: string;
  /** Callback after successful completion */
  onComplete?: (result: any) => void;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Inspection checklist component for completing phase inspections
 * 
 * Displays checklist items grouped by category and provides response functionality
 */
export const InspectionChecklist: React.FC<IInspectionChecklistProps> = ({
  projectId,
  phase,
  inspectionId,
  onComplete,
  className = '',
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [selectedTab, setSelectedTab] = useState<string>('all');

  // Query for fetching the inspection checklist
  const { data: checklist, isLoading, isError } = useQuery(
    ['inspection', projectId, phase, inspectionId],
    () => getInspectionChecklist(projectId, phase, inspectionId),
    {
      refetchOnWindowFocus: false,
    }
  );

  // Mutation for updating an item response
  const updateItemMutation = useMutation(
    ({ itemId, response, comment }: { itemId: string; response: 'yes' | 'no' | 'n/a'; comment?: string }) => 
      updateInspectionItemResponse(projectId, phase, inspectionId, itemId, response, comment),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['inspection', projectId, phase, inspectionId]);
      },
      onError: (error: any) => {
        toast.error(`Failed to update response: ${error.message || 'Unknown error'}`);
      },
    }
  );

  // Mutation for completing the inspection
  const completeInspectionMutation = useMutation(
    (status: InspectionStatus) => 
      completeInspection(
        projectId, 
        phase, 
        inspectionId, 
        status, 
        checklist?.items.map(item => ({
          itemId: item.itemId,
          response: item.response || 'n/a',
          comment: item.comment
        })) || [],
        notes
      ),
    {
      onSuccess: (data) => {
        toast.success(`Inspection ${data.status === 'completed' ? 'passed' : 'failed'} successfully`);
        queryClient.invalidateQueries(['inspection', projectId, phase, inspectionId]);
        queryClient.invalidateQueries(['project', projectId]);
        
        if (onComplete) {
          onComplete(data);
        }
      },
      onError: (error: any) => {
        toast.error(`Failed to complete inspection: ${error.message || 'Unknown error'}`);
      },
    }
  );

  if (isLoading) {
    return (
      <Card className={`bg-white shadow-md ${className}`}>
        <CardContent className="flex justify-center items-center py-10">
          <Spinner size="lg" />
          <span className="ml-2">Loading inspection checklist...</span>
        </CardContent>
      </Card>
    );
  }

  if (isError || !checklist) {
    return (
      <Card className={`bg-white shadow-md ${className}`}>
        <CardContent className="flex justify-center items-center py-10 text-red-500">
          <AlertCircle className="mr-2" />
          <span>Error loading inspection checklist</span>
        </CardContent>
      </Card>
    );
  }

  // Group items by category
  const itemsByCategory: Record<string, typeof checklist.items> = {};
  const categories: string[] = [];

  checklist.items.forEach(item => {
    if (!itemsByCategory[item.category]) {
      itemsByCategory[item.category] = [];
      categories.push(item.category);
    }
    itemsByCategory[item.category].push(item);
  });

  // Count complete items
  const completedItems = checklist.items.filter(item => item.response !== null).length;
  const totalItems = checklist.items.length;
  const isChecklistComplete = completedItems === totalItems;
  
  // Handle item response change
  const handleResponseChange = (itemId: string, response: 'yes' | 'no' | 'n/a', comment?: string) => {
    updateItemMutation.mutate({ itemId, response, comment });
  };

  // Handle inspection completion
  const handleComplete = (status: InspectionStatus) => {
    if (!isChecklistComplete) {
      toast.error('Please complete all checklist items before submitting');
      return;
    }
    
    completeInspectionMutation.mutate(status);
  };

  return (
    <Card className={`bg-white shadow-md ${className}`}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="capitalize">{phase} Inspection Checklist</CardTitle>
            <CardDescription>
              Complete all items to mark the inspection as passed or failed
            </CardDescription>
          </div>
          <Badge 
            variant={
              checklist.status === 'completed' ? 'success' : 
              checklist.status === 'failed' ? 'destructive' : 
              'default'
            }
          >
            {checklist.status.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Progress indicator */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-500 mb-1">
            <span>Completion Progress</span>
            <span>{completedItems} of {totalItems} items ({Math.round(completedItems / totalItems * 100)}%)</span>
          </div>
          <div className="h-2 w-full bg-gray-200 rounded overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${(completedItems / totalItems) * 100}%` }}
            />
          </div>
        </div>
        
        {/* Tab navigation for categories */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-6">
          <TabsList className="w-full flex overflow-x-auto pb-1">
            <TabsTrigger value="all" className="flex-shrink-0">
              All Items
            </TabsTrigger>
            {categories.map(category => (
              <TabsTrigger key={category} value={category} className="flex-shrink-0">
                {category}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {/* All items tab */}
          <TabsContent value="all" className="mt-4">
            {categories.map(category => (
              <div key={category} className="mb-8">
                <h3 className="text-lg font-medium mb-4">{category}</h3>
                
                <div className="space-y-4">
                  {itemsByCategory[category].map(item => (
                    <div key={item.itemId} className="p-4 border rounded">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium flex-grow">{item.question}</h4>
                        {item.required && (
                          <Badge variant="outline" className="text-red-500 ml-2">Required</Badge>
                        )}
                      </div>
                      
                      <RadioGroup 
                        value={item.response || ''} 
                        onValueChange={(value: 'yes' | 'no' | 'n/a') => 
                          handleResponseChange(item.itemId, value, item.comment)
                        }
                        className="flex mb-2"
                        disabled={checklist.status !== 'pending'}
                      >
                        <div className="flex items-center space-x-2 mr-6">
                          <RadioGroupItem value="yes" id={`${item.itemId}-yes`} />
                          <label htmlFor={`${item.itemId}-yes`} className="text-sm">Yes</label>
                        </div>
                        
                        <div className="flex items-center space-x-2 mr-6">
                          <RadioGroupItem value="no" id={`${item.itemId}-no`} />
                          <label htmlFor={`${item.itemId}-no`} className="text-sm">No</label>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="n/a" id={`${item.itemId}-na`} />
                          <label htmlFor={`${item.itemId}-na`} className="text-sm">N/A</label>
                        </div>
                      </RadioGroup>
                      
                      <Textarea
                        placeholder="Add a comment (optional)"
                        value={item.comment || ''}
                        onChange={(e) => 
                          handleResponseChange(
                            item.itemId, 
                            item.response || 'n/a', 
                            e.target.value
                          )
                        }
                        className="text-sm"
                        disabled={checklist.status !== 'pending'}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </TabsContent>
          
          {/* Category-specific tabs */}
          {categories.map(category => (
            <TabsContent key={category} value={category} className="mt-4">
              <div className="space-y-4">
                {itemsByCategory[category].map(item => (
                  <div key={item.itemId} className="p-4 border rounded">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium flex-grow">{item.question}</h4>
                      {item.required && (
                        <Badge variant="outline" className="text-red-500 ml-2">Required</Badge>
                      )}
                    </div>
                    
                    <RadioGroup 
                      value={item.response || ''} 
                      onValueChange={(value: 'yes' | 'no' | 'n/a') => 
                        handleResponseChange(item.itemId, value, item.comment)
                      }
                      className="flex mb-2"
                      disabled={checklist.status !== 'pending'}
                    >
                      <div className="flex items-center space-x-2 mr-6">
                        <RadioGroupItem value="yes" id={`${item.itemId}-yes`} />
                        <label htmlFor={`${item.itemId}-yes`} className="text-sm">Yes</label>
                      </div>
                      
                      <div className="flex items-center space-x-2 mr-6">
                        <RadioGroupItem value="no" id={`${item.itemId}-no`} />
                        <label htmlFor={`${item.itemId}-no`} className="text-sm">No</label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="n/a" id={`${item.itemId}-na`} />
                        <label htmlFor={`${item.itemId}-na`} className="text-sm">N/A</label>
                      </div>
                    </RadioGroup>
                    
                    <Textarea
                      placeholder="Add a comment (optional)"
                      value={item.comment || ''}
                      onChange={(e) => 
                        handleResponseChange(
                          item.itemId, 
                          item.response || 'n/a', 
                          e.target.value
                        )
                      }
                      className="text-sm"
                      disabled={checklist.status !== 'pending'}
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
        
        {/* Notes section */}
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-2">Additional Notes</h3>
          <Textarea
            placeholder="Add general notes about the inspection"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-24"
            disabled={checklist.status !== 'pending'}
          />
        </div>
      </CardContent>
      
      <CardFooter className="flex justify-between bg-gray-50 rounded-b-lg">
        <div className="text-sm text-gray-500 flex items-center">
          {!isChecklistComplete && (
            <>
              <Info className="h-4 w-4 mr-1" />
              Complete all items to submit
            </>
          )}
          {isChecklistComplete && checklist.status === 'pending' && (
            <>
              <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
              Ready to submit
            </>
          )}
        </div>
        
        <div className="flex space-x-2">
          {checklist.status === 'pending' && (
            <>
              <Button
                onClick={() => handleComplete('failed')}
                variant="destructive"
                disabled={
                  !isChecklistComplete || 
                  completeInspectionMutation.isLoading
                }
              >
                Fail Inspection
              </Button>
              
              <Button
                onClick={() => handleComplete('completed')}
                variant="primary"
                disabled={
                  !isChecklistComplete || 
                  completeInspectionMutation.isLoading
                }
              >
                {completeInspectionMutation.isLoading ? (
                  <>
                    <Spinner className="mr-2" size="sm" />
                    Submitting...
                  </>
                ) : (
                  'Pass Inspection'
                )}
              </Button>
            </>
          )}
          
          {checklist.status !== 'pending' && (
            <Badge 
              variant={checklist.status === 'completed' ? 'success' : 'destructive'}
              className="py-2 px-4"
            >
              {checklist.status === 'completed' ? 'INSPECTION PASSED' : 'INSPECTION FAILED'}
            </Badge>
          )}
        </div>
      </CardFooter>
    </Card>
  );
};

export default InspectionChecklist;