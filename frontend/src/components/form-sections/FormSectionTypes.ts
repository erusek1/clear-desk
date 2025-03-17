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
 * Interface for AV form data
 */
export interface AVFormData {
  hasSpeakers?: boolean;
  speakerLocations?: string[];
  speakerBrand?: string;
  speakerModel?: string;
  hasTelevisions?: boolean;
  televisionLocations?: string[];
  hasNetworkEquipment?: boolean;
  networkLocations?: string[];
  hasSecuritySystem?: boolean;
  securityDetails?: {
    hasCameras?: boolean;
    cameraLocations?: string[];
    hasMotionSensors?: boolean;
    motionSensorLocations?: string[];
    hasDoorSensors?: boolean;
    doorSensorLocations?: string[];
  };
  hasHomeAutomation?: boolean;
  automationDetails?: string;
  additionalNotes?: string;
}

/**
 * Interface for AV section props
 */
export interface AVSectionProps extends FormSectionProps {
  formData?: AVFormData;
}

/**
 * Interface for approvals form data
 */
export interface ApprovalsFormData {
  customerApproval?: {
    status?: 'pending' | 'approved' | 'rejected';
    date?: string;
    name?: string;
    comments?: string;
  };
  designerApproval?: {
    status?: 'pending' | 'approved' | 'rejected';
    date?: string;
    name?: string;
    comments?: string;
  };
  contractorApproval?: {
    status?: 'pending' | 'approved' | 'rejected';
    date?: string;
    name?: string;
    comments?: string;
  };
  buildingDeptApproval?: {
    status?: 'pending' | 'approved' | 'rejected';
    date?: string;
    name?: string;
    comments?: string;
  };
  additionalApprovals?: {
    name?: string;
    status?: 'pending' | 'approved' | 'rejected';
    date?: string;
    contact?: string;
    comments?: string;
  }[];
}

/**
 * Interface for approvals section props
 */
export interface ApprovalsSectionProps extends FormSectionProps {
  formData?: ApprovalsFormData;
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

/**
 * Interface for carpentry form data
 */
export interface CarpentryFormData {
  trimStyle?: string;
  trimMaterial?: string;
  trimFinish?: string;
  crownMoldingRooms?: string[];
  baseboardRooms?: string[];
  doorCasingStyle?: string;
  windowCasingStyle?: string;
  customCabinetryLocations?: string[];
  customCabinetryDetails?: string;
  stairDetails?: {
    hasStairs?: boolean;
    railingStyle?: string;
    balusters?: string;
    treads?: string;
    risers?: string;
  };
  additionalCarpentryNotes?: string;
}

/**
 * Interface for carpentry section props
 */
export interface CarpentrySectionProps extends FormSectionProps {
  formData?: CarpentryFormData;
}

/**
 * Interface for customer info form data
 */
export interface CustomerInfoFormData {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  preferredContactMethod?: 'phone' | 'email' | 'text';
  bestTimeToContact?: string;
  projectAddress?: string;
  isSameAsCustomerAddress?: boolean;
  additionalContacts?: {
    name?: string;
    relationship?: string;
    phone?: string;
    email?: string;
  }[];
  notes?: string;
}

/**
 * Interface for customer info section props
 */
export interface CustomerInfoSectionProps extends FormSectionProps {
  formData?: CustomerInfoFormData;
}

/**
 * Interface for elevator form data
 */
export interface ElevatorFormData {
  hasElevator?: boolean;
  elevatorType?: 'hydraulic' | 'traction' | 'pneumatic' | 'vacuum' | 'other';
  elevatorManufacturer?: string;
  elevatorModel?: string;
  capacity?: string;
  dimensions?: {
    width?: string;
    depth?: string;
    height?: string;
  };
  stops?: number;
  doorStyle?: string;
  interiorFinish?: string;
  requiresGenerator?: boolean;
  additionalFeatures?: string[];
  installationNotes?: string;
}

/**
 * Interface for elevator section props
 */
export interface ElevatorSectionProps extends FormSectionProps {
  formData?: ElevatorFormData;
}

/**
 * Interface for exterior form data
 */
export interface ExteriorFormData {
  siding?: {
    material?: string;
    style?: string;
    color?: string;
  };
  roofing?: {
    material?: string;
    style?: string;
    color?: string;
  };
  gutters?: {
    material?: string;
    color?: string;
    style?: string;
  };
  windows?: {
    material?: string;
    style?: string;
    color?: string;
    glazing?: string;
  };
  doors?: {
    material?: string;
    style?: string;
    color?: string;
  };
  driveway?: {
    material?: string;
    pattern?: string;
    color?: string;
  };
  landscaping?: {
    style?: string;
    sprinklers?: boolean;
    lighting?: boolean;
  };
  exteriorLighting?: {
    entryLights?: boolean;
    pathLights?: boolean;
    floodLights?: boolean;
    accentLights?: boolean;
  };
  additionalNotes?: string;
}

/**
 * Interface for exterior section props
 */
export interface ExteriorSectionProps extends FormSectionProps {
  formData?: ExteriorFormData;
}

/**
 * Interface for fireplace form data
 */
export interface FireplaceFormData {
  hasFireplace?: boolean;
  fireplaceLocations?: string[];
  fireplaceDetails?: {
    location?: string;
    type?: 'gas' | 'electric' | 'wood' | 'pellet';
    style?: string;
    surroundMaterial?: string;
    hearth?: boolean;
    mantle?: boolean;
    ventType?: string;
  }[];
  additionalNotes?: string;
}

/**
 * Interface for fireplace section props
 */
export interface FireplaceSectionProps extends FormSectionProps {
  formData?: FireplaceFormData;
}

/**
 * Interface for garage form data
 */
export interface GarageFormData {
  hasGarage?: boolean;
  garageType?: 'attached' | 'detached' | 'carport';
  carCapacity?: number;
  doorCount?: number;
  doorDetails?: {
    style?: string;
    material?: string;
    color?: string;
    insulated?: boolean;
  };
  openerDetails?: {
    brand?: string;
    model?: string;
    remoteCount?: number;
    keypadEntry?: boolean;
    smartConnect?: boolean;
  };
  floorType?: string;
  wallFinish?: string;
  ceilingFinish?: string;
  hasWorkbench?: boolean;
  hasCabinetry?: boolean;
  hasHeating?: boolean;
  hasAC?: boolean;
  hasWaterAccess?: boolean;
  hasCarCharger?: boolean;
  carChargerDetails?: {
    brand?: string;
    model?: string;
    voltage?: string;
    amperage?: string;
  };
  additionalNotes?: string;
}

/**
 * Interface for garage section props
 */
export interface GarageSectionProps extends FormSectionProps {
  formData?: GarageFormData;
}

/**
 * Interface for HVAC form data
 */
export interface HVACFormData {
  systemType?: 'split' | 'packaged' | 'ductless-mini-split' | 'hydronic' | 'other';
  heatingType?: 'forced-air' | 'heat-pump' | 'radiant' | 'baseboard' | 'other';
  coolingType?: 'central-ac' | 'heat-pump' | 'mini-split' | 'window-units' | 'none';
  fuelType?: 'electric' | 'natural-gas' | 'propane' | 'oil' | 'dual-fuel';
  brand?: string;
  model?: string;
  zones?: number;
  hasProgrammableThermostat?: boolean;
  hasSmartThermostat?: boolean;
  thermostatBrand?: string;
  thermostatModel?: string;
  ductwork?: {
    material?: string;
    insulated?: boolean;
    location?: string;
  };
  airFilterType?: string;
  requiresHumidifier?: boolean;
  requiresDehumidifier?: boolean;
  requiresAirPurifier?: boolean;
  requiresERV?: boolean;
  manualJRequired?: boolean;
  additionalFeatures?: string[];
  additionalNotes?: string;
}

/**
 * Interface for HVAC section props
 */
export interface HVACSectionProps extends FormSectionProps {
  formData?: HVACFormData;
}

/**
 * Interface for insulation form data
 */
export interface InsulationFormData {
  atticInsulation?: {
    type?: string;
    rValue?: string;
    thickness?: string;
  };
  wallInsulation?: {
    type?: string;
    rValue?: string;
    thickness?: string;
  };
  floorInsulation?: {
    type?: string;
    rValue?: string;
    thickness?: string;
  };
  foundationInsulation?: {
    type?: string;
    rValue?: string;
    thickness?: string;
  };
  hasVaporBarrier?: boolean;
  hasRadiantBarrier?: boolean;
  specialAreas?: string;
  additionalNotes?: string;
}

/**
 * Interface for insulation section props
 */
export interface InsulationSectionProps extends FormSectionProps {
  formData?: InsulationFormData;
}

/**
 * Interface for interior designer form data
 */
export interface InteriorDesignerFormData {
  hasDesigner?: boolean;
  designerInfo?: {
    name?: string;
    company?: string;
    phone?: string;
    email?: string;
  };
  designStyle?: string;
  colorScheme?: {
    walls?: string;
    trim?: string;
    ceilings?: string;
    accent?: string;
  };
  flooringSelections?: {
    livingAreas?: string;
    bedrooms?: string;
    bathrooms?: string;
    kitchen?: string;
  };
  windowTreatments?: string;
  lightingTheme?: string;
  furnitureStyle?: string;
  artworkNotes?: string;
  designNotes?: string;
}

/**
 * Interface for interior designer section props
 */
export interface InteriorDesignerSectionProps extends FormSectionProps {
  formData?: InteriorDesignerFormData;
}

/**
 * Interface for interior lighting form data
 */
export interface InteriorLightingFormData {
  generalStyle?: string;
  fixtures?: {
    entryway?: string;
    livingRoom?: string;
    diningRoom?: string;
    kitchen?: string;
    bedrooms?: string;
    bathrooms?: string;
    hallways?: string;
  };
  switchTypes?: {
    standard?: boolean;
    dimmer?: boolean;
    motion?: boolean;
    smart?: boolean;
  };
  switchLocations?: string;
  recess?: {
    hasRecessLighting?: boolean;
    locations?: string[];
    trim?: string;
    bulbType?: string;
    kelvinRating?: string;
  };
  undercabinetLighting?: boolean;
  pendantLighting?: boolean;
  pendantLocations?: string[];
  chandeliers?: boolean;
  chandelierLocations?: string[];
  requiresSpecialCircuits?: boolean;
  specialCircuitDetails?: string;
  additionalLightingNotes?: string;
}

/**
 * Interface for interior lighting section props
 */
export interface InteriorLightingSectionProps extends FormSectionProps {
  formData?: InteriorLightingFormData;
}

/**
 * Interface for kitchen form data
 */
export interface KitchenFormData {
  cabinetry?: {
    style?: string;
    material?: string;
    color?: string;
    handles?: string;
  };
  countertops?: {
    material?: string;
    color?: string;
    edge?: string;
    backsplash?: string;
  };
  appliances?: {
    refrigerator?: {
      type?: string;
      brand?: string;
      model?: string;
      size?: string;
      finish?: string;
    };
    dishwasher?: {
      brand?: string;
      model?: string;
      finish?: string;
    };
    range?: {
      type?: 'gas' | 'electric' | 'dual-fuel' | 'induction';
      brand?: string;
      model?: string;
      size?: string;
      finish?: string;
    };
    microwave?: {
      type?: 'countertop' | 'built-in' | 'over-range' | 'drawer';
      brand?: string;
      model?: string;
      finish?: string;
    };
    hood?: {
      type?: string;
      brand?: string;
      model?: string;
      finish?: string;
      ventingType?: 'external' | 'recirculating';
    };
  };
  sink?: {
    type?: 'single' | 'double' | 'farmhouse' | 'triple' | 'bar';
    material?: string;
    color?: string;
    brand?: string;
    model?: string;
  };
  faucet?: {
    style?: string;
    finish?: string;
    brand?: string;
    model?: string;
    hasSprayer?: boolean;
    hasWaterFilter?: boolean;
    hasInstantHot?: boolean;
  };
  hasIsland?: boolean;
  islandDetails?: {
    size?: string;
    hasSeating?: boolean;
    hasStorage?: boolean;
    hasSink?: boolean;
    hasCooktop?: boolean;
  };
  hasButlerPantry?: boolean;
  hasWalkInPantry?: boolean;
  pantryDetails?: string;
  flooring?: {
    material?: string;
    color?: string;
    pattern?: string;
  };
  specialFeatures?: string[];
  additionalNotes?: string;
}

/**
 * Interface for kitchen section props
 */
export interface KitchenSectionProps extends FormSectionProps {
  formData?: KitchenFormData;
}

/**
 * Interface for laundry form data
 */
export interface LaundryFormData {
  location?: string;
  washer?: {
    type?: 'top-load' | 'front-load';
    brand?: string;
    model?: string;
    powerType?: 'electric' | 'gas';
    width?: string;
  };
  dryer?: {
    type?: string;
    brand?: string;
    model?: string;
    powerType?: 'electric' | 'gas';
    width?: string;
  };
  ventingDetails?: string;
  sink?: {
    included?: boolean;
    type?: string;
    material?: string;
  };
  cabinetry?: {
    included?: boolean;
    style?: string;
    material?: string;
  };
  countertop?: {
    included?: boolean;
    material?: string;
    color?: string;
  };
  flooring?: {
    material?: string;
    pattern?: string;
    color?: string;
  };
  hasUtilityCloset?: boolean;
  utilityClosetDetails?: string;
  hasFoldingArea?: boolean;
  hasIroning?: boolean;
  additionalFeatures?: string[];
  additionalNotes?: string;
}

/**
 * Interface for laundry section props
 */
export interface LaundrySectionProps extends FormSectionProps {
  formData?: LaundryFormData;
}

/**
 * Interface for outlet form data
 */
export interface OutletFormData {
  standardOutlets?: {
    livingRoom?: number;
    kitchen?: number;
    bedrooms?: number;
    bathrooms?: number;
    hallways?: number;
    others?: string;
  };
  gfciLocations?: string[];
  afciProtection?: boolean;
  usbOutlets?: {
    included?: boolean;
    locations?: string[];
  };
  outdoorOutlets?: {
    included?: boolean;
    locations?: string[];
    weatherproof?: boolean;
  };
  floorOutlets?: {
    included?: boolean;
    locations?: string[];
  };
  specialOutlets?: {
    included?: boolean;
    type?: string;
    locations?: string[];
  };
  additionalNotes?: string;
}

/**
 * Interface for outlet section props
 */
export interface OutletSectionProps extends FormSectionProps {
  formData?: OutletFormData;
}

/**
 * Interface for plumbing form data
 */
export interface PlumbingFormData {
  waterSupply?: {
    source?: 'city' | 'well' | 'other';
    pipeType?: string;
    mainShutoffLocation?: string;
  };
  waterHeater?: {
    type?: 'tank' | 'tankless' | 'heat-pump' | 'other';
    fuelType?: 'electric' | 'natural-gas' | 'propane' | 'other';
    brand?: string;
    model?: string;
    capacity?: string;
    location?: string;
  };
  drainWaste?: {
    pipeType?: string;
    specialRequirements?: string;
  };
  fixtures?: {
    kitchen?: {
      sinks?: number;
      faucets?: number;
      potFiller?: boolean;
      filterSystem?: boolean;
      garbageDisposal?: boolean;
      dishwasher?: boolean;
      icemaker?: boolean;
    };
    bathrooms?: {
      sinks?: number;
      toilets?: number;
      tubs?: number;
      showers?: number;
      bidets?: number;
    };
    laundry?: {
      sink?: boolean;
      washer?: boolean;
    };
    outdoors?: {
      hosebibs?: number;
      locations?: string;
      irrigation?: boolean;
    };
  };
  specialPlumbing?: {
    sumpPump?: boolean;
    ejectorPump?: boolean;
    waterSoftener?: boolean;
    reverseOsmosis?: boolean;
    reclaimSystem?: boolean;
    other?: string;
  };
  additionalNotes?: string;
}

/**
 * Interface for plumbing section props
 */
export interface PlumbingSectionProps extends FormSectionProps {
  formData?: PlumbingFormData;
}

/**
 * Interface for pool form data
 */
export interface PoolFormData {
  hasPool?: boolean;
  poolType?: 'in-ground' | 'above-ground' | 'infinity' | 'lap' | 'plunge' | 'other';
  poolShape?: string;
  dimensions?: {
    length?: string;
    width?: string;
    depth?: {
      shallow?: string;
      deep?: string;
    };
  };
  construction?: {
    material?: 'concrete' | 'fiberglass' | 'vinyl' | 'other';
    finishType?: string;
    finishColor?: string;
  };
  features?: {
    heater?: {
      included?: boolean;
      type?: 'gas' | 'electric' | 'heat-pump' | 'solar' | 'other';
      brand?: string;
      model?: string;
    };
    lighting?: {
      included?: boolean;
      type?: string;
      color?: string;
    };
    automation?: {
      included?: boolean;
      system?: string;
    };
    waterFeatures?: string[];
    slide?: boolean;
    divingBoard?: boolean;
    steps?: string;
    handrail?: boolean;
    bench?: boolean;
    tanning?: boolean;
  };
  equipment?: {
    filter?: {
      type?: string;
      brand?: string;
      model?: string;
    };
    pump?: {
      type?: string;
      brand?: string;
      model?: string;
    };
    chlorinator?: {
      type?: string;
      brand?: string;
      model?: string;
    };
    sanitationSystem?: {
      type?: string;
      brand?: string;
      model?: string;
    };
  };
  decking?: {
    material?: string;
    pattern?: string;
    color?: string;
    area?: string;
  };
  fencing?: {
    type?: string;
    height?: string;
    material?: string;
    gate?: string;
  };
  hasSpa?: boolean;
  spaDetails?: {
    type?: 'attached' | 'detached';
    jets?: number;
    heater?: string;
    seating?: number;
  };
  additionalNotes?: string;
}

/**
 * Interface for pool section props
 */
export interface PoolSectionProps extends FormSectionProps {
  formData?: PoolFormData;
}

/**
 * Interface for project info form data
 */
export interface ProjectInfoFormData {
  projectName?: string;
  projectAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  projectType?: 'new-construction' | 'renovation' | 'addition' | 'other';
  buildingType?: 'single-family' | 'multi-family' | 'commercial' | 'other';
  squareFootage?: string;
  stories?: number;
  bedrooms?: number;
  bathrooms?: number;
  startDate?: string;
  estimatedCompletion?: string;
  buildingPermitNumber?: string;
  architecturalPlanDate?: string;
  specialRequirements?: string[];
  additionalNotes?: string;
}

/**
 * Interface for project info section props
 */
export interface ProjectInfoSectionProps extends FormSectionProps {
  formData?: ProjectInfoFormData;
}

/**
 * Interface for specialty form data
 */
export interface SpecialtyFormData {
  hasTheaterRoom?: boolean;
  theaterDetails?: {
    size?: string;
    seating?: string;
    audioSystem?: string;
    projector?: string;
    screen?: string;
    lighting?: string;
    acoustics?: string;
  };
  hasWineRoom?: boolean;
  wineRoomDetails?: {
    size?: string;
    capacity?: string;
    cooling?: string;
    shelving?: string;
    lighting?: string;
  };
  hasGym?: boolean;
  gymDetails?: {
    size?: string;
    flooring?: string;
    equipment?: string[];
    mirrors?: boolean;
    tvMounts?: boolean;
  };
  hasSauna?: boolean;
  saunaDetails?: {
    type?: 'dry' | 'steam' | 'infrared';
    size?: string;
    material?: string;
    heater?: string;
  };
  hasSteamRoom?: boolean;
  steamRoomDetails?: {
    size?: string;
    material?: string;
    generator?: string;
  };
  hasOutdoorKitchen?: boolean;
  outdoorKitchenDetails?: {
    size?: string;
    appliances?: string[];
    countertop?: string;
    sink?: boolean;
    refrigeration?: boolean;
    bar?: boolean;
  };
  hasGeneratorRoom?: boolean;
  generatorRoomDetails?: {
    size?: string;
    ventilation?: string;
    soundproofing?: boolean;
  };
  hasPetAmenities?: boolean;
  petAmenityDetails?: string;
  otherSpecialtyRooms?: {
    type?: string;
    details?: string;
  }[];
  additionalNotes?: string;
}

/**
 * Interface for specialty section props
 */
export interface SpecialtySectionProps extends FormSectionProps {
  formData?: SpecialtyFormData;
}

/**
 * Interface for sample form data
 */
export interface SampleFormData {
  textField?: string;
  numberField?: number;
  dropdownField?: string;
  checkboxField?: boolean;
  radioField?: string;
  dateField?: string;
  textareaField?: string;
  nestedObject?: {
    nestedField1?: string;
    nestedField2?: string;
  };
  arrayField?: string[];
}

/**
 * Interface for sample section props
 */
export interface SampleSectionProps extends FormSectionProps {
  formData?: SampleFormData;
}
