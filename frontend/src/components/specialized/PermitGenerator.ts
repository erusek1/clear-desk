// frontend/src/components/specialized/PermitGenerator.tsx

import React, { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Select } from '../common/Select';
import { Textarea } from '../common/Textarea';
import { Checkbox } from '../common/Checkbox';
import { RadioGroup } from '../common/RadioGroup';
import { Tab, Tabs } from '../common/Tabs';
import { permitService } from '../../services/permit.service';
import { PermitType } from '../../types/permit.types';

// Validation schema for electrical permits
const electricalPermitSchema = z.object({
  jurisdictionName: z.string().min(1, 'Jurisdiction name is required'),
  jobAddress: z.string().min(1, 'Job address is required'),
  jobCity: z.string().min(1, 'City is required'),
  jobState: z.string().min(1, 'State is required'),
  jobZip: z.string().min(5, 'Valid ZIP code is required'),
  ownerName: z.string().min(1, 'Owner name is required'),
  ownerPhone: z.string().optional(),
  ownerEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  contractorName: z.string().min(1, 'Contractor name is required'),
  contractorLicense: z.string().min(1, 'License number is required'),
  contractorPhone: z.string().min(1, 'Contractor phone is required'),
  contractorEmail: z.string().email('Invalid email'),
  serviceSize: z.preprocess(
    (val) => parseInt(val as string, 10),
    z.number().int().positive('Service size must be positive')
  ),
  serviceSizeUpgrade: z.boolean().optional(),
  serviceSizePrevious: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : undefined,
    z.number().int().positive('Previous service size must be positive').optional()
  ),
  phases: z.preprocess(
    (val) => parseInt(val as string, 10),
    z.number().int().min(1).max(3, 'Phases must be 1 or 3')
  ),
  voltage: z.preprocess(
    (val) => parseInt(val as string, 10),
    z.number().int().positive('Voltage must be positive')
  ),
  temporaryService: z.boolean().optional(),
  temporaryPoleRequired: z.boolean().optional(),
  receptacles: z.preprocess(
    (val) => parseInt(val as string, 10),
    z.number().int().min(0, 'Cannot be negative')
  ),
  switches: z.preprocess(
    (val) => parseInt(val as string, 10),
    z.number().int().min(0, 'Cannot be negative')
  ),
  lightFixtures: z.preprocess(
    (val) => parseInt(val as string, 10),
    z.number().int().min(0, 'Cannot be negative')
  ),
  fanFixtures: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : undefined,
    z.number().int().min(0, 'Cannot be negative').optional()
  ),
  rangeCircuits: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : undefined,
    z.number().int().min(0, 'Cannot be negative').optional()
  ),
  dryerCircuits: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : undefined,
    z.number().int().min(0, 'Cannot be negative').optional()
  ),
  waterHeaterCircuits: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : undefined,
    z.number().int().min(0, 'Cannot be negative').optional()
  ),
  hvacCircuits: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : undefined,
    z.number().int().min(0, 'Cannot be negative').optional()
  ),
  subPanels: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : undefined,
    z.number().int().min(0, 'Cannot be negative').optional()
  ),
  hasGenerator: z.boolean().optional(),
  generatorSize: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : undefined,
    z.number().positive('Generator size must be positive').optional()
  ),
  generatorTransferSwitch: z.boolean().optional(),
  generatorLocation: z.string().optional(),
  hasEvCharger: z.boolean().optional(),
  evChargerQuantity: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : undefined,
    z.number().int().positive('Quantity must be positive').optional()
  ),
  evChargerAmperage: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : undefined,
    z.number().int().positive('Amperage must be positive').optional()
  ),
  hasSolar: z.boolean().optional(),
  solarSize: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : undefined,
    z.number().positive('Solar size must be positive').optional()
  ),
  solarInverterType: z.string().optional(),
  solarPanels: z.preprocess(
    (val) => val ? parseInt(val as string, 10) : undefined,
    z.number().int().positive('Number of panels must be positive').optional()
  ),
  estimatedValue: z.preprocess(
    (val) => parseInt(val as string, 10),
    z.number().positive('Value must be positive')
  ),
  specialConditions: z.string().optional(),
  additionalNotes: z.string().optional(),
  notes: z.string().optional()
});

// Validation schema for estimate-based permits
const estimatePermitSchema = z.object({
  jurisdictionName: z.string().min(1, 'Jurisdiction name is required'),
  estimateId: z.string().uuid('Invalid estimate ID'),
  notes: z.string().optional()
});

interface PermitGeneratorProps {
  /** Project ID */
  projectId: string;
  /** Project details */
  project: any;
  /** Available estimates */
  estimates?: any[];
  /** On successful permit generation */
  onPermitGenerated?: (permitId: string) => void;
  /** Additional CSS class */
  className?: string;
}

/**
 * Component for generating permits
 */
const PermitGenerator: React.FC<PermitGeneratorProps> = ({
  projectId,
  project,
  estimates,
  onPermitGenerated,
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'fromEstimate'>('manual');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState<string>('');
  
  // Form for manual permit creation
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(electricalPermitSchema),
    defaultValues: {
      jurisdictionName: '',
      jobAddress: project?.address?.street || '',
      jobCity: project?.address?.city || '',
      jobState: project?.address?.state || '',
      jobZip: project?.address?.zip || '',
      ownerName: project?.customer?.name || '',
      ownerPhone: project?.customer?.phone || '',
      ownerEmail: project?.customer?.email || '',
      contractorName: project?.company?.name || '',
      contractorLicense: project?.company?.license || '',
      contractorPhone: project?.company?.phone || '',
      contractorEmail: project?.company?.email || '',
      serviceSize: '200',
      phases: '1',
      voltage: '240',
      receptacles: '0',
      switches: '0',
      lightFixtures: '0',
      estimatedValue: '0',
      serviceSizeUpgrade: false,
      temporaryService: false,
      temporaryPoleRequired: false,
      hasGenerator: false,
      hasEvCharger: false,
      hasSolar: false
    }
  });
  
  // Form for estimate-based permit creation
  const {
    control: estimateControl,
    handleSubmit: handleEstimateSubmit,
    formState: { errors: estimateErrors }
  } = useForm({
    resolver: zodResolver(estimatePermitSchema),
    defaultValues: {
      jurisdictionName: '',
      estimateId: '',
      notes: ''
    }
  });
  
  // Watch form values for conditional fields
  const watchServiceSizeUpgrade = watch('serviceSizeUpgrade');
  const watchTemporaryService = watch('temporaryService');
  const watchHasGenerator = watch('hasGenerator');
  const watchHasEvCharger = watch('hasEvCharger');
  const watchHasSolar = watch('hasSolar');
  
  /**
   * Submit handler for manual permit creation
   */
  const onSubmitManual = async (data: any) => {
    try {
      setIsLoading(true);
      
      // Format form data for API
      const formData = {
        jobAddress: data.jobAddress,
        jobCity: data.jobCity,
        jobState: data.jobState,
        jobZip: data.jobZip,
        ownerName: data.ownerName,
        ownerPhone: data.ownerPhone,
        ownerEmail: data.ownerEmail,
        contractorName: data.contractorName,
        contractorLicense: data.contractorLicense,
        contractorPhone: data.contractorPhone,
        contractorEmail: data.contractorEmail,
        serviceSize: parseInt(data.serviceSize, 10),
        serviceSizeUpgrade: data.serviceSizeUpgrade,
        serviceSizePrevious: data.serviceSizePrevious ? parseInt(data.serviceSizePrevious, 10) : undefined,
        phases: parseInt(data.phases, 10),
        voltage: parseInt(data.voltage, 10),
        temporaryService: data.temporaryService,
        temporaryPoleRequired: data.temporaryPoleRequired,
        receptacles: parseInt(data.receptacles, 10),
        switches: parseInt(data.switches, 10),
        lightFixtures: parseInt(data.lightFixtures, 10),
        fanFixtures: data.fanFixtures ? parseInt(data.fanFixtures, 10) : undefined,
        rangeCircuits: data.rangeCircuits ? parseInt(data.rangeCircuits, 10) : undefined,
        dryerCircuits: data.dryerCircuits ? parseInt(data.dryerCircuits, 10) : undefined,
        waterHeaterCircuits: data.waterHeaterCircuits ? parseInt(data.waterHeaterCircuits, 10) : undefined,
        hvacCircuits: data.hvacCircuits ? parseInt(data.hvacCircuits, 10) : undefined,
        subPanels: data.subPanels ? parseInt(data.subPanels, 10) : undefined,
        estimatedValue: parseInt(data.estimatedValue, 10),
        specialConditions: data.specialConditions,
        additionalNotes: data.additionalNotes
      };
      
      // Add generator details if present
      if (data.hasGenerator) {
        formData.generatorDetails = {
          size: parseInt(data.generatorSize, 10),
          transferSwitch: data.generatorTransferSwitch,
          location: data.generatorLocation
        };
      }
      
      // Add EV charger details if present
      if (data.hasEvCharger) {
        formData.evChargerDetails = {
          quantity: parseInt(data.evChargerQuantity, 10),
          amperage: parseInt(data.evChargerAmperage, 10)
        };
      }
      
      // Add solar details if present
      if (data.hasSolar) {
        formData.solarDetails = {
          size: parseInt(data.solarSize, 10),
          inverterType: data.solarInverterType,
          panels: parseInt(data.solarPanels, 10)
        };
      }
      
      // Generate the permit
      const result = await permitService.generateElectricalPermit(
        projectId,
        data.jurisdictionName,
        formData,
        data.notes
      );
      
      toast.success('Permit created successfully');
      
      // Call callback if provided
      if (onPermitGenerated) {
        onPermitGenerated(result.data.permit.id);
      }
      
      // Open the PDF in a new tab
      if (result.data.pdfUrl) {
        window.open(result.data.pdfUrl, '_blank');
      }
    } catch (error) {
      console.error('Error creating permit:', error);
      toast.error('Failed to create permit');
    } finally {
      setIsLoading(false);
    }
  };
  
  /**
   * Submit handler for estimate-based permit creation
   */
  const onSubmitEstimate = async (data: any) => {
    try {
      setIsLoading(true);
      
      // Generate the permit from estimate
      const result = await permitService.generateElectricalPermitFromEstimate(
        projectId,
        data.estimateId,
        data.jurisdictionName,
        {},
        data.notes
      );
      
      toast.success('Permit created successfully');
      
      // Call callback if provided
      if (onPermitGenerated) {
        onPermitGenerated(result.data.permit.id);
      }
      
      // Open the PDF in a new tab
      if (result.data.pdfUrl) {
        window.open(result.data.pdfUrl, '_blank');
      }
    } catch (error) {
      console.error('Error creating permit:', error);
      toast.error('Failed to create permit');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Card className={`bg-white shadow-md ${className}`}>
      <CardHeader>
        <CardTitle>Generate Permit</CardTitle>
        <CardDescription>
          Create a new permit for submission to the jurisdiction
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <Tabs value={activeTab} onChange={setActiveTab as any}>
          <Tab id="manual" label="Manual Entry">
            <form onSubmit={handleSubmit(onSubmitManual)} className="space-y-6 mt-4">
              <div className="bg-gray-50 p-4 rounded-md mb-6">
                <h3 className="text-lg font-medium mb-4">Basic Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Controller
                      name="jurisdictionName"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Jurisdiction"
                          placeholder="Enter jurisdiction name"
                          error={errors.jurisdictionName?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <Controller
                      name="jobAddress"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Job Address"
                          placeholder="Enter job address"
                          error={errors.jobAddress?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="jobCity"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="City"
                          placeholder="Enter city"
                          error={errors.jobCity?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <Controller
                      name="jobState"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="State"
                          placeholder="State"
                          error={errors.jobState?.message}
                          {...field}
                        />
                      )}
                    />
                    
                    <Controller
                      name="jobZip"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="ZIP Code"
                          placeholder="ZIP"
                          error={errors.jobZip?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-md mb-6">
                <h3 className="text-lg font-medium mb-4">Owner Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Controller
                      name="ownerName"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Owner Name"
                          placeholder="Enter owner name"
                          error={errors.ownerName?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="ownerPhone"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Owner Phone (Optional)"
                          placeholder="Enter owner phone"
                          error={errors.ownerPhone?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="ownerEmail"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Owner Email (Optional)"
                          placeholder="Enter owner email"
                          error={errors.ownerEmail?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-md mb-6">
                <h3 className="text-lg font-medium mb-4">Contractor Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Controller
                      name="contractorName"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Contractor Name"
                          placeholder="Enter contractor name"
                          error={errors.contractorName?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="contractorLicense"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="License Number"
                          placeholder="Enter license number"
                          error={errors.contractorLicense?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <Controller
                      name="contractorPhone"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Contractor Phone"
                          placeholder="Enter contractor phone"
                          error={errors.contractorPhone?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <Controller
                      name="contractorEmail"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Contractor Email"
                          placeholder="Enter contractor email"
                          error={errors.contractorEmail?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-md mb-6">
                <h3 className="text-lg font-medium mb-4">Electrical Service Details</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Controller
                      name="serviceSize"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Service Size (Amps)"
                          type="number"
                          min="0"
                          placeholder="Enter service size"
                          error={errors.serviceSize?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="phases"
                      control={control}
                      render={({ field }) => (
                        <Select
                          label="Phases"
                          error={errors.phases?.message}
                          {...field}
                        >
                          <option value="1">1 Phase</option>
                          <option value="3">3 Phase</option>
                        </Select>
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="voltage"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Voltage"
                          type="number"
                          min="0"
                          placeholder="Enter voltage"
                          error={errors.voltage?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div className="col-span-3">
                    <Controller
                      name="serviceSizeUpgrade"
                      control={control}
                      render={({ field: { onChange, value, ...rest } }) => (
                        <Checkbox
                          label="This is a service upgrade"
                          checked={value}
                          onChange={onChange}
                          {...rest}
                        />
                      )}
                    />
                  </div>
                  
                  {watchServiceSizeUpgrade && (
                    <div>
                      <Controller
                        name="serviceSizePrevious"
                        control={control}
                        render={({ field }) => (
                          <Input
                            label="Previous Service Size (Amps)"
                            type="number"
                            min="0"
                            placeholder="Enter previous size"
                            error={errors.serviceSizePrevious?.message}
                            {...field}
                          />
                        )}
                      />
                    </div>
                  )}
                  
                  <div className="col-span-3">
                    <Controller
                      name="temporaryService"
                      control={control}
                      render={({ field: { onChange, value, ...rest } }) => (
                        <Checkbox
                          label="Temporary Service Required"
                          checked={value}
                          onChange={onChange}
                          {...rest}
                        />
                      )}
                    />
                  </div>
                  
                  {watchTemporaryService && (
                    <div className="col-span-3">
                      <Controller
                        name="temporaryPoleRequired"
                        control={control}
                        render={({ field: { onChange, value, ...rest } }) => (
                          <Checkbox
                            label="Temporary Pole Required"
                            checked={value}
                            onChange={onChange}
                            {...rest}
                          />
                        )}
                      />
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-md mb-6">
                <h3 className="text-lg font-medium mb-4">Devices and Fixtures</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Controller
                      name="receptacles"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Receptacles"
                          type="number"
                          min="0"
                          placeholder="Enter count"
                          error={errors.receptacles?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="switches"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Switches"
                          type="number"
                          min="0"
                          placeholder="Enter count"
                          error={errors.switches?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="lightFixtures"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Light Fixtures"
                          type="number"
                          min="0"
                          placeholder="Enter count"
                          error={errors.lightFixtures?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="fanFixtures"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Fan Fixtures (Optional)"
                          type="number"
                          min="0"
                          placeholder="Enter count"
                          error={errors.fanFixtures?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="rangeCircuits"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Range Circuits (Optional)"
                          type="number"
                          min="0"
                          placeholder="Enter count"
                          error={errors.rangeCircuits?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="dryerCircuits"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Dryer Circuits (Optional)"
                          type="number"
                          min="0"
                          placeholder="Enter count"
                          error={errors.dryerCircuits?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="waterHeaterCircuits"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Water Heater Circuits (Optional)"
                          type="number"
                          min="0"
                          placeholder="Enter count"
                          error={errors.waterHeaterCircuits?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="hvacCircuits"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="HVAC Circuits (Optional)"
                          type="number"
                          min="0"
                          placeholder="Enter count"
                          error={errors.hvacCircuits?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="subPanels"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Sub-Panels (Optional)"
                          type="number"
                          min="0"
                          placeholder="Enter count"
                          error={errors.subPanels?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-md mb-6">
                <h3 className="text-lg font-medium mb-4">Special Equipment</h3>
                
                <div className="space-y-6">
                  <div>
                    <Controller
                      name="hasGenerator"
                      control={control}
                      render={({ field: { onChange, value, ...rest } }) => (
                        <Checkbox
                          label="Generator"
                          checked={value}
                          onChange={onChange}
                          {...rest}
                        />
                      )}
                    />
                  </div>
                  
                  {watchHasGenerator && (
                    <div className="pl-6 border-l-2 border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Controller
                            name="generatorSize"
                            control={control}
                            render={({ field }) => (
                              <Input
                                label="Generator Size (kW)"
                                type="number"
                                min="0"
                                step="0.1"
                                placeholder="Enter size"
                                error={errors.generatorSize?.message}
                                {...field}
                              />
                            )}
                          />
                        </div>
                        
                        <div>
                          <Controller
                            name="generatorLocation"
                            control={control}
                            render={({ field }) => (
                              <Input
                                label="Generator Location"
                                placeholder="Enter location"
                                error={errors.generatorLocation?.message}
                                {...field}
                              />
                            )}
                          />
                        </div>
                        
                        <div className="col-span-2">
                          <Controller
                            name="generatorTransferSwitch"
                            control={control}
                            render={({ field: { onChange, value, ...rest } }) => (
                              <Checkbox
                                label="Transfer Switch Required"
                                checked={value}
                                onChange={onChange}
                                {...rest}
                              />
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <Controller
                      name="hasEvCharger"
                      control={control}
                      render={({ field: { onChange, value, ...rest } }) => (
                        <Checkbox
                          label="EV Charger"
                          checked={value}
                          onChange={onChange}
                          {...rest}
                        />
                      )}
                    />
                  </div>
                  
                  {watchHasEvCharger && (
                    <div className="pl-6 border-l-2 border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Controller
                            name="evChargerQuantity"
                            control={control}
                            render={({ field }) => (
                              <Input
                                label="Quantity"
                                type="number"
                                min="1"
                                placeholder="Enter quantity"
                                error={errors.evChargerQuantity?.message}
                                {...field}
                              />
                            )}
                          />
                        </div>
                        
                        <div>
                          <Controller
                            name="evChargerAmperage"
                            control={control}
                            render={({ field }) => (
                              <Input
                                label="Amperage"
                                type="number"
                                min="0"
                                placeholder="Enter amperage"
                                error={errors.evChargerAmperage?.message}
                                {...field}
                              />
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <Controller
                      name="hasSolar"
                      control={control}
                      render={({ field: { onChange, value, ...rest } }) => (
                        <Checkbox
                          label="Solar System"
                          checked={value}
                          onChange={onChange}
                          {...rest}
                        />
                      )}
                    />
                  </div>
                  
                  {watchHasSolar && (
                    <div className="pl-6 border-l-2 border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Controller
                            name="solarSize"
                            control={control}
                            render={({ field }) => (
                              <Input
                                label="System Size (kW)"
                                type="number"
                                min="0"
                                step="0.1"
                                placeholder="Enter size"
                                error={errors.solarSize?.message}
                                {...field}
                              />
                            )}
                          />
                        </div>
                        
                        <div>
                          <Controller
                            name="solarPanels"
                            control={control}
                            render={({ field }) => (
                              <Input
                                label="Number of Panels"
                                type="number"
                                min="1"
                                placeholder="Enter panel count"
                                error={errors.solarPanels?.message}
                                {...field}
                              />
                            )}
                          />
                        </div>
                        
                        <div className="col-span-2">
                          <Controller
                            name="solarInverterType"
                            control={control}
                            render={({ field }) => (
                              <Input
                                label="Inverter Type"
                                placeholder="Enter inverter type"
                                error={errors.solarInverterType?.message}
                                {...field}
                              />
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-md mb-6">
                <h3 className="text-lg font-medium mb-4">Additional Information</h3>
                
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Controller
                      name="estimatedValue"
                      control={control}
                      render={({ field }) => (
                        <Input
                          label="Estimated Value ($)"
                          type="number"
                          min="0"
                          placeholder="Enter value"
                          error={errors.estimatedValue?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="specialConditions"
                      control={control}
                      render={({ field }) => (
                        <Textarea
                          label="Special Conditions (Optional)"
                          placeholder="Enter any special conditions"
                          rows={3}
                          error={errors.specialConditions?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="additionalNotes"
                      control={control}
                      render={({ field }) => (
                        <Textarea
                          label="Additional Notes (Optional)"
                          placeholder="Enter any additional notes"
                          rows={3}
                          error={errors.additionalNotes?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                  
                  <div>
                    <Controller
                      name="notes"
                      control={control}
                      render={({ field }) => (
                        <Textarea
                          label="Internal Notes (Not included in permit)"
                          placeholder="Enter internal notes"
                          rows={3}
                          error={errors.notes?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
            </form>
          </Tab>
          
          <Tab id="fromEstimate" label="From Estimate">
            <form onSubmit={handleEstimateSubmit(onSubmitEstimate)} className="space-y-6 mt-4">
              <div className="bg-gray-50 p-4 rounded-md mb-6">
                <h3 className="text-lg font-medium mb-4">Estimate Selection</h3>
                
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Controller
                      name="estimateId"
                      control={estimateControl}
                      render={({ field }) => (
                        <Select
                          label="Select Estimate"
                          error={estimateErrors.estimateId?.message}
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            setSelectedEstimate(e.target.value);
                          }}
                        >
                          <option value="">Select an estimate</option>
                          {estimates && estimates.map((estimate) => (
                            <option key={estimate.id} value={estimate.id}>
                              {estimate.name || `Estimate #${estimate.number || estimate.id}`} 
                              ({new Date(estimate.created).toLocaleDateString()})
                            </option>
                          ))}
                        </Select>
                      )}
                    />
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-md mb-6">
                <h3 className="text-lg font-medium mb-4">Jurisdiction Information</h3>
                
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Controller
                      name="jurisdictionName"
                      control={estimateControl}
                      render={({ field }) => (
                        <Input
                          label="Jurisdiction"
                          placeholder="Enter jurisdiction name"
                          error={estimateErrors.jurisdictionName?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-md mb-6">
                <h3 className="text-lg font-medium mb-4">Additional Information</h3>
                
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Controller
                      name="notes"
                      control={estimateControl}
                      render={({ field }) => (
                        <Textarea
                          label="Internal Notes (Not included in permit)"
                          placeholder="Enter internal notes"
                          rows={3}
                          error={estimateErrors.notes?.message}
                          {...field}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
            </form>
          </Tab>
        </Tabs>
      </CardContent>
      
      <CardFooter className="flex justify-end bg-gray-50 rounded-b-lg">
        <Button
          type="submit"
          variant="primary"
          disabled={isLoading}
          onClick={() => {
            if (activeTab === 'manual') {
              handleSubmit(onSubmitManual)();
            } else {
              handleEstimateSubmit(onSubmitEstimate)();
            }
          }}
        >
          {isLoading ? (
            <>
              <Spinner className="mr-2" size="sm" />
              Generating...