// frontend/src/components/form-sections/AVSection.tsx

import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { AVSectionProps } from './FormSectionTypes';

const SPEC_SHEET_STATUSES = [
  { value: 'needed', label: 'Still Needed' },
  { value: 'received', label: 'Already Received' }
];

interface TVMount {
  location?: string;
  needsInWallPower?: boolean;
  needsHDMI?: boolean;
  needsRG6?: boolean;
  hdmiNotes?: string;
  needsSpecSheet?: boolean;
  specSheetStatus?: string;
  notes?: string;
}

const AVSection: React.FC<AVSectionProps> = ({ 
  formData = {}, 
  updateFormData, 
  toggleCheckbox, 
  setRadioValue 
}) => {
  // Ensure formData.tvMounts is initialized as an array
  const tvMounts: TVMount[] = Array.isArray(formData.tvMounts) ? formData.tvMounts : [];

  const handleChange = (field: string, value: any) => {
    updateFormData(field, value);
  };

  // Fallback handlers in case the props aren't passed
  const handleRadioClick = (fieldId: string, value: string) => {
    if (setRadioValue) {
      setRadioValue(fieldId, value);
    } else {
      updateFormData(fieldId, value);
    }
  };

  const handleCheckboxClick = (fieldId: string, currentValue: boolean | undefined) => {
    if (toggleCheckbox) {
      toggleCheckbox(fieldId);
    } else {
      updateFormData(fieldId, !currentValue);
    }
  };

  const addTVMount = () => {
    const mounts = [...tvMounts, {
      location: '',
      needsInWallPower: false,
      needsHDMI: false,
      needsRG6: false,
      hdmiNotes: '',
      needsSpecSheet: false,
      specSheetStatus: 'needed',
      notes: ''
    }];
    handleChange('tvMounts', mounts);
  };

  const removeTVMount = (index: number) => {
    const mounts = tvMounts.filter((_, i) => i !== index);
    handleChange('tvMounts', mounts);
  };

  const updateTVMount = (index: number, field: string, value: any) => {
    const mounts = [...tvMounts];
    mounts[index] = {
      ...mounts[index],
      [field]: value
    };
    handleChange('tvMounts', mounts);
  };

  const handleMountCheckboxClick = (index: number, field: string, currentValue: boolean | undefined) => {
    updateTVMount(index, field, !currentValue);
  };

  const handleMountRadioClick = (index: number, field: string, value: string) => {
    updateTVMount(index, field, value);
  };

  return (
    <div className="space-y-6">
      {/* Service Providers */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Label className="text-lg font-semibold">Service Providers</Label>

          <div>
            <Label>Internet Service Provider</Label>
            <Input
              value={formData.internetProvider || ''}
              onChange={(e) => handleChange('internetProvider', e.target.value)}
              placeholder="Enter internet service provider name"
              className="mt-1"
            />
          </div>

          <div>
            <Label>Cable/Satellite Provider</Label>
            <Input
              value={formData.cableProvider || ''}
              onChange={(e) => handleChange('cableProvider', e.target.value)}
              placeholder="Enter cable/satellite provider name"
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Network Equipment */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Label className="text-lg font-semibold">Network Equipment</Label>

          <div>
            <Label>Router/Network Equipment Location</Label>
            <Input
              value={formData.routerLocation || ''}
              onChange={(e) => handleChange('routerLocation', e.target.value)}
              placeholder="Specify router location"
              className="mt-1"
            />
          </div>

          <div className="flex items-center space-x-2 cursor-pointer" 
               onClick={() => handleCheckboxClick('needsDedicatedCircuit', formData.needsDedicatedCircuit)}>
            <div className={`w-4 h-4 rounded cursor-pointer flex items-center justify-center ${formData.needsDedicatedCircuit ? 'bg-blue-600 border-blue-600' : 'border border-gray-300'}`}>
              {formData.needsDedicatedCircuit && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}
            </div>
            <span className="text-sm">20A dedicated circuit for network equipment</span>
          </div>
        </CardContent>
      </Card>

      {/* TV Mount Locations */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-4">
            <Label className="text-lg font-semibold">TV Mount Locations</Label>
            <Button 
              type="button" 
              variant="outline" 
              onClick={addTVMount}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Location
            </Button>
          </div>

          <div className="space-y-4">
            {tvMounts.map((mount, index) => (
              <Card key={index} className="p-4">
                <div className="flex justify-between items-start">
                  <Label>TV Location {index + 1}</Label>
                  <Button 
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTVMount(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Location Description</Label>
                    <Input
                      value={mount.location || ''}
                      onChange={(e) => updateTVMount(index, 'location', e.target.value)}
                      placeholder="Specify TV mount location"
                      className="mt-1"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center space-x-2 cursor-pointer"
                         onClick={() => handleMountCheckboxClick(index, 'needsInWallPower', mount.needsInWallPower)}>
                      <div className={`w-4 h-4 rounded cursor-pointer flex items-center justify-center ${mount.needsInWallPower ? 'bg-blue-600 border-blue-600' : 'border border-gray-300'}`}>
                        {mount.needsInWallPower && (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </div>
                      <span className="text-sm">In-wall Power Required</span>
                    </div>

                    <div className="flex items-center space-x-2 cursor-pointer"
                         onClick={() => handleMountCheckboxClick(index, 'needsHDMI', mount.needsHDMI)}>
                      <div className={`w-4 h-4 rounded cursor-pointer flex items-center justify-center ${mount.needsHDMI ? 'bg-blue-600 border-blue-600' : 'border border-gray-300'}`}>
                        {mount.needsHDMI && (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </div>
                      <span className="text-sm">HDMI Required</span>
                    </div>

                    <div className="flex items-center space-x-2 cursor-pointer"
                         onClick={() => handleMountCheckboxClick(index, 'needsRG6', mount.needsRG6)}>
                      <div className={`w-4 h-4 rounded cursor-pointer flex items-center justify-center ${mount.needsRG6 ? 'bg-blue-600 border-blue-600' : 'border border-gray-300'}`}>
                        {mount.needsRG6 && (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        )}
                      </div>
                      <span className="text-sm">Cable RG6 Required</span>
                    </div>

                    {mount.needsHDMI && (
                      <Input
                        value={mount.hdmiNotes || ''}
                        onChange={(e) => updateTVMount(index, 'hdmiNotes', e.target.value)}
                        placeholder="HDMI connection details"
                        className="mt-1"
                      />
                    )}

                    <div className="space-y-4 mt-4">
                      <div className="flex items-center space-x-2 cursor-pointer"
                           onClick={() => handleMountCheckboxClick(index, 'needsSpecSheet', mount.needsSpecSheet)}>
                        <div className={`w-4 h-4 rounded cursor-pointer flex items-center justify-center ${mount.needsSpecSheet ? 'bg-blue-600 border-blue-600' : 'border border-gray-300'}`}>
                          {mount.needsSpecSheet && (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          )}
                        </div>
                        <span className="text-sm">Spec Sheet Required</span>
                      </div>

                      {mount.needsSpecSheet && (
                        <div>
                          <Label>Spec Sheet Status</Label>
                          <div className="space-y-2 mt-2">
                            {SPEC_SHEET_STATUSES.map((status) => {
                              const isSelected = (mount.specSheetStatus || 'needed') === status.value;
                              
                              return (
                                <div 
                                  key={status.value} 
                                  className="flex items-center space-x-2 cursor-pointer"
                                  onClick={() => handleMountRadioClick(index, 'specSheetStatus', status.value)}
                                >
                                  {/* Custom radio visual */}
                                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>
                                    {isSelected && <div className="w-2 h-2 rounded-full bg-blue-600"></div>}
                                  </div>
                                  
                                  {/* Label */}
                                  <span className="text-sm">{status.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label>Additional Notes</Label>
                    <Input
                      value={mount.notes || ''}
                      onChange={(e) => updateTVMount(index, 'notes', e.target.value)}
                      placeholder="Enter any additional notes"
                      className="mt-1"
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AV Contractor */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-lg font-semibold">AV Contractor</Label>
            <div className="flex items-center space-x-2 cursor-pointer"
                 onClick={() => handleCheckboxClick('hasAVContractor', formData.hasAVContractor)}>
              <div className={`w-4 h-4 rounded cursor-pointer flex items-center justify-center ${formData.hasAVContractor ? 'bg-blue-600 border-blue-600' : 'border border-gray-300'}`}>
                {formData.hasAVContractor && (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </div>
              <span className="text-sm">Has AV Contractor</span>
            </div>
          </div>

          {formData.hasAVContractor && (
            <>
              <div>
                <Label>Contractor Name</Label>
                <Input
                  value={formData.contractorName || ''}
                  onChange={(e) => handleChange('contractorName', e.target.value)}
                  placeholder="Enter AV contractor name"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Contractor Email</Label>
                <Input
                  type="email"
                  value={formData.contractorEmail || ''}
                  onChange={(e) => handleChange('contractorEmail', e.target.value)}
                  placeholder="Enter contractor email"
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Contractor Notes</Label>
                <Input
                  value={formData.contractorNotes || ''}
                  onChange={(e) => handleChange('contractorNotes', e.target.value)}
                  placeholder="Additional contractor notes"
                  className="mt-1"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AVSection;
