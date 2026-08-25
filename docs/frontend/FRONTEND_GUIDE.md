# THEMIS Frontend Development Guide

> This document defines the frontend engineering and UX rules for the THEMIS Employee Management system.
>
> All AI coding agents and developers must follow these rules when creating or modifying frontend code.

---

# 1. Product Overview

THEMIS is an internal management system for a Japanese legal-office environment.

The product is used for:

- employee management
- attendance management
- task assignment
- client management
- matter/case management
- document management
- approval workflows
- internal AI assistant features
- office operations

The interface is primarily a **work application**, not a marketing website.

Therefore:

> Productivity and information clarity are more important than visual decoration.

---

# 2. Frontend Technology

Current frontend stack:

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Axios
- lucide-react

Backend:

- Laravel
- REST API
- Laravel Sanctum

Do not introduce another frontend framework unless explicitly requested.

Do not replace the existing stack without approval.

---

# 3. Product Design Personality

THEMIS should feel:

- professional
- calm
- precise
- trustworthy
- organized
- modern
- premium
- efficient
- suitable for Japanese professional offices

The interface should NOT feel like:

- a generic SaaS dashboard
- a startup landing page
- an AI-generated template
- a cryptocurrency dashboard
- a gaming interface
- a futuristic AI interface
- a social media application

The design should communicate:

> Serious professional software built specifically for office operations.

---

# 4. Core UX Principle

Always prioritize:

1. Information hierarchy
2. User workflow
3. Readability
4. Action clarity
5. Consistency
6. Responsive behavior
7. Visual polish

Decoration comes after usability.

Never sacrifice usability for visual effects.

---

# 5. Think About Workflow Before UI

Before redesigning any screen, determine:

- Who uses this screen?
- What does the user want to accomplish?
- What information must be visible immediately?
- What action happens most frequently?
- What information is secondary?
- What information should be hidden until needed?

Do NOT start by thinking:

> "What cards should I create?"

Instead think:

> "What workflow must this page support?"

Example:

For 業務クエスト:

User workflow:

Client search

→ select client

→ inspect matter

→ check responsible employee/lawyer

→ check required documents

→ inspect recent communication

→ identify next action

The page architecture must support this workflow.

---

# 6. Avoid Generic AI UI

Avoid common AI-generated interface patterns.

Do NOT automatically create:

- four statistic cards at the top of every page
- giant welcome banners
- unnecessary greetings
- random analytics
- decorative charts
- purple-to-blue gradients
- glassmorphism
- glowing effects
- gradient text
- floating decorative objects
- excessive shadows
- excessive pill badges
- large empty hero sections
- huge headings
- cards inside cards inside cards
- an icon beside every single label
- excessive rounded containers

Do not make pages look like generic templates from:

- Dribbble SaaS dashboards
- AI admin templates
- startup landing pages

Every UI element must have a functional reason.

---

# 7. Information Density

THEMIS is professional productivity software.

Moderate information density is acceptable and often preferred.

Do not create excessive empty space.

Prefer:

- compact data rows
- useful metadata
- clear grouping
- readable tables
- split views
- master-detail layouts
- timelines
- structured lists

instead of turning everything into cards.

---

# 8. Page Architecture

A typical page should follow:

```text
Page
├── Page Header
├── Primary Actions
├── Optional Filters / Search
└── Main Workspace
```

Avoid unnecessary nested containers.

Example:

```text
BAD

Page
 └── Card
      └── Card
           └── Card
                └── Table
```

Prefer:

```text
GOOD

Page
 ├── Header
 ├── Toolbar
 └── Table
```

---

# 9. Existing Product Consistency

New pages must look like they belong to the same application.

Before creating a new page:

1. Inspect existing pages.
2. Identify reusable layouts.
3. Identify common spacing.
4. Identify existing buttons.
5. Identify existing forms.
6. Identify navigation behavior.
7. Identify dark/light mode behavior.

Do not invent a completely different design language for every page.

---

# 10. Reference Existing Good UI

When an existing page has an approved design, use it as a visual reference.

Reuse:

- typography hierarchy
- spacing rhythm
- border treatment
- toolbar styles
- input styles
- button styles
- dropdown styles
- modal behavior
- light/dark mode conventions

Do NOT blindly copy its page structure.

Different workflows require different layouts.

---

# 11. Main Application Pages

Current primary navigation includes:

- 社員ルーム
- 組織設計
- 業務クエスト
- マニュアル工房
- AI社員
- 承認室

All pages must feel like parts of one application.

---

# 12. Sidebar Rules

The application sidebar is a global navigation component.

Do NOT modify the sidebar when working on an unrelated page unless explicitly requested.

Pages must never visually overlap the sidebar.

Desktop content must correctly account for sidebar width.

Mobile behavior must use the existing mobile navigation pattern.

Avoid:

- negative margins that push content under the sidebar
- absolute positioning for main page layouts
- hardcoded viewport calculations that ignore navigation width

---

# 13. Responsive Design

Every major page must support at minimum:

- 1440px desktop
- 1024px laptop/tablet landscape
- 768px tablet
- 390px mobile

Responsive design is mandatory.

Do not treat mobile as an afterthought.

---

# 14. Responsive Strategy

Prefer responsive transformation rather than simply shrinking desktop UI.

Example:

Desktop:

```text
Client list | Client detail
```

Mobile:

```text
Client list
↓
Tap client
↓
Client detail
```

Do not squeeze two desktop columns into a tiny mobile viewport.

---

# 15. Horizontal Overflow

Horizontal page overflow is not acceptable unless a data table specifically requires horizontal scrolling.

After modifying UI, verify:

```text
document width <= viewport width
```

Pay particular attention to:

- tables
- fixed widths
- flex children
- long Japanese text
- modal widths
- sidebars
- input groups

---

# 16. Typography

Typography should establish clear hierarchy.

Use approximately:

## Page Title

- 28–32px
- semibold
- high emphasis

## Section Title

- 18–20px
- semibold

## Component Heading

- 15–16px
- medium or semibold

## Body

- approximately 14px

## Metadata

- approximately 12–13px

Avoid excessive font size variation.

Do not make dashboard titles unnecessarily huge.

---

# 17. Japanese Text

The primary business interface may contain Japanese labels.

Ensure:

- Japanese text does not overflow
- buttons remain readable
- table columns accommodate Japanese text
- line-height remains comfortable
- truncation is only used when details remain accessible

Do not truncate important operational information without a way to view it.

---

# 18. Spacing

Spacing must follow a consistent rhythm.

Prefer approximately:

```text
4
8
12
16
20
24
32
40
48
```

Avoid arbitrary values unless necessary.

Page padding:

Desktop:

```text
24–32px
```

Tablet:

```text
20–24px
```

Mobile:

```text
16px
```

---

# 19. Cards

Cards are allowed, but they must have a reason.

Good card use:

- independent information modules
- summaries
- compact status sections
- grouped controls
- profile summaries

Bad card use:

- wrapping every paragraph
- wrapping tables unnecessarily
- cards inside cards
- turning every list item into a large floating tile

Ask:

> Does this information actually need a container?

If not, don't create one.

---

# 20. Border Radius

Avoid excessive rounded corners.

Large "bubble" UI is not appropriate for this system.

General direction:

- compact controls → small radius
- inputs → moderate radius
- panels → moderate radius
- modals → moderate radius

Avoid automatically using:

```text
rounded-2xl
rounded-3xl
```

everywhere.

---

# 21. Shadows

Default:

> No shadow or very subtle shadow.

Use shadows mainly for:

- dropdowns
- floating menus
- modals
- overlays
- elements that genuinely float above another layer

Do not put strong shadows around every panel.

Prefer borders and background contrast.

---

# 22. Borders

Borders are useful for professional productivity interfaces.

Prefer subtle borders to excessive floating cards.

Borders can clarify:

- tables
- panel divisions
- inputs
- lists
- toolbars
- split panes

Keep border strength subtle.

---

# 23. Color Usage

Color should communicate meaning.

Examples:

Green:

- active
- completed
- success

Yellow / Amber:

- warning
- waiting
- pending

Red:

- destructive
- rejected
- overdue
- critical error

Blue:

- primary actions
- selected states
- informational context

Gray:

- neutral
- inactive
- secondary information

Do not use color randomly for decoration.

Detailed colors belong in:

```text
DESIGN_SYSTEM.md
```

---

# 24. Status Indicators

Status should be understandable even without color.

Use:

```text
icon + label
```

or

```text
label + subtle color
```

Do not rely only on:

```text
green dot
red dot
yellow dot
```

because users must understand the meaning immediately.

---

# 25. Icons

Use:

```text
lucide-react
```

Do not introduce another icon library without a clear reason.

Icons should communicate:

- action
- object
- status
- navigation

Avoid decorative icons.

Do NOT place an icon beside every heading simply because it looks visually interesting.

---

# 26. Buttons

Buttons must clearly represent importance.

Typical hierarchy:

```text
Primary
Secondary
Ghost
Destructive
```

There should usually be only one obvious primary action per local context.

Avoid multiple competing primary buttons.

---

# 27. Button Labels

Use clear action-oriented labels.

Better:

```text
保存
承認
却下
編集
削除
追加
案件を作成
```

Avoid ambiguous labels such as:

```text
OK
Next
Action
Manage
```

when a clearer label exists.

---

# 28. Destructive Actions

Actions like:

- delete
- reject
- revoke
- remove

must be visually distinct.

Important destructive operations should require confirmation.

Confirmation dialogs must clearly state:

- what will happen
- what object is affected
- whether the operation can be reversed

---

# 29. Forms

Forms must prioritize completion speed and clarity.

Use:

- clear labels
- useful placeholders
- inline validation
- logical field grouping
- appropriate input types

Avoid unnecessarily long forms.

If a form is large, consider grouping fields into logical sections.

---

# 30. Form Labels

Do not rely only on placeholders.

Bad:

```text
[ Enter name... ]
```

Better:

```text
氏名
[ 名前を入力 ]
```

Labels must remain visible after data entry.

---

# 31. Tables

Tables are appropriate for operational data.

Use tables when users need to:

- scan multiple records
- compare values
- sort information
- filter records
- perform repeated actions

Do not convert a useful desktop table into a collection of huge cards simply because cards look modern.

---

# 32. Table Actions

Frequently used actions should remain discoverable.

Possible patterns:

```text
row action button
three-dot menu
context action
```

Avoid showing five large buttons in every table row.

---

# 33. Mobile Tables

Do not force wide desktop tables into 390px screens.

Depending on information importance, mobile may use:

- horizontal table scrolling
- stacked rows
- compact cards
- master-detail navigation

Choose based on workflow.

---

# 34. Search

If a page contains many records, search should be easy to find.

Search fields should:

- have clear placeholder text
- use appropriate icon
- be visually associated with the dataset
- not dominate the whole screen

---

# 35. Filters

Do not permanently display dozens of filter controls.

Prefer:

```text
essential filters
+
advanced filter
```

when filter complexity becomes high.

---

# 36. Empty States

Empty states should explain what happened.

Bad:

```text
No data.
```

Better:

```text
案件がまだ登録されていません。
「案件を追加」から最初の案件を作成できます。
```

Provide an action when appropriate.

---

# 37. Loading States

Never leave an unexplained blank page while loading.

Use appropriate:

- spinner
- skeleton
- loading message

Avoid excessive animation.

---

# 38. Error States

Error messages must help the user understand what to do.

Bad:

```text
Something went wrong.
```

Better:

```text
案件情報を取得できませんでした。
もう一度お試しください。
```

When useful, provide retry functionality.

---

# 39. Modals

Use modals for focused temporary actions.

Examples:

- confirmation
- small edit forms
- task assignment
- approval
- quick detail preview

Do not put extremely complex workflows inside tiny modals.

Large workflows should usually have their own page or drawer.

---

# 40. Drawers

Drawers can be useful for:

- details
- editing
- history
- filters
- secondary workflows

Do not use drawers everywhere.

Use them when preserving page context benefits the user.

---

# 41. Master-Detail Layouts

Master-detail is recommended for:

- client management
- matter management
- documents
- message history
- employee lists

Example:

```text
┌─────────────────┬─────────────────────────┐
│ Client List     │ Selected Client         │
│                 │                         │
│ Client A        │ Profile                 │
│ Client B        │ Matters                 │
│ Client C        │ Documents               │
│                 │ Communication history   │
└─────────────────┴─────────────────────────┘
```

This is often better than opening endless cards or modals.

---

# 42. Tabs

Tabs should represent meaningful peer sections.

Good example:

```text
概要
案件
書類
履歴
メモ
```

Avoid creating tabs just to hide poor information architecture.

Too many tabs may indicate that the page needs restructuring.

---

# 43. Activity Timelines

Timeline patterns are appropriate for:

- communication history
- case history
- attendance history
- approval history
- AI actions
- document updates

Keep timeline entries compact.

Important information:

- who
- what
- when
- optional detail

---

# 44. Dark Mode

New UI must support both:

- light mode
- dark mode

Do not hardcode colors that only work in one mode.

Verify:

- text contrast
- borders
- inputs
- tables
- dropdowns
- hover states
- selected states
- modals
- badges

---

# 45. Hover States

Interactive desktop elements should usually have a visible hover state.

Hover effects should be subtle.

Avoid:

- dramatic scaling
- large translations
- strong glow effects

This is productivity software.

---

# 46. Focus States

Keyboard-accessible controls must have visible focus states.

Never remove focus outlines without providing a replacement.

---

# 47. Animation

Animation should explain state changes.

Good:

- dropdown opening
- modal transition
- sidebar transition
- subtle row hover
- tab change

Bad:

- floating objects
- constant glowing
- bouncing icons
- unnecessary looping animation

Keep motion subtle and fast.

---

# 48. Component Reuse

Before creating a component:

1. Search the frontend project.
2. Check whether a similar component exists.
3. Reuse or extend it when appropriate.

Do not create:

```text
PrimaryButton
MainButton
BlueButton
ActionButton
SubmitButton
```

if they all perform the same visual function.

---

# 49. Component Responsibility

Components should have clear responsibilities.

Example:

```text
BusinessQuest.tsx
```

should orchestrate the page.

It should not contain thousands of lines of:

- modal markup
- table markup
- client cards
- utilities
- API calls
- formatting functions
- unrelated business logic

Extract meaningful components.

---

# 50. Suggested Page Structure

For larger pages:

```text
pages/
  BusinessQuest.tsx

components/
  business-quest/
    ClientList.tsx
    ClientSearch.tsx
    ClientDetail.tsx
    MatterList.tsx
    DocumentList.tsx
    CommunicationTimeline.tsx
```

Use meaningful domain names.

---

# 51. Avoid Over-Componentization

Do not extract every `<div>` into a component.

Create a component when it has:

- clear responsibility
- repeated use
- complex logic
- independent UI behavior
- meaningful domain concept

---

# 52. TypeScript

Avoid unnecessary:

```ts
any;
```

Prefer proper interfaces and types.

Example:

```ts
interface Client {
  id: number;
  name: string;
  status: ClientStatus;
}
```

Use existing backend/API shapes whenever available.

---

# 53. API Logic

API calls should not be unnecessarily duplicated.

Prefer reusable API functions/services when the project already has them.

Do not change backend endpoint behavior just to simplify frontend code unless explicitly requested.

---

# 54. Axios

Use the existing Axios configuration.

Do not create random new Axios instances per page.

Respect existing:

- base URL
- authentication
- Sanctum
- error handling

---

# 55. Authentication

Do not change authentication behavior during unrelated UI tasks.

Preserve:

- current user state
- protected routes
- logout behavior
- Sanctum setup

Authentication modifications require an explicit task.

---

# 56. Preserve Existing Functionality

A redesign is NOT permission to remove functionality.

Before changing a page:

1. identify current functions
2. identify API calls
3. identify actions
4. identify state behavior
5. preserve them

Visual redesign should not silently break business logic.

---

# 57. Scope Control

Modify only files relevant to the task.

If the task is:

```text
Improve BusinessQuest client table
```

do not redesign:

- sidebar
- EmployeeRoom
- authentication
- approvals
- global header

unless required.

Avoid unrelated refactoring.

---

# 58. Backend Scope

Do NOT modify Laravel backend during UI-only tasks unless:

- frontend cannot work without backend modification
- task explicitly requires backend work

If backend modification seems necessary, explain why before making broad changes.

---

# 59. Existing Database Contracts

Do not rename API fields simply for aesthetic reasons.

Frontend should respect the backend contract.

If a mismatch exists, explicitly identify it.

---

# 60. Performance

Avoid unnecessary:

- rerenders
- huge dependencies
- massive images
- duplicate API requests
- expensive calculations during render

Use optimization only where useful.

Do not prematurely complicate simple components.

---

# 61. Accessibility

Basic accessibility is mandatory.

Ensure:

- buttons use `<button>`
- inputs have labels
- controls support keyboard use
- interactive elements are not plain `<div>`
- images have appropriate alt text
- contrast is readable

---

# 62. Mobile Touch Targets

Interactive elements on mobile should have comfortable touch targets.

Avoid tiny:

```text
16px × 16px
```

buttons as primary interactive elements.

Icons may be visually small while their button container remains large enough to tap.

---

# 63. AI Employee UI

AI社員 should remain part of the THEMIS product language.

Do not turn it into a completely different futuristic AI app.

AI UI may have slightly different visual character, but must still share:

- sidebar
- typography
- colors
- controls
- spacing
- surfaces

with the rest of THEMIS.

Avoid excessive:

- sparkles
- gradients
- glowing borders
- futuristic effects

---

# 64. Approval UI

承認室 prioritizes:

1. request
2. requester
3. reason
4. relevant context
5. approval/rejection actions

Approval actions must be clearly visible.

Do not hide critical approval information behind excessive decoration.

---

# 65. Attendance UI

社員ルーム attendance functions must clearly communicate:

```text
勤務中
休憩中
外出
退勤
```

Status must be immediately understandable.

Time-related actions require clear feedback.

---

# 66. BusinessQuest UI

業務クエスト should prioritize operational case management.

Primary concepts:

```text
Client
Matter
Case type
Responsible person
Status
Documents
Communication
Memo
Next action
```

Recommended patterns:

- searchable client list
- master-detail
- tabs for detailed information
- document checklist
- activity timeline

Avoid turning every client into a giant decorative card.

---

# 67. Organization Design UI

組織設計 should prioritize:

- organizational clarity
- employee roles
- permissions
- reporting structure
- office assignment
- task assignment

Do not make organization data visually confusing for the sake of decorative layouts.

---

# 68. Design Review Before Coding

For significant redesigns, first inspect the page.

Before writing code, determine:

```text
Current problems
User workflow
Information hierarchy
Reusable components
Proposed layout
Files that need modification
```

Avoid immediately rewriting the whole page.

---

# 69. UI Self-Review

Before considering a frontend task complete, evaluate:

```text
Visual hierarchy
Spacing
Typography
Consistency
Usability
Information density
Responsiveness
Professionalism
Originality
```

Target a high-quality production interface.

---

# 70. Visual Quality

Ask:

> Does this look intentionally designed for THEMIS?

not:

> Does this look modern?

"Modern" alone is not a useful design goal.

A modern generic SaaS dashboard is still incorrect if it does not fit THEMIS.

---

# 71. Desktop Verification

Verify desktop layouts at approximately:

```text
1440px
1024px
```

Check:

- sidebar relationship
- content width
- tables
- toolbars
- modals
- overflow
- spacing

---

# 72. Tablet Verification

Verify around:

```text
768px
```

Check:

- navigation
- multi-column layouts
- forms
- tables
- detail panes

Convert layouts when necessary.

---

# 73. Mobile Verification

Verify around:

```text
390px
```

Check:

- no page overflow
- readable typography
- usable buttons
- appropriate stacking
- modals fit viewport
- navigation remains accessible

---

# 74. Build Verification

After frontend modifications run the existing project checks.

At minimum ensure:

```bash
npm run build
```

passes when appropriate.

Fix TypeScript errors introduced by the change.

Do not leave avoidable warnings caused by new code.

---

# 75. Do Not Rewrite Working Features Without Reason

If something already works:

> prefer improving it over replacing it.

Large rewrites increase:

- bugs
- development time
- AI token usage
- regression risk

Use incremental improvements whenever possible.

---

# 76. AI Coding Agent Rules

When an AI agent receives a frontend task:

## Step 1

Read this file.

## Step 2

Inspect the target page.

## Step 3

Inspect relevant reusable components.

## Step 4

Understand existing functionality.

## Step 5

Determine user workflow.

## Step 6

Plan the smallest coherent change.

## Step 7

Implement.

## Step 8

Verify responsiveness.

## Step 9

Run frontend checks.

## Step 10

Summarize what changed.

---

# 77. What AI Must NOT Do

AI agents must NOT:

- redesign unrelated pages
- remove existing functionality
- change backend behavior without reason
- add random npm packages
- introduce another icon library
- duplicate existing components
- create generic SaaS dashboard layouts
- add decorative gradients automatically
- add unnecessary statistics
- create excessive cards
- ignore mobile layout
- ignore dark mode
- silently change API contracts
- create huge monolithic React files

---

# 78. When Unsure

When the desired visual design is unclear:

Prefer:

```text
simple
structured
professional
information-focused
consistent with existing THEMIS UI
```

Do NOT compensate for uncertainty by adding decoration.

---

# 79. Design Priority

When decisions conflict, use this order:

```text
1. Business functionality
2. User workflow
3. Information clarity
4. Consistency
5. Accessibility
6. Responsiveness
7. Visual aesthetics
8. Decorative effects
```

---

# 80. Definition of Done

A frontend task is complete only when:

- requested functionality works
- existing functionality remains intact
- UI belongs to the THEMIS design language
- desktop layout works
- tablet layout works
- mobile layout works
- light mode works
- dark mode works
- no unintended horizontal overflow exists
- TypeScript/build checks pass
- no unnecessary dependencies were introduced
- unrelated pages were not modified
- generic AI-dashboard patterns were avoided

---

# Final Principle

THEMIS is not a collection of isolated web pages.

It is one professional operating system.

Every new page should feel like it was designed by the same product team.

When designing or coding frontend UI:

> Understand the work first.
> Organize the information second.
> Design the interaction third.
> Add visual polish last.
