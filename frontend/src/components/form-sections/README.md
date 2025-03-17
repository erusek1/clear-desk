# Form Sections

This directory contains reusable form section components used in the pre-construction checklist and other forms throughout the Clear-Desk system.

## Component Structure

Each form section follows a consistent pattern:

- Uses TypeScript and React
- Imports UI components from the shadcn/ui library
- Accepts standardized props for form data and event handlers
- Exports a typed interface for the form data specific to that section

## Usage

Import the form sections into your forms like this:

```tsx
import { ElectricalSection } from '@/components/form-sections';
import { useState } from 'react';

const MyForm = () => {
  const [formData, setFormData] = useState({});
  
  const updateFormData = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  return (
    <div>
      <h1>My Form</h1>
      <ElectricalSection 
        formData={formData} 
        updateFormData={updateFormData} 
      />
      {/* Add more sections as needed */}
    </div>
  );
};
```

## Available Sections

The following form sections are available:

- `ElectricalSection`: For capturing electrical service details, panel information, and generator specifications
- More sections to be added...

## Form Section Interfaces

Each form section has a corresponding TypeScript interface that describes the data structure that section manages. These are exported from the `FormSectionTypes.ts` file:

```tsx
import { ElectricalFormData, ElectricalSectionProps } from '@/components/form-sections';
```

## Adding New Sections

When adding new form sections, follow this pattern:

1. Create a new TypeScript file for the section (e.g., `PlumbingSection.tsx`)
2. Add the corresponding interface to `FormSectionTypes.ts`
3. Export the component in the `index.ts` file
4. Document the new section in this README
