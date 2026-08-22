# Plan: Obsidian Commerce Products Redesign

Redesign the `/products` page into a professional merchant catalog control plane using the Obsidian Commerce identity.

## Proposed Changes

### 1. Components
- **ProductsHeader**: High-density header with catalog status metrics (Total, Active, Inactive, Public Status).
- **CatalogToolbar**: Compact search and filter UI with infrastructure styling.
- **ProductTable**: Dense enterprise table with infrastructure records, monospace metadata, and semantic status badges.
- **ProductEditForm**: Refactored edit dialog with clear sections (Pricing, Inventory, AI Commerce) and a technical metadata panel.

### 2. Layout & UI
- **Infrastructure Feel**: Use deep charcoal/near-black, subtle borders, and monospace typography.
- **Server Authority**: Add a strip reinforcing that prices and inventory are merchant-controlled.
- **Responsive UX**: Ensure zero body-level horizontal scrolling; contain table overflow or stack records on mobile.

### 3. Technical Details
- **Design System**: Apply Obsidian Commerce tokens (Graphite, Copper, Verified Green).
- **Invariants**: 
    - No changes to backend/database.
    - Preserve all existing CRUD behavior.
    - Use integer math for currency.
- **Motion**: Minimal transitions (opacity only) per instructions.

## Verification Plan
- **Build Check**: Ensure zero TypeScript or lint errors.
- **Visual Audit**: Verify Obsidian theme compliance and density across 1440px and mobile viewports.
- **Functional Check**: Test CRUD (Create, Edit, Status Toggle, Stock Update) to ensure logic remains intact.
