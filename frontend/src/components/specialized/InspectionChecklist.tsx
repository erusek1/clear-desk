// frontend/src/components/specialized/InspectionChecklist.tsx

import React, { useState, useMemo, useCallback } from 'react';
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
import { RadioGroup, RadioGroupItem } from '../common/RadioGroup';
import { Textarea } from '../common/Textarea';
import { Badge } from '../common/Badge';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';
import { 
  getInspectionChecklist, 
  updateInspectionItemResponse, 
  completeInspection 
} from '../../services/inspection.service';
import { useAuth } from '../../hooks/useAuth';
import { InspectionStatus } from '../../types/inspection.types';

// Define TypeScript interfaces for better type safety
interface InspectionItem {
  itemId: string;
  category: string;
  question: string;
  response: 'yes' | 'no' | 'n/a' | null;
  comment?: string;
  required: boolean;
}

interface Inspection {
  items: InspectionItem[];
  status: string;
  notes?: string;
}

interface ItemUpdatePayload {
  itemId: string;
  response: 'yes' | 'no' | 'n/a';
  comment?: string;
}

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
  // Input validation
  const isValidInput = useMemo(() => {
    return (
      typeof projectId === 'string' && 
      projectId.trim() !== '' &&
      typeof phase === 'string' && 
      phase.trim() !== '' &&
      typeof inspectionId === 'string' && 
      inspectionId.trim() !== ''
    );
  }, [projectId, phase, inspectionId]);

  // Hooks
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');
  const [selectedTab, setSelectedTab] = useState<string>('all');

  // If inputs are invalid, show error
  if (!isValidInput) {
    return (
      <Card className={`bg-white shadow-md ${className}`}>
        <CardContent className="py-6">
          <div className="text-red-500 flex items-center justify-center">
            <AlertCircle className="mr-2" />
            <span>Invalid inspection parameters provided</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Query for fetching the inspection checklist with error handling
  const { 
    data: checklist, 
    isLoading, 
    isError,
    error: queryError 
  } = useQuery<Inspection, Error>(
    ['inspection', projectId, phase, inspectionId],
    async () => {
      try {
        const result = await getInspectionChecklist(projectId, phase, inspectionId);
        if (!result || !result.items) {
          throw new Error('Invalid response format from server');
        }
        return result;
      } catch (error) {
        console.error('Error fetching inspection checklist:', error);
        throw error instanceof Error ? error : new Error('Unknown error fetching checklist');
      }
    },
    {
      refetchOnWindowFocus: false,
      retry: 1,
      onError: (error) => {
        console.error('Error in inspection checklist query:', error);
      }
    }
  );

  // Initialize notes from checklist data when available
  React.useEffect(() => {
    if (checklist?.notes) {
      setNotes(checklist.notes);
    }
  }, [checklist?.notes]);

  // Mutation for updating an item response with proper error handling
  const updateItemMutation = useMutation<Inspection, Error, ItemUpdatePayload>(
    async ({ itemId, response, comment }) => {
      if (!itemId || !response) {
        throw new Error('Invalid item ID or response');
      }
      
      return await updateInspectionItemResponse(
        projectId, 
        phase, 
        inspectionId, 
        itemId, 
        response, 
        comment
      );
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['inspection', projectId, phase, inspectionId]);
      },
      onError: (error) => {
        toast.error(`Failed to update response: ${error.message || 'Unknown error'}`);
        console.error('Error updating item response:', error);
      },
    }
  );

  // Mutation for completing the inspection with proper error handling
  const completeInspectionMutation = useMutation<any, Error, InspectionStatus>(
    async (status) => {
      if (!checklist || !checklist.items) {
        throw new Error('Checklist not loaded');
      }
      
      const itemResponses = checklist.items.map(item => ({
        itemId: item.itemId,
        response: item.response || 'n/a',
        comment: item.comment
      }));
      
      return await completeInspection(
        projectId, 
        phase, 
        inspectionId, 
        status, 
        itemResponses,
        notes
      );
    },
    {
      onSuccess: (data) => {
        toast.success(`Inspection ${data.status === 'completed' ? 'passed' : 'failed'} successfully`);
        queryClient.invalidateQueries(['inspection', projectId, phase, inspectionId]);
        queryClient.invalidateQueries(['project', projectId]);
        
        if (onComplete && typeof onComplete === 'function') {
          onComplete(data);
        }
      },
      onError: (error) => {
        toast.error(`Failed to complete inspection: ${error.message || 'Unknown error'}`);
        console.error('Error completing inspection:', error);
      },
    }
  );

  // Loading state
  if (isLoading) {
    return (
      <Card className={`bg-white shadow-md ${className}`}>
        <CardContent className="flex justify-center items-center py-10">
          <Spinner size="lg" aria-hidden="true" />
          <span className="ml-2">Loading inspection checklist...</span>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (isError || !checklist) {
    return (
      <Card className={`bg-white shadow-md ${className}`}>
        <CardContent className="flex justify-center items-center py-10 text-red-500">
          <AlertCircle className="mr-2" aria-hidden="true" />
          <span>
            Error loading inspection checklist: {queryError?.message || 'Unknown error'}
          </span>
        </CardContent>
      </Card>
    );
  }

  // Group items by category using memoization for better performance
  const { itemsByCategory, categories } = useMemo(() => {
    const itemsByCategory: Record<string, InspectionItem[]> = {};
    const categories: string[] = [];

    checklist.items.forEach(item => {
      const category = item.category || 'Uncategorized';
      
      if (!itemsByCategory[category]) {
        itemsByCategory[category] = [];
        categories.push(category);
      }
      itemsByCategory[category].push(item);
    });

    return { itemsByCategory, categories };
  }, [checklist.items]);

  // Count complete items using memoization
  const { completedItems, totalItems, isChecklistComplete } = useMemo(() => {
    const totalItems = checklist.items.length;
    const completedItems = checklist.items.filter(item => item.response !== null).length;
    
    return {
      completedItems,
      totalItems,
      isChecklistComplete: completedItems === totalItems
    };
  }, [checklist.items]);

  // Handle item response change with validation
  const handleResponseChange = useCallback((itemId: string, response: 'yes' | 'no' | 'n/a', comment?: string) => {
    if (!itemId || !response) {
      toast.error('Invalid item or response');
      return;
    }
    
    updateItemMutation.mutate({ itemId, response, comment });
  }, [updateItemMutation]);

  // Handle inspection completion with validation
  const handleComplete = useCallback((status: InspectionStatus) => {
    if (!isChecklistComplete) {
      toast.error('Please complete all checklist items before submitting');
      return;
    }
    
    completeInspectionMutation.mutate(status);
  }, [isChecklistComplete, completeInspectionMutation]);

  // Handle notes change
  const handleNotesChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(e.target.value);
  }, []);

  // Render inspection item
  const renderInspectionItem = useCallback((item: InspectionItem) => {
    return (
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
          aria-label={`Response for ${item.question}`}
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
          aria-label={`Comment for ${item.question}`}
        />
      </div>
    );
  }, [checklist.status, handleResponseChange]);

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
            <span>
              {completedItems} of {totalItems} items ({Math.round(completedItems / totalItems * 100)}%)
            </span>
          </div>
          <div className="h-2 w-full bg-gray-200 rounded overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${(completedItems / totalItems) * 100}%` }}
              role="progressbar" 
              aria-valuenow={(completedItems / totalItems) * 100} 
              aria-valuemin={0} 
              aria-valuemax={100}
            />
          </div>
        </div>
        
        {/* Tab navigation for categories */}
        <Tabs 
          value={selectedTab} 
          onValueChange={setSelectedTab} 
          className="mb-6"
        >
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
                  {itemsByCategory[category]?.map(renderInspectionItem)}
                </div>
              </div>
            ))}
          </TabsContent>
          
          {/* Category-specific tabs */}
          {categories.map(category => (
            <TabsContent key={category} value={category} className="mt-4">
              <div className="space-y-4">
                {itemsByCategory[category]?.map(renderInspectionItem)}
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
            onChange={handleNotesChange}
            className="min-h-24"
            disabled={checklist.status !== 'pending'}
            aria-label="Inspection notes"
          />
        </div>
      </CardContent>
      
      <CardFooter className="flex justify-between bg-gray-50 rounded-b-lg">
        <div className="text-sm text-gray-500 flex items-center">
          {!isChecklistComplete && (
            <>
              <Info className="h-4 w-4 mr-1" aria-hidden="true" />
              Complete all items to submit
            </>
          )}
          {isChecklistComplete && checklist.status === 'pending' && (
            <>
              <CheckCircle className="h-4 w-4 mr-1 text-green-500" aria-hidden="true" />
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
                aria-busy={completeInspectionMutation.isLoading}
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
                aria-busy={completeInspectionMutation.isLoading}
              >
                {completeInspectionMutation.isLoading ? (
                  <>
                    <Spinner className="mr-2" size="sm" aria-hidden="true" />
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