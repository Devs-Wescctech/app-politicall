# Politicall Platform - Design Guidelines

## Design Approach
**System-Based Approach**: Material Design adapted for enterprise political management
- Justification: Information-dense application with complex data visualization (analytics, CRM, calendars), requiring consistent patterns across multiple interconnected modules
- Heavy emphasis on data hierarchy, clear navigation, and professional productivity workflows

## Color Acknowledgment
User-specified palette: Turquesa piscina (#40E0D0, #48D1CC) and white (#FFFFFF) as primary brand colors

## Typography System

**Font Family**: Inter (Google Fonts) - primary for all interfaces
- Modern, highly legible at small sizes, excellent for data-dense dashboards

**Hierarchy**:
- Page Titles: text-3xl font-bold (30px)
- Section Headers: text-2xl font-semibold (24px)
- Module Headers: text-xl font-semibold (20px)
- Card Titles: text-lg font-medium (18px)
- Body Text: text-base font-normal (16px)
- Labels/Metadata: text-sm font-medium (14px)
- Captions/Helper Text: text-xs font-normal (12px)

## Layout & Spacing System

**Tailwind Spacing Primitives**: 2, 4, 6, 8, 12, 16
- Micro spacing: p-2, gap-2 (buttons, badges, tight elements)
- Standard spacing: p-4, gap-4, m-4 (cards, form fields)
- Section padding: p-6, py-8 (module containers)
- Major sections: p-8, py-12, gap-12 (dashboard panels)
- Page margins: p-16 (desktop outer containers)

**Grid System**:
- Main dashboard: 12-column grid (grid-cols-12)
- Module layouts: 6-column or 4-column grids
- Responsive breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)

## Navigation Structure

**Sidebar Navigation** (Fixed, left-aligned):
- Width: w-64 (256px) on desktop, collapsible to w-16 icons-only
- Items: py-3 px-4 with icons (24px) + labels
- Active state: distinct visual treatment with indicator
- Sections: Dashboard, Contatos, Aliança Política, Demandas, Agenda, Atendimento IA, Marketing, Configurações

**Top Bar**:
- Height: h-16 (64px)
- Contains: breadcrumbs (left), search bar (center), notifications + profile (right)
- Search: w-96 max-width, rounded-lg

## Core Components Library

### Dashboard Module
**Layout**: 3-column grid (lg:grid-cols-3) with metric cards
- Metric Cards: rounded-xl, p-6, shadow-sm
  - Large number: text-4xl font-bold
  - Label: text-sm uppercase tracking-wide
  - Trend indicator: small arrow + percentage
- Charts section: 2-column grid (lg:grid-cols-2)
  - Chart containers: rounded-xl, p-8, min-h-80

### Contacts Module
**Table View** (primary):
- Data table: full-width, striped rows, sortable columns
- Row height: h-14
- Actions column: right-aligned icons (edit, delete)
- Search/filter bar: top, h-12 with dropdown filters
- Add contact button: top-right, prominent

### Aliança Política Module
**Dual Panel Layout**:
- Left panel (w-1/3): List of parties with ideology badges
  - Party cards: p-4, rounded-lg, border-l-4 (ideology color indicator)
  - Ideology badge: px-3 py-1 rounded-full text-xs
- Right panel (w-2/3): Analytics dashboard
  - Ideology distribution chart: pie chart, 320px diameter
  - Party alignment grid: 4-column grid of ally cards
  - Key metrics bar: 4 stat cards in row

### Demandas CRM Module
**Kanban Board**:
- Columns: flex layout, min-w-80 per column
- Column headers: p-4, count badge
- Demand cards: rounded-lg, p-4, gap-3, shadow-sm, draggable
  - Title: text-base font-medium
  - Priority badge: top-right, px-2 py-1 rounded
  - Meta info: text-xs (assignee, due date) with icons
  - Progress bar: h-1.5 rounded-full
- Side panel: w-96 slide-in for demand details
  - Tabbed interface: Details, Comments, History, Attachments
  - Form fields: gap-4 stacked layout

### Agenda Module
**Three-View System**:

1. **List View**:
   - Grouped by date: date headers (text-lg font-semibold)
   - Event cards: p-4, border-l-4 (category color), gap-2
   - Time: text-sm font-mono, left-aligned
   - Title + description: stacked, text-base

2. **Calendar View**:
   - Month grid: 7-column layout, aspect-square cells
   - Day cells: p-2, min-h-24
   - Event pills: rounded px-2 py-1 text-xs, truncated
   - Week/Day views: time slots h-12 intervals

3. **Timeline View**:
   - Vertical timeline: border-l-2 with dot markers
   - Event blocks: ml-8, p-4, connected to timeline
   - Duration bars: visual width based on duration

### Atendimento IA Module
**Configuration Panel**:
- Mode toggle: Large toggle switch (TSE Compliance / Formal Mode)
- Social platform cards: grid-cols-2 lg:grid-cols-4
  - Platform icon: 48px
  - Connection status: badge (Connected/Disconnected)
  - Configure button: text-sm
- Conversation monitor: chat-like interface
  - Message bubbles: max-w-xl, rounded-2xl, p-3
  - Platform indicators: small icon badges
  - Context preview: collapsed accordion showing post content

### Marketing Module
**Campaign Builder**:
- Two-column layout: Form (left w-1/2) + Preview (right w-1/2)
- Campaign type tabs: Email / WhatsApp
- Recipient management: tag-input style with chips
- Template selector: grid of template cards (3-column)
- Schedule section: date/time picker with timezone
- Send button: large, prominent, bottom-right

### Form Components
- Input fields: h-11, rounded-lg, px-4, border
- Labels: text-sm font-medium, mb-2
- Multi-select: pills/chips with remove icons
- Date pickers: calendar dropdown, 320px width
- Text areas: min-h-32, rounded-lg
- Buttons primary: h-11 px-6 rounded-lg font-medium
- Buttons secondary: h-11 px-6 rounded-lg border

### Data Display Components
- Cards: rounded-xl, shadow-sm, p-6
- Tables: rounded-lg overflow-hidden, header bg treatment
- Badges: px-2.5 py-0.5 rounded-full text-xs font-medium
- Stats: large number + label + trend in compact card
- Charts: min-h-80, responsive, clear axis labels

## Responsive Behavior
- Desktop (lg+): Full sidebar + multi-column layouts
- Tablet (md): Collapsible sidebar + 2-column max
- Mobile (base): Hidden sidebar (hamburger menu) + single column, stacked navigation

## Animations
**Minimal, purposeful only**:
- Transitions: transition-colors duration-200 for hovers
- Slide-ins: slide-in panels for details (300ms)
- NO scroll animations, parallax, or decorative motion
- Loading states: simple spinner, h-8 w-8

## Accessibility
- All interactive elements: min-h-11 (44px touch target)
- Form labels: always visible, programmatically associated
- Focus states: ring-2 offset-2 on keyboard focus
- Color contrast: ensure readability across all states
- ARIA labels: on icon-only buttons and complex widgets

## Images
**No hero images** - this is a productivity application, not marketing site
- User avatars: rounded-full, w-10 h-10 (profile), w-8 h-8 (mentions)
- Political party logos: w-12 h-12, displayed in party cards
- Empty states: simple illustrations, max-w-64, centered
- Profile photos: larger in settings/profile areas (w-24 h-24)