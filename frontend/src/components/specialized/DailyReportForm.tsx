// frontend/src/components/specialized/DailyReportForm.tsx

import React, { useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Input } from '../common/Input';
import { Textarea } from '../common/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../common/Select';
import { Label } from '../common/Label';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../common/Accordion';
import { Camera, Plus, Trash2, Sun, Cloud, CloudRain, CloudSnow } from 'lucide-react';
import { submitDailyReport, getProjectEmployees } from '../../services/time-tracking.service';
import { useAuth } from '../../hooks/useAuth';

interface IDailyReportFormProps {
  /** Project ID */
  projectId: string;
  /** Callback after successful submission */
  onSubmit?: (result: any) => void;
  /** Pre-selected date, defaults to today */
  selectedDate?: string;
  /** Additional CSS class names */
  className?: string;
}

// Form validation schema
const formSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Required in YYYY-MM-DD format' }),
  weather: z.object({
    conditions: z.string().min(1, { message: 'Weather conditions are required' }),
    temperature: z.number().min(-60).max(130),
    impacts: z.string().optional(),
  }),
  crew: z.array(
    z.object({
      userId: z.string().uuid({ message: 'Valid employee is required' }),
      hours: z.number().positive({ message: 'Hours must be greater than 0' }),
    })
  ).min(1, { message: 'At least one crew member is required' }),
  workCompleted: z.string().min(5, { message: 'Description of work completed is required' }),
  workPlanned: z.string().optional(),
  issues: z.array(
    z.object({
      description: z.string().min(1, { message: 'Issue description is required' }),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      status: z.enum(['open', 'in-progress', 'resolved']),
      assignedTo: z.string().uuid().optional(),
    })
  ).optional(),
  materialRequests: z.array(
    z.object({
      materialId: z.string().min(1, { message: 'Material is required' }),
      quantity: z.number().positive({ message: 'Quantity must be greater than 0' }),
      urgency: z.enum(['low', 'medium', 'high']),
      notes: z.string().optional(),
    })
  ).optional(),
  extraWork: z.array(
    z.object({
      description: z.string().min(1, { message: 'Description is required' }),
      authorizedBy: z.string().optional(),
      estimatedHours: z.number().nonnegative().optional(),
      estimatedMaterials: z.number().nonnegative().optional(),
    })
  ).optional(),
  photos: z.array(
    z.object({
      s3Key: z.string().min(1, { message: 'Photo is required' }),
      caption: z.string().optional(),
    })
  ).optional(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * Daily report form component for submitting project progress
 * 
 * Handles crew hours, work completed, issues, material requests, etc.
 */
export const DailyReportForm: React.FC<IDailyReportFormProps> = ({
  projectId,
  onSubmit,
  selectedDate = new Date().toISOString().split('T')[0],
  className = '',
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [photoUploads, setPhotoUploads] = useState<{ file: File; progress: number; s3Key?: string }[]>([]);

  // Get project employees
  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery(
    ['employees', projectId],
    () => getProjectEmployees(projectId),
    {
      refetchOnWindowFocus: false,
    }
  );

  // Form setup
  const { 
    register, 
    control, 
    handleSubmit, 
    formState: { errors, isSubmitting },
    reset, 
    setValue,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: selectedDate,
      weather: {
        conditions: 'clear',
        temperature: 70,
        impacts: '',
      },
      crew: [{ userId: user?.id || '', hours: 8 }],
      workCompleted: '',
      workPlanned: '',
      issues: [],
      materialRequests: [],
      extraWork: [],
      photos: [],
    },
  });

  // Field arrays
  const { fields: crewFields, append: appendCrew, remove: removeCrew } = useFieldArray({
    control,
    name: 'crew',
  });

  const { fields: issueFields, append: appendIssue, remove: removeIssue } = useFieldArray({
    control,
    name: 'issues',
  });

  const { fields: materialFields, append: appendMaterial, remove: removeMaterial } = useFieldArray({
    control,
    name: 'materialRequests',
  });

  const { fields: extraWorkFields, append: appendExtraWork, remove: removeExtraWork } = useFieldArray({
    control,
    name: 'extraWork',
  });

  const { fields: photoFields, append: appendPhoto, remove: removePhoto } = useFieldArray({
    control,
    name: 'photos',
  });

  // Submission mutation
  const submitMutation = useMutation(
    (data: FormValues) => submitDailyReport(projectId, data),
    {
      onSuccess: (data) => {
        toast.success('Daily report submitted successfully');
        queryClient.invalidateQueries(['project', projectId]);
        queryClient.invalidateQueries(['daily-reports', projectId]);
        
        if (onSubmit) {
          onSubmit(data);
        }
        
        reset();
        setPhotoUploads([]);
      },
      onError: (error: any) => {
        toast.error(`Failed to submit report: ${error.message || 'Unknown error'}`);
      },
    }
  );

  // Form submission handler
  const onFormSubmit = (data: FormValues) => {
    // Add photo uploads to the form data
    const photosWithKeys = photoUploads
      .filter(upload => upload.s3Key)
      .map(upload => ({
        s3Key: upload.s3Key!,
        caption: upload.file.name,
      }));
    
    const formData = {
      ...data,
      photos: photosWithKeys,
    };
    
    submitMutation.mutate(formData);
  };

  // Weather condition options
  const weatherConditions = [
    { value: 'clear', label: 'Clear', icon: <Sun /> },
    { value: 'cloudy', label: 'Cloudy', icon: <Cloud /> },
    { value: 'rain', label: 'Rain', icon: <CloudRain /> },
    { value: 'snow', label: 'Snow', icon: <CloudSnow /> },
  ];

  return (
    <Card className={`bg-white shadow-md ${className}`}>
      <CardHeader>
        <CardTitle>Daily Report</CardTitle>
        <CardDescription>
          Report on work completed, hours, issues, and materials
        </CardDescription>
      </CardHeader>
      
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <CardContent className="space-y-6">
          {/* Date and Weather */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                {...register('date')}
                error={errors.date?.message}
              />
            </div>
            
            <div>
              <Label>Weather Conditions</Label>
              <div className="grid grid-cols-2 gap-4">
                <Controller
                  control={control}
                  name="weather.conditions"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select conditions" />
                      </SelectTrigger>
                      <SelectContent>
                        {weatherConditions.map(condition => (
                          <SelectItem key={condition.value} value={condition.value}>
                            <div className="flex items-center">
                              {condition.icon}
                              <span className="ml-2">{condition.label}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                
                <Controller
                  control={control}
                  name="weather.temperature"
                  render={({ field }) => (
                    <Input
                      type="number"
                      placeholder="Temperature °F"
                      value={field.value}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      error={errors.weather?.temperature?.message}
                    />
                  )}
                />
              </div>
              
              <div className="mt-2">
                <Textarea
                  placeholder="Weather impacts on work (optional)"
                  {...register('weather.impacts')}
                />
              </div>
            </div>
          </div>
          
          {/* Crew Members */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>Crew</Label>
              <Button 
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendCrew({ userId: '', hours: 8 })}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Crew Member
              </Button>
            </div>
            
            {crewFields.length === 0 ? (
              <div className="text-center p-4 border border-dashed rounded">
                No crew members added
              </div>
            ) : (
              <div className="space-y-2">
                {crewFields.map((field, index) => (
                  <div key={field.id} className="flex items-start space-x-2">
                    <div className="flex-grow grid grid-cols-2 gap-2">
                      <Controller
                        control={control}
                        name={`crew.${index}.userId`}
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select employee" />
                            </SelectTrigger>
                            <SelectContent>
                              {isLoadingEmployees ? (
                                <SelectItem value="loading" disabled>
                                  Loading employees...
                                </SelectItem>
                              ) : (
                                employees.map(employee => (
                                  <SelectItem key={employee.id} value={employee.id}>
                                    {employee.firstName} {employee.lastName}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      
                      <Controller
                        control={control}
                        name={`crew.${index}.hours`}
                        render={({ field }) => (
                          <Input
                            type="number"
                            placeholder="Hours"
                            value={field.value}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            step="0.5"
                            error={errors.crew?.[index]?.hours?.message}
                          />
                        )}
                      />
                    </div>
                    
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCrew(index)}
                      className="text-red-500"
                      disabled={crewFields.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {errors.crew && (
              <p className="text-sm text-red-500 mt-1">{errors.crew.message}</p>
            )}
          </div>
          
          {/* Work Completed & Planned */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="workCompleted">Work Completed Today</Label>
              <Textarea
                id="workCompleted"
                placeholder="Describe the work completed today"
                className="min-h-24"
                {...register('workCompleted')}
                error={errors.workCompleted?.message}
              />
            </div>
            
            <div>
              <Label htmlFor="workPlanned">Work Planned For Tomorrow (Optional)</Label>
              <Textarea
                id="workPlanned"
                placeholder="Describe the work planned for tomorrow"
                className="min-h-16"
                {...register('workPlanned')}
              />
            </div>
          </div>
          
          {/* Accordion sections for optional items */}
          <Accordion type="multiple" className="w-full">
            {/* Issues Section */}
            <AccordionItem value="issues">
              <AccordionTrigger>Issues & Problems</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => appendIssue({
                        description: '',
                        severity: 'medium',
                        status: 'open',
                        assignedTo: ''
                      })}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Issue
                    </Button>
                  </div>
                  
                  {issueFields.length === 0 ? (
                    <div className="text-center p-4 border border-dashed rounded">
                      No issues reported
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {issueFields.map((field, index) => (
                        <div key={field.id} className="p-3 border rounded">
                          <div className="flex justify-between mb-2">
                            <h4 className="text-sm font-medium">Issue #{index + 1}</h4>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeIssue(index)}
                              className="text-red-500 h-6 w-6"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          <div className="space-y-2">
                            <div>
                              <Label htmlFor={`issues.${index}.description`}>Description</Label>
                              <Textarea
                                id={`issues.${index}.description`}
                                placeholder="Describe the issue"
                                {...register(`issues.${index}.description`)}
                                error={errors.issues?.[index]?.description?.message}
                              />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label htmlFor={`issues.${index}.severity`}>Severity</Label>
                                <Controller
                                  control={control}
                                  name={`issues.${index}.severity`}
                                  render={({ field }) => (
                                    <Select
                                      value={field.value}
                                      onValueChange={field.onChange}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select severity" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="low">Low</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="critical">Critical</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                              </div>
                              
                              <div>
                                <Label htmlFor={`issues.${index}.status`}>Status</Label>
                                <Controller
                                  control={control}
                                  name={`issues.${index}.status`}
                                  render={({ field }) => (
                                    <Select
                                      value={field.value}
                                      onValueChange={field.onChange}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select status" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="open">Open</SelectItem>
                                        <SelectItem value="in-progress">In Progress</SelectItem>
                                        <SelectItem value="resolved">Resolved</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  )}
                                />
                              </div>
                            </div>
                            
                            <div>
                              <Label htmlFor={`issues.${index}.assignedTo`}>Assigned To (Optional)</Label>
                              <Controller
                                control={control}
                                name={`issues.${index}.assignedTo`}
                                render={({ field }) => (
                                  <Select
                                    value={field.value || ""}
                                    onValueChange={field.onChange}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Assign to someone" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="">Unassigned</SelectItem>
                                      {employees.map(employee => (
                                        <SelectItem key={employee.id} value={employee.id}>
                                          {employee.firstName} {employee.lastName}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
            
            {/* Material Requests */}
            <AccordionItem value="materials">
              <AccordionTrigger>Material Requests</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => appendMaterial({
                        materialId: '',
                        quantity: 1,
                        urgency: 'medium',
                        notes: ''
                      })}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Material Request
                    </Button>
                  </div>
                  
                  {materialFields.length === 0 ? (
                    <div className="text-center p-4 border border-dashed rounded">
                      No material requests added
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Material request fields would go here */}
                      {/* Similar pattern to issues section */}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
            
            {/* Extra Work */}
            <AccordionItem value="extraWork">
              <AccordionTrigger>Extra Work</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => appendExtraWork({
                        description: '',
                        authorizedBy: '',
                        estimatedHours: 0,
                        estimatedMaterials: 0
                      })}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Extra Work
                    </Button>
                  </div>
                  
                  {extraWorkFields.length === 0 ? (
                    <div className="text-center p-4 border border-dashed rounded">
                      No extra work reported
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Extra work fields would go here */}
                      {/* Similar pattern to issues section */}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
            
            {/* Photos */}
            <AccordionItem value="photos">
              <AccordionTrigger>Photos</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Photo upload functionality would be implemented here
                        // This would typically involve selecting a file and uploading it to S3
                      }}
                    >
                      <Camera className="h-4 w-4 mr-1" />
                      Add Photo
                    </Button>
                  </div>
                  
                  {photoUploads.length === 0 ? (
                    <div className="text-center p-4 border border-dashed rounded">
                      No photos added
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {/* Photo previews would go here */}
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
        
        <CardFooter className="bg-gray-50 rounded-b-lg">
          <Button type="submit" variant="primary" disabled={isSubmitting} className="ml-auto">
            {isSubmitting ? (
              <>
                <Spinner className="mr-2" size="sm" />
                Submitting...
              </>
            ) : (
              'Submit Daily Report'
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default DailyReportForm;