// frontend/src/components/form-sections/ElectricalSection.tsx

import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ElectricalSectionProps } from './FormSectionTypes';

const SERVICE_SIZES = ['100', '150', '200', '300', '400'];
const VOLTAGE_OPTIONS = [
  { value: '120-240', label: '120/240V' },
  { value: '120-208', label: '120/208V' },
  { value: '277-480', label: '277/480V' }
];

const ElectricalSection: React.FC<ElectricalSectionProps> = ({ 
  formData = {}, 
  updateFormData, 
  toggleCheckbox, 
  setRadioValue, 
  toggleCheckboxOption 
}) => {
  // Create a wrapper handler to ensure data is structured correctly
  const handleChange = (field: string, value: any) => {
    console.log('ElectricalSection handleChange:', field, value);
    // Use updateFormData directly with the field and value
    updateFormData(field, value);
  };

  const handleGeneratorChange = (field: string, value: any) => {
    const generator = {
      ...(formData.generator || {}),
      [field]: value
    };
    handleChange('generator', generator);
  };

  // Fallback handlers in case the props aren't passed
  const handleRadioClick = (fieldId: string, value: string) => {
    if (setRadioValue) {
      setRadioValue(fieldId, value);
    } else {
      updateFormData(fieldId, value);
    }
  };

  return (
    <div className="space-y-6">
      {/* Service Details */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="text-lg font-semibold">Electrical Service Details</div>

          {/* Service Entry Type */}
          <div className="space-y-2">
            <Label>Service Entry Type</Label>
            <div className="space-y-2">
              {[
                { value: 'overhead', label: 'Overhead' },
                { value: 'underground', label: 'Underground' }
              ].map((option) => {
                const isSelected = formData.serviceType === option.value;
                
                return (
                  <div 
                    key={option.value} 
                    className="flex items-center space-x-2 cursor-pointer"
                    onClick={() => handleRadioClick('serviceType', option.value)}
                  >
                    {/* Custom radio visual */}
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
                    </div>
                    
                    {/* Label */}
                    <span className="text-sm">{option.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Phase Selection */}
          <div className="space-y-2">
            <Label>Phase Type</Label>
            <div className="space-y-2">
              {[
                { value: 'single', label: 'Single Phase' },
                { value: 'three', label: 'Three Phase' }
              ].map((option) => {
                const isSelected = formData.phaseType === option.value;
                
                return (
                  <div 
                    key={option.value} 
                    className="flex items-center space-x-2 cursor-pointer"
                    onClick={() => handleRadioClick('phaseType', option.value)}
                  >
                    {/* Custom radio visual */}
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
                    </div>
                    
                    {/* Label */}
                    <span className="text-sm">{option.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Voltage Selection */}
          <div>
            <Label htmlFor="voltage">System Voltage</Label>
            <Select 
              value={formData.voltage || ''} 
              onValueChange={(value) => handleChange('voltage', value)}
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select system voltage" />
              </SelectTrigger>
              <SelectContent>
                {VOLTAGE_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Service Size */}
          <div>
            <Label htmlFor="serviceSize">Service Size</Label>
            <Select 
              value={formData.serviceSize || ''} 
              onValueChange={(value) => handleChange('serviceSize', value)}
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select service size" />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_SIZES.map(size => (
                  <SelectItem key={size} value={size}>
                    {size} Amp
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Meter Location */}
          <div>
            <Label htmlFor="meterLocation">Meter Location</Label>
            <Input
              id="meterLocation"
              value={formData.meterLocation || ''}
              onChange={(e) => handleChange('meterLocation', e.target.value)}
              placeholder="Specify meter location"
              className="mt-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Panel Location */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="text-lg font-semibold">Electrical Panel</div>
          
          <div>
            <Label htmlFor="panelLocation">Panel Location (requires 18" width, 3' front clearance)</Label>
            <Input
              id="panelLocation"
              value={formData.panelLocation || ''}
              onChange={(e) => handleChange('panelLocation', e.target.value)}
              placeholder="Specify panel location"
              className="mt-2"
            />
            <p className="text-sm text-gray-500 mt-1">
              Note: Cannot be located in bathrooms or coat closets
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Generator */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Whole House Generator</div>
            <Switch
              id="hasGenerator"
              checked={formData.hasGenerator || false}
              onCheckedChange={(checked) => handleChange('hasGenerator', checked)}
            />
          </div>

          {formData.hasGenerator && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="generator-location">Generator Location</Label>
                <Input
                  id="generator-location"
                  value={formData.generator?.location || ''}
                  onChange={(e) => handleGeneratorChange('location', e.target.value)}
                  placeholder="Specify generator location"
                  className="mt-2"
                />
              </div>
              
              <div>
                <Label htmlFor="generator-size">Generator Size (kW)</Label>
                <Input
                  id="generator-size"
                  type="number"
                  value={formData.generator?.size || ''}
                  onChange={(e) => handleGeneratorChange('size', e.target.value)}
                  placeholder="Enter size in kW"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="generator-manufacturer">Manufacturer</Label>
                <Input
                  id="generator-manufacturer"
                  value={formData.generator?.manufacturer || ''}
                  onChange={(e) => handleGeneratorChange('manufacturer', e.target.value)}
                  placeholder="Enter manufacturer name"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="generator-model">Model Number</Label>
                <Input
                  id="generator-model"
                  value={formData.generator?.model || ''}
                  onChange={(e) => handleGeneratorChange('model', e.target.value)}
                  placeholder="Enter model number"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="generator-transfer-switch">Transfer Switch Model</Label>
                <Input
                  id="generator-transfer-switch"
                  value={formData.generator?.transferSwitch || ''}
                  onChange={(e) => handleGeneratorChange('transferSwitch', e.target.value)}
                  placeholder="Enter transfer switch model"
                  className="mt-2"
                />
              </div>

              <div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="needs-spec-sheet"
                    checked={formData.generator?.needsSpecSheet || false}
                    onCheckedChange={(checked) => handleGeneratorChange('needsSpecSheet', checked)}
                  />
                  <Label htmlFor="needs-spec-sheet">Spec Sheet Required</Label>
                </div>

                {formData.generator?.needsSpecSheet && (
                  <div className="mt-2 space-y-2">
                    <Label>Spec Sheet Status</Label>
                    <div className="space-y-2">
                      {[
                        { value: 'needed', label: 'Still Needed' },
                        { value: 'received', label: 'Already Received' }
                      ].map((option) => {
                        const isSelected = formData.generator?.specSheetStatus === option.value;
                        
                        return (
                          <div 
                            key={option.value} 
                            className="flex items-center space-x-2 cursor-pointer"
                            onClick={() => handleGeneratorChange('specSheetStatus', option.value)}
                          >
                            {/* Custom radio visual */}
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>
                              {isSelected && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
                            </div>
                            
                            {/* Label */}
                            <span className="text-sm">{option.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ElectricalSection;
