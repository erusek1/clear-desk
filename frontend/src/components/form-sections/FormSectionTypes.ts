// frontend/src/components/form-sections/FormSectionTypes.ts

/**
 * Base interface for all form section props
 */
export interface FormSectionProps {
  formData: Record<string, any>;
  updateFormData: (field: string, value: any) => void;
  toggleCheckbox?: (field: string) => void;
  setRadioValue?: (field: string, value: string) => void;
  toggleCheckboxOption?: (field: string, option: string) => void;
}

/**
 * Interface for specific electrical form data
 */
export interface ElectricalFormData {
  serviceType?: string;
  phaseType?: string;
  voltage?: string;
  serviceSize?: string;
  meterLocation?: string;
  panelLocation?: string;
  hasGenerator?: boolean;
  generator?: {
    location?: string;
    size?: string;
    manufacturer?: string;
    model?: string;
    transferSwitch?: string;
    needsSpecSheet?: boolean;
    specSheetStatus?: string;
  };
}

/**
 * Interface for electrical section props
 */
export interface ElectricalSectionProps extends FormSectionProps {
  formData?: ElectricalFormData;
}

/**
 * Interface for bathroom form data
 */
export interface BathroomFormData {
  toilets?: {
    type?: string;
    model?: string;
    color?: string;
    height?: string;
    seatType?: string;
  }[];
  vanities?: {
    style?: string;
    width?: string;
    sinkType?: string;
    material?: string;
    color?: string;
  }[];
  showers?: {
    type?: string;
    material?: string;
    doorType?: string;
    fixtureBrand?: string;
    fixtureFinish?: string;
  }[];
  bathtubs?: {
    type?: string;
    material?: string;
    jets?: boolean;
    size?: string;
  }[];
  accessories?: string[];
  floorTile?: {
    material?: string;
    size?: string;
    color?: string;
    pattern?: string;
  };
  wallTile?: {
    material?: string;
    size?: string;
    color?: string;
    pattern?: string;
    height?: string;
  };
}

/**
 * Interface for bathroom section props
 */
export interface BathroomSectionProps extends FormSectionProps {
  formData?: BathroomFormData;
}

// Add additional interfaces for other form sections as needed
