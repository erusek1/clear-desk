# Form Section Conversion Guide

This document outlines the process for converting form sections from the `pre-construction-checklist` repository to the `clear-desk` repository.

## Conversion Steps

1. **Create Type Interfaces**
   - For each form section, define a corresponding interface in `FormSectionTypes.ts`
   - Follow the naming pattern: `{SectionName}FormData` and `{SectionName}SectionProps`

2. **Copy and Convert Component**
   - Copy the component from pre-construction-checklist repo
   - Change file extension from `.jsx` to `.tsx`
   - Add type annotations to function parameters and state
   - Update import paths if necessary
   - Import the appropriate interfaces from `FormSectionTypes.ts`

3. **Update Component Exports**
   - Add the new component to the exports in `index.ts`

4. **Update README.md**
   - Document the new form section in the README

## Example Conversion Process

### Original JSX Component (pre-construction-checklist repo)

```jsx
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";

const SampleSection = ({ formData = {}, updateFormData }) => {
  const handleChange = (field, value) => {
    updateFormData(field, value);
  };
  
  return (
    <Card>
      <CardContent>
        {/* Component content */}
      </CardContent>
    </Card>
  );
};

export default SampleSection;
```

### Converted TSX Component (clear-desk repo)

```tsx
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { SampleSectionProps } from './FormSectionTypes';

const SampleSection: React.FC<SampleSectionProps> = ({ 
  formData = {}, 
  updateFormData 
}) => {
  const handleChange = (field: string, value: any) => {
    updateFormData(field, value);
  };
  
  return (
    <Card>
      <CardContent>
        {/* Component content */}
      </CardContent>
    </Card>
  );
};

export default SampleSection;
```

### Type Definitions in FormSectionTypes.ts

```tsx
export interface SampleFormData {
  field1?: string;
  field2?: boolean;
  // Add all fields used in the component
}

export interface SampleSectionProps extends FormSectionProps {
  formData?: SampleFormData;
}
```

### Update index.ts

```tsx
import ElectricalSection from './ElectricalSection';
import SampleSection from './SampleSection';

export {
  ElectricalSection,
  SampleSection
};

export * from './FormSectionTypes';
```

## Tips for Conversion

- Keep the same field names and structure to maintain compatibility with existing data
- Use optional chaining (`?.`) for nested properties that might be undefined
- Use default values (e.g., `|| ''`, `|| false`) to handle undefined values
- Remove `console.log` statements unless needed for debugging
- Add JSDoc comments to document complex functionality
