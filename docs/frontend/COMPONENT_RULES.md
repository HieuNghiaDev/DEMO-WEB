# THEMIS Frontend Component Rules

> Rules for creating, organizing and reusing React components in the THEMIS frontend.

---

# 1. Purpose

This document defines how frontend components should be structured.

Goals:

- reduce duplicated code
- prevent giant page files
- improve maintainability
- maintain consistent UI
- help AI agents understand component responsibilities
- make future development easier

---

# 2. Main Principle

A page should coordinate features.

A component should perform a clear responsibility.

Do not put the entire application inside one page component.

---

# 3. Page Components

Page components belong in:

```text
src/pages/
```

Examples:

```text
EmployeeRoom.tsx
OrganizationDesign.tsx
BusinessQuest.tsx
AI.tsx
Approvals.tsx
```

Pages should primarily handle:

- page composition
- feature coordination
- high-level state
- page-specific API orchestration

---

# 4. Feature Components

Feature-specific components should use folders.

Example:

```text
src/components/business-quest/
```

Possible components:

```text
ClientList.tsx
ClientSearch.tsx
ClientDetail.tsx
MatterList.tsx
MatterDetail.tsx
DocumentList.tsx
CommunicationTimeline.tsx
ClientMemo.tsx
```

---

# 5. Shared Components

Generic reusable UI belongs in:

```text
src/components/ui/
```

Possible examples:

```text
Button.tsx
Input.tsx
Modal.tsx
Badge.tsx
EmptyState.tsx
Spinner.tsx
ConfirmDialog.tsx
```

Do not make a component shared until its responsibility is genuinely reusable.

---

# 6. Layout Components

Application layout components may belong in:

```text
src/components/layout/
```

Examples:

```text
Sidebar.tsx
Header.tsx
PageShell.tsx
MobileNavigation.tsx
```

Do not duplicate global layout inside individual pages.

---

# 7. Feature Folder Structure

Recommended structure:

```text
src/
├── components/
│   ├── ui/
│   ├── layout/
│   │
│   ├── employee-room/
│   ├── organization/
│   ├── business-quest/
│   ├── approvals/
│   └── ai/
│
├── pages/
├── services/
├── hooks/
├── types/
└── utils/
```

Do not reorganize the entire project automatically.

Move incrementally when required.

---

# 8. Component Naming

Use PascalCase.

Good:

```text
ClientDetail.tsx
EmployeeAvatar.tsx
ApprovalRequestRow.tsx
```

Bad:

```text
clientdetail.tsx
box1.tsx
componentNew.tsx
TempCard.tsx
```

Names should describe purpose.

---

# 9. Boolean Props

Boolean props should read naturally.

Good:

```tsx
isOpen;
isLoading;
isSelected;
isDisabled;
hasError;
canApprove;
```

Avoid:

```tsx
openFlag;
loadingValue;
statusBoolean;
```

---

# 10. Event Props

Use:

```text
on...
```

Examples:

```tsx
onClick;
onClose;
onSelect;
onApprove;
onReject;
onSave;
```

---

# 11. Data Props

Prefer domain-specific names.

Good:

```tsx
client;
matter;
employee;
approvalRequest;
```

Avoid generic:

```tsx
data;
item;
value;
```

when the semantic meaning is known.

---

# 12. TypeScript Props

Define explicit props.

Example:

```tsx
interface ClientDetailProps {
  client: Client;
  onEdit?: (client: Client) => void;
}
```

Avoid:

```tsx
const ClientDetail = (props: any) => {};
```

---

# 13. Avoid `any`

Do not use:

```ts
any;
```

unless unavoidable.

Prefer:

```ts
unknown;
```

when shape is genuinely unknown.

---

# 14. Types

Shared domain types should be placed where appropriate.

Possible:

```text
src/types/
```

Example:

```text
client.ts
employee.ts
approval.ts
attendance.ts
```

Do not duplicate the same interface in five components.

---

# 15. Component Size

There is no absolute line limit.

However, investigate components exceeding approximately:

```text
300–500 lines
```

especially if they contain multiple unrelated UI sections.

Large pages should usually be decomposed.

---

# 16. Do Not Split Blindly

Do not create separate components purely to reduce line count.

Bad:

```text
TitleText.tsx
SmallDivider.tsx
RowWrapper.tsx
```

unless these have actual reuse or meaningful behavior.

---

# 17. Extract When

Extract a component when:

- reused
- logically independent
- has significant state
- has significant rendering complexity
- represents a domain concept
- improves readability

---

# 18. Keep Together When

Keep UI together when:

- logic is tiny
- only used once
- splitting would make understanding harder
- component has no meaningful identity

---

# 19. Business Logic

Avoid mixing heavy business logic directly into JSX.

Prefer:

```tsx
const canApprove = ...
const displayStatus = ...
const filteredClients = ...
```

before JSX.

For larger logic, use:

- hooks
- utilities
- services

---

# 20. API Calls

Avoid writing duplicate Axios calls inside multiple components.

Prefer feature services when appropriate.

Example:

```text
src/services/
  clients.ts
  matters.ts
  approvals.ts
  attendance.ts
```

---

# 21. Existing API Layer

Before creating a new API helper:

1. inspect existing Axios setup
2. inspect existing services
3. reuse existing conventions

Do not create another HTTP architecture unnecessarily.

---

# 22. Axios Instance

Use existing configured Axios instance.

Do not create:

```tsx
axios.create(...)
```

inside every feature.

---

# 23. Authentication

Frontend components should not duplicate authentication logic.

Authentication belongs in:

- auth context
- auth hook
- route guard
- existing central authentication layer

Do not introduce new auth mechanisms during UI work.

---

# 24. Hooks

Custom hooks should start with:

```text
use
```

Examples:

```text
useAuth
useClients
useAttendance
useApprovalRequests
```

---

# 25. Hook Responsibilities

Hooks can handle:

- reusable state logic
- data fetching
- side effects
- shared feature logic

Avoid creating hooks for trivial constants.

---

# 26. State Location

Keep state as close as possible to where it is needed.

Do not move everything into global state.

Use global state only when information genuinely spans multiple areas.

---

# 27. Derived State

Avoid storing values that can be calculated.

Bad:

```tsx
const [filteredClients, setFilteredClients] = useState([]);
```

when it can safely derive from:

```tsx
clients;
search;
filters;
```

Prefer derived values.

---

# 28. Effects

Use `useEffect` for side effects.

Do not use effects as a replacement for normal calculations.

Avoid complex chains of effects where possible.

---

# 29. Loading State

Feature components fetching data should handle:

```text
loading
success
empty
error
```

Do not show blank space.

---

# 30. Error State

Error UI should be understandable.

Provide retry when appropriate.

---

# 31. Empty State

Use reusable empty-state component when presentation is common.

Do not duplicate large empty-state markup across pages.

---

# 32. Buttons

Prefer reusable button patterns.

Avoid duplicating:

```tsx
className = "...";
```

with slightly different values across dozens of pages.

---

# 33. Base UI Components

Recommended future shared components:

```text
Button
IconButton
Input
Textarea
Select
Badge
Modal
ConfirmDialog
DropdownMenu
EmptyState
Spinner
PageHeader
```

Do not create all at once unless required.

Build incrementally.

---

# 34. Button Variants

Button should ideally support:

```text
primary
secondary
ghost
destructive
```

Possible sizes:

```text
sm
md
lg
```

Avoid 12 unrelated button styles.

---

# 35. Icons

Use lucide-react.

Import only necessary icons.

Good:

```tsx
import { Search, Plus, Trash2 } from "lucide-react";
```

Avoid importing the entire library.

---

# 36. Icon Placement

Buttons with icons generally use:

```text
icon
label
```

Example:

```text
＋ 案件を追加
```

Icon-only actions must have:

```text
aria-label
```

---

# 37. Modal Components

Avoid implementing separate modal overlay logic for every page.

Prefer common modal foundation.

Feature-specific modal content can remain separate.

Example:

```text
Modal
└── AssignTaskDialog
```

---

# 38. Confirmation Dialog

Destructive operations should preferably use shared confirmation behavior.

Examples:

```text
Delete client
Delete document
Reject request
```

---

# 39. Tables

Generic table infrastructure can be reused carefully.

Do not build an extremely abstract table framework prematurely.

Business-specific columns should remain close to their feature.

---

# 40. Table Row Component

Extract row component when:

- row markup is complex
- row has actions
- row has independent interactions

Simple tables can remain inline.

---

# 41. Forms

Feature forms should use meaningful component names.

Examples:

```text
EmployeeForm
ClientForm
MatterForm
TaskAssignmentForm
```

---

# 42. Form State

Follow existing project form patterns.

Do not introduce a new form library only because an AI agent prefers it.

---

# 43. New Dependencies

Do not install npm packages without clear need.

Before adding dependency:

1. check existing packages
2. determine whether native React/Tailwind can solve it
3. evaluate bundle and maintenance impact

---

# 44. Tailwind

Use Tailwind consistently.

Avoid mixing:

- inline styles
- CSS modules
- styled-components

unless existing architecture already requires them.

---

# 45. Arbitrary Tailwind Values

Avoid excessive arbitrary values:

```text
w-[413px]
mt-[17px]
rounded-[13px]
```

Prefer standard design tokens.

Use arbitrary values only for real layout requirements.

---

# 46. Class Complexity

If JSX contains extremely long repeated class strings, consider:

- shared component
- utility function
- local constant

Do not create abstraction solely for one short class string.

---

# 47. Conditional Classes

Use existing project convention.

If no utility exists, simple template conditions are acceptable.

Do not install a package only to combine two classes.

---

# 48. Accessibility

Reusable components should preserve native semantics.

Use:

```tsx
<button>
<input>
<label>
<nav>
main
header
section
```

appropriately.

---

# 49. Div Buttons

Do not write:

```tsx
<div onClick={...}>
```

when the element is actually a button.

Use:

```tsx
<button type="button">
```

---

# 50. Keyboard Access

Interactive components should work with keyboard.

Modal should support:

```text
Escape to close
```

when appropriate.

---

# 51. Responsive Components

A reusable component must not assume one screen size unless explicitly desktop-only.

Avoid fixed widths like:

```text
w-[800px]
```

without responsive fallback.

---

# 52. Responsive Tables

Feature decides strategy:

- horizontal scroll
- card conversion
- column hiding
- master-detail

Do not blindly hide important information.

---

# 53. Dark Mode

Every reusable visual component must support dark mode.

Do not create a shared component that only works in light mode.

---

# 54. Reuse Existing Patterns

Before building:

```text
new modal
new dropdown
new status badge
new page header
```

search the repository first.

Existing consistency is more important than AI preference.

---

# 55. Preserve Existing Behavior

Component refactoring must not alter functionality unintentionally.

Before extracting:

- identify props
- identify event behavior
- identify API calls
- identify state transitions

---

# 56. Feature Boundaries

BusinessQuest components should generally not import components from EmployeeRoom unless those components are truly generic.

Generic reusable pieces belong in:

```text
components/ui
```

or another shared location.

---

# 57. Circular Dependencies

Avoid feature components importing one another in circular patterns.

Keep dependency direction simple.

---

# 58. Suggested Dependency Direction

Preferred:

```text
pages
  ↓
feature components
  ↓
shared UI
  ↓
utilities / types
```

Services may be consumed from appropriate layers.

---

# 59. Constants

Reusable constants should not be recreated inside each render.

Example:

```ts
const STATUS_OPTIONS = [...]
```

Place them outside component when appropriate.

---

# 60. Formatting Helpers

Examples:

```text
formatDate
formatTime
formatEmployeeName
formatStatus
```

Reusable formatting functions belong in utilities.

---

# 61. Date Logic

Do not manually reimplement complex date calculations across many components.

Use existing project approach.

Avoid adding another date library without approval.

---

# 62. Japanese Labels

Avoid duplicating status label mappings.

Bad:

```tsx
status === 'working' ? '勤務中' : ...
```

in 10 files.

Prefer shared mapping.

---

# 63. Status Mapping

Example concept:

```ts
const ATTENDANCE_STATUS_LABELS = {
  working: "勤務中",
  break: "休憩中",
  outside: "外出",
  finished: "退勤",
};
```

Use project-compatible values.

---

# 64. Component Comments

Comments should explain:

- why
- unusual business rules
- complex behavior

Avoid comments that simply restate code.

Bad:

```tsx
// Set loading to true
setLoading(true);
```

---

# 65. Dead Code

Do not leave:

- unused imports
- unused variables
- commented-out old UI
- temporary debug code

after completing a task.

---

# 66. Console Logs

Remove temporary:

```tsx
console.log(...)
```

unless intentionally part of debugging infrastructure.

---

# 67. File Naming

React components:

```text
PascalCase.tsx
```

Utilities/services:

follow existing project convention.

Do not mix naming styles randomly.

---

# 68. Import Organization

Keep imports understandable.

Typical grouping:

```text
React / external libraries

internal shared components

feature components

services/hooks/types
```

Follow existing formatter/linter rules if present.

---

# 69. Do Not Rewrite Entire Files

When changing one feature:

prefer targeted edits.

Do not rewrite a 1,000-line file from scratch unless necessary.

Large rewrites increase regression risk.

---

# 70. Refactoring Large Pages

When a page becomes too large:

Step 1:

identify independent sections.

Step 2:

extract domain components.

Step 3:

preserve behavior.

Step 4:

run build.

Step 5:

only then continue redesign.

Do not combine major refactor + major visual redesign + backend change in one uncontrolled task.

---

# 71. Recommended BusinessQuest Structure

Example:

```text
BusinessQuest.tsx
│
├── BusinessQuestHeader
├── ClientToolbar
│
├── BusinessQuestWorkspace
│   ├── ClientList
│   └── ClientDetail
│       ├── ClientOverview
│       ├── MatterList
│       ├── DocumentList
│       └── CommunicationTimeline
│
└── dialogs
    ├── CreateClientDialog
    ├── CreateMatterDialog
    └── DeleteClientDialog
```

Implement only components actually needed.

---

# 72. Recommended EmployeeRoom Structure

Possible decomposition:

```text
EmployeeRoom.tsx
│
├── AttendancePanel
├── OfficeStatus
├── EmployeeAvatarList
├── MyQuest
├── AttendanceHistory
└── related dialogs
```

Do not refactor automatically unless task requires it.

---

# 73. Recommended Organization Structure

Possible:

```text
OrganizationDesign.tsx
│
├── OrganizationHeader
├── EmployeeDirectory
├── EmployeeDetail
├── RoleBadge
└── AssignTaskDialog
```

---

# 74. Recommended Approvals Structure

Possible:

```text
Approvals.tsx
│
├── ApprovalFilters
├── ApprovalRequestList
├── ApprovalRequestDetail
└── ApprovalDecisionDialog
```

---

# 75. Recommended AI Structure

Possible:

```text
AI.tsx
│
├── PersonaTabs
├── ConversationView
├── ChatMessage
├── ChatComposer
└── ToolExecutionPanel
```

---

# 76. Performance

Do not optimize everything with:

```tsx
useMemo;
useCallback;
memo;
```

without reason.

Use when actual render cost or identity stability matters.

---

# 77. Lists

Always use stable keys.

Good:

```tsx
key={client.id}
```

Avoid:

```tsx
key = { index };
```

when list can change ordering.

---

# 78. Async Actions

Disable repeat-submit when request is in progress.

Example:

```text
保存中...
```

Prevent accidental duplicate operations.

---

# 79. Optimistic UI

Only use optimistic updates when failure recovery is clear.

Critical legal-office operations may prefer confirmed backend success.

---

# 80. Destructive Operations

Never optimistically delete critical records unless design explicitly supports rollback.

---

# 81. API Errors

Do not silently swallow errors.

Present useful user feedback.

Log appropriately according to project architecture.

---

# 82. Component Review Checklist

Before completing component work:

- Is responsibility clear?
- Is naming understandable?
- Are props typed?
- Is existing component reused?
- Is dark mode supported?
- Is mobile supported?
- Are keyboard semantics correct?
- Is business functionality preserved?
- Is duplicated logic introduced?
- Is the component unnecessarily abstract?

---

# 83. Page Review Checklist

Before finishing page modifications:

- Does layout match THEMIS design system?
- Is page hierarchy clear?
- Does sidebar remain correct?
- Does desktop work?
- Does tablet work?
- Does mobile work?
- Does light mode work?
- Does dark mode work?
- Are API calls unchanged unless intended?
- Does build pass?

---

# 84. AI Agent Rule

AI agents must inspect existing implementation before creating new components.

Never assume the project structure.

Never replace an existing reusable pattern merely because another pattern is personally preferred.

---

# Final Principle

Component architecture exists to make THEMIS easier to understand, modify and maintain.

Do not optimize for:

> maximum number of components.

Optimize for:

> clear responsibilities and consistent behavior.
