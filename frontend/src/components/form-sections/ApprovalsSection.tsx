// frontend/src/components/form-sections/ApprovalsSection.tsx

import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApprovalsSectionProps } from './FormSectionTypes';

const PERMIT_RESPONSIBILITY_OPTIONS = [
  { value: 'contractor', label: 'Contractor' },
  { value: 'homeowner', label: 'Homeowner' },
  { value: 'other', label: 'Other' }
];

const YES_NO_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' }
];

const HOA_APPROVAL_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'na', label: 'Not Applicable' }
];

const ApprovalsSection: React.FC<ApprovalsSectionProps> = ({ 
  formData = {}, 
  updateFormData, 
  toggleCheckbox, 
  setRadioValue 
}) => {
  const handleChange = (field: string, value: any) => {
    updateFormData(field, value);
  };

  // Fallback handler for radio buttons
  const handleRadioClick = (field: string, value: string) => {
    if (setRadioValue) {
      setRadioValue(field, value);
    } else {
      handleChange(field, value);
    }
  };

  // Handler for checkbox clicks
  const handleCheckboxClick = (field: string, currentValue: boolean | undefined) => {
    if (toggleCheckbox) {
      toggleCheckbox(field);
    } else {
      handleChange(field, !currentValue);
    }
  };

  const handleFileUpload = (field: string, files: File[]) => {
    // Handle file upload for permits, plans, or other documentation
    handleChange(field, files);
  };

  return (
    <div className="space-y-6">
      {/* Permit Responsibility */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Label className="text-lg font-semibold">Permit Responsibility</Label>
          
          <div>
            <Label>Who will be responsible for obtaining permits?</Label>
            <div className="space-y-2 mt-2">
              {PERMIT_RESPONSIBILITY_OPTIONS.map((option) => {
                const isSelected = formData.permitResponsibility === option.value;
                
                return (
                  <div 
                    key={option.value} 
                    className="flex items-center space-x-2 cursor-pointer"
                    onClick={() => handleRadioClick('permitResponsibility', option.value)}
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

            {formData.permitResponsibility === 'other' && (
              <div className="mt-2">
                <Label>Specify who will obtain permits</Label>
                <Input
                  value={formData.permitResponsibilityOther || ''}
                  onChange={(e) => handleChange('permitResponsibilityOther', e.target.value)}
                  placeholder="Enter who will be responsible for permits"
                  className="mt-2"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Electrical Plans */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Label className="text-lg font-semibold">Electrical Plans</Label>
          
          <div>
            <Label>Do you have existing electrical plans?</Label>
            <div className="space-y-2 mt-2">
              {YES_NO_OPTIONS.map((option) => {
                const isSelected = formData.hasExistingPlans === option.value;
                
                return (
                  <div 
                    key={option.value} 
                    className="flex items-center space-x-2 cursor-pointer"
                    onClick={() => handleRadioClick('hasExistingPlans', option.value)}
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

          {formData.hasExistingPlans === 'yes' && (
            <div className="mt-2">
              <Label>Upload Electrical Plans</Label>
              {/* Placeholder for file upload component */}
              <p className="text-sm text-gray-500 mt-1">File upload feature will be available soon.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* HOA Approval */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Label className="text-lg font-semibold">HOA Approval</Label>
          
          <div>
            <Label>Is HOA approval required?</Label>
            <div className="space-y-2 mt-2">
              {HOA_APPROVAL_OPTIONS.map((option) => {
                const isSelected = formData.requiresHoaApproval === option.value;
                
                return (
                  <div 
                    key={option.value} 
                    className="flex items-center space-x-2 cursor-pointer"
                    onClick={() => handleRadioClick('requiresHoaApproval', option.value)}
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

          {formData.requiresHoaApproval === 'yes' && (
            <div className="mt-2">
              <Label>HOA Restrictions or Guidelines</Label>
              <Textarea
                value={formData.hoaRestrictions || ''}
                onChange={(e) => handleChange('hoaRestrictions', e.target.value)}
                placeholder="Describe any HOA restrictions that might affect electrical work"
                className="mt-2"
              />
              
              <div className="mt-4">
                <Label>HOA Contact Information</Label>
                <Input
                  value={formData.hoaContactInfo || ''}
                  onChange={(e) => handleChange('hoaContactInfo', e.target.value)}
                  placeholder="Enter HOA contact information"
                  className="mt-2"
                />
              </div>
              
              <div className="mt-4">
                <div className="flex items-center space-x-2 cursor-pointer"
                     onClick={() => handleCheckboxClick('hoaApprovalReceived', formData.hoaApprovalReceived)}>
                  <div className={`w-4 h-4 rounded cursor-pointer flex items-center justify-center ${formData.hoaApprovalReceived ? 'bg-blue-600 border-blue-600' : 'border border-gray-300'}`}>
                    {formData.hoaApprovalReceived && (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </div>
                  <span className="text-sm">HOA Approval Already Received</span>
                </div>
                
                {formData.hoaApprovalReceived && (
                  <div className="mt-2">
                    <Label>Upload HOA Approval Document</Label>
                    {/* Placeholder for file upload component */}
                    <p className="text-sm text-gray-500 mt-1">File upload feature will be available soon.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Building Code Compliance */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Label className="text-lg font-semibold">Building Code Compliance</Label>
          
          <div>
            <Label>Which electrical code version is applicable?</Label>
            <Input
              value={formData.electricalCodeVersion || ''}
              onChange={(e) => handleChange('electricalCodeVersion', e.target.value)}
              placeholder="e.g., NEC 2020"
              className="mt-2"
            />
            <p className="text-sm text-gray-500 mt-1">
              Note: Your local jurisdiction might have specific amendments to the National Electrical Code (NEC)
            </p>
          </div>
          
          <div className="mt-4">
            <Label>Additional Code Compliance Notes</Label>
            <Textarea
              value={formData.codeComplianceNotes || ''}
              onChange={(e) => handleChange('codeComplianceNotes', e.target.value)}
              placeholder="Note any specific code compliance concerns or requirements"
              className="mt-2"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApprovalsSection;
