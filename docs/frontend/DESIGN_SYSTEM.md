# THEMIS Design System

> Visual design source of truth for the THEMIS Employee Management system.
>
> All frontend developers and AI coding agents must follow this document when creating or modifying UI.

---

# 1. Design Philosophy

THEMIS is professional internal software used in a legal-office environment.

The interface should feel:

- calm
- precise
- reliable
- mature
- premium
- efficient
- professional

THEMIS is NOT:

- a marketing website
- a startup landing page
- a generic SaaS dashboard
- an AI template
- a gaming interface

Primary principle:

> Information first. Decoration second.

---

# 2. Visual Character

The interface should resemble modern professional Japanese business software.

Preferred characteristics:

- structured layouts
- subtle borders
- restrained color usage
- moderate information density
- compact controls
- strong visual hierarchy
- minimal visual noise

Avoid:

- excessive gradients
- glowing effects
- glassmorphism
- floating decorative elements
- giant cards
- excessive rounded corners
- excessive shadows
- decorative illustrations without purpose

---

# 3. Design Tokens

Use consistent design tokens instead of arbitrary values.

Recommended spacing scale:

```text
4px
8px
12px
16px
20px
24px
32px
40px
48px
64px
```

Recommended Tailwind equivalents:

```text
1
2
3
4
5
6
8
10
12
16
```

Avoid random spacing such as:

```text
17px
23px
37px
```

unless absolutely required.

---

# 4. Application Background

Light mode:

```text
Main background:
slate-50 / neutral-50

Primary surface:
white

Secondary surface:
slate-50

Elevated surface:
white
```

Dark mode:

```text
Main background:
slate-950

Primary surface:
slate-900

Secondary surface:
slate-900 / slate-800

Elevated surface:
slate-800
```

Avoid pure black backgrounds.

Avoid excessive differences between surfaces.

---

# 5. Primary Color

THEMIS primary color should communicate:

- trust
- intelligence
- professionalism

Recommended family:

```text
blue / indigo
```

Primary action example:

```text
bg-blue-600
hover:bg-blue-700
```

Dark mode may use:

```text
bg-blue-500
hover:bg-blue-400
```

Do not use primary blue everywhere.

Primary color should mainly indicate:

- selected state
- primary action
- links
- active navigation
- focus

---

# 6. Semantic Colors

## Success

Use green.

Examples:

```text
勤務中
完了
承認済み
成功
```

Suggested:

```text
green-500
green-600
```

---

## Warning

Use amber/yellow.

Examples:

```text
保留
確認待ち
期限注意
```

Suggested:

```text
amber-500
amber-600
```

---

## Error / Destructive

Use red.

Examples:

```text
削除
却下
期限超過
エラー
```

Suggested:

```text
red-500
red-600
```

---

## Information

Use blue.

Examples:

```text
審査中
情報
選択中
```

---

## Neutral

Use slate/gray.

Examples:

```text
未設定
無効
補助情報
```

---

# 7. Text Colors

Light mode:

```text
Primary text:
slate-900

Secondary text:
slate-600

Muted text:
slate-500

Disabled text:
slate-400
```

Dark mode:

```text
Primary text:
slate-100

Secondary text:
slate-300

Muted text:
slate-400

Disabled text:
slate-500
```

Do not use low-contrast gray text for important information.

---

# 8. Typography Hierarchy

## Page Title

Recommended:

```text
text-2xl
md:text-3xl
font-semibold
tracking-tight
```

Approximate:

```text
28–32px
```

Do not use giant 40–64px dashboard titles.

---

## Page Description

```text
text-sm
text-slate-500
```

Maximum approximately:

```text
14–15px
```

---

## Section Heading

```text
text-lg
font-semibold
```

Approximately:

```text
18–20px
```

---

## Component Heading

```text
text-sm
font-semibold
```

or

```text
text-base
font-medium
```

depending on hierarchy.

---

## Body Text

Default:

```text
text-sm
```

Approximately:

```text
14px
```

---

## Metadata

Recommended:

```text
text-xs
text-slate-500
```

Approximately:

```text
12–13px
```

---

# 9. Font Weight

Prefer:

```text
font-normal
font-medium
font-semibold
```

Use:

```text
font-bold
```

sparingly.

Excessive bold text creates visual noise.

---

# 10. Line Height

Body content should remain readable.

Typical:

```text
leading-5
leading-6
```

Japanese text should not feel vertically cramped.

---

# 11. Border Radius

THEMIS should not have a bubble-like interface.

Recommended:

## Small controls

```text
rounded-md
```

Approximately:

```text
6px
```

## Inputs

```text
rounded-lg
```

Approximately:

```text
8px
```

## Panels

```text
rounded-lg
```

or maximum:

```text
rounded-xl
```

## Modals

```text
rounded-xl
```

Avoid defaulting to:

```text
rounded-2xl
rounded-3xl
```

---

# 12. Borders

Borders are preferred over strong shadows.

Light mode:

```text
border-slate-200
```

Dark mode:

```text
border-slate-700
```

Common example:

```text
border border-slate-200
dark:border-slate-700
```

---

# 13. Shadows

Default surfaces:

```text
shadow-none
```

Small elevated surfaces:

```text
shadow-sm
```

Dropdown / popover:

```text
shadow-lg
```

Modal:

```text
shadow-xl
```

Avoid heavy shadows around every card.

---

# 14. Page Layout

Recommended page shell:

```text
Sidebar
+
Main content
```

Main content should use:

```text
min-w-0
flex-1
```

to prevent overflow.

Desktop padding:

```text
p-6
xl:p-8
```

Tablet:

```text
p-5
```

Mobile:

```text
p-4
```

---

# 15. Maximum Width

Operational pages usually should use available space.

Do NOT automatically use:

```text
max-w-4xl
```

for data-heavy pages.

Appropriate examples:

```text
max-w-screen-2xl
```

or:

```text
w-full
```

Forms may use narrower widths when appropriate.

---

# 16. Page Header

Preferred:

```text
Title
Optional description
Right-side actions
```

Example structure:

```text
┌───────────────────────────────────────────────┐
│ 業務クエスト                   ＋案件を追加   │
│ 顧客・案件・書類を管理します                  │
└───────────────────────────────────────────────┘
```

Avoid huge welcome sections.

---

# 17. Toolbar

Toolbar may contain:

- search
- filters
- view options
- primary action
- sorting

Recommended height:

```text
40–48px controls
```

Do not make toolbars unnecessarily tall.

---

# 18. Primary Buttons

Recommended:

```text
inline-flex
items-center
justify-center
gap-2
h-10
px-4
rounded-lg
text-sm
font-medium
bg-blue-600
text-white
hover:bg-blue-700
transition-colors
```

Avoid:

```text
huge padding
huge rounded radius
strong shadow
gradient background
```

---

# 19. Secondary Buttons

Recommended:

```text
border
bg-white
text-slate-700

dark:
bg-slate-900
text-slate-200
border-slate-700
```

---

# 20. Ghost Buttons

Use for lower-priority actions.

Example:

```text
hover:bg-slate-100
dark:hover:bg-slate-800
```

---

# 21. Destructive Buttons

Recommended:

```text
bg-red-600
hover:bg-red-700
text-white
```

or destructive ghost:

```text
text-red-600
hover:bg-red-50
```

Use only for destructive operations.

---

# 22. Icon Buttons

Recommended touch target:

```text
h-9 w-9
```

or:

```text
h-10 w-10
```

Icon size:

```text
16–20px
```

Do not create tiny clickable icons.

---

# 23. Inputs

Recommended:

```text
h-10
w-full
rounded-lg
border
px-3
text-sm
```

Light mode:

```text
bg-white
border-slate-300
text-slate-900
```

Dark mode:

```text
bg-slate-900
border-slate-700
text-slate-100
```

Focus:

```text
focus:border-blue-500
focus:ring-2
focus:ring-blue-500/20
```

---

# 24. Textareas

Same visual language as inputs.

Minimum recommended height:

```text
min-h-24
```

Avoid uncontrolled auto-growing areas that destroy page layout.

---

# 25. Select Controls

Select elements should visually match text inputs.

Do not design completely different select components unless required.

---

# 26. Search Input

Recommended structure:

```text
Search icon
+
Input
+
Optional clear action
```

Search should usually be:

```text
h-10
```

Do not create oversized search bars unless search is the dominant page action.

---

# 27. Cards

Recommended card:

```text
bg-white
dark:bg-slate-900
border
border-slate-200
dark:border-slate-700
rounded-xl
```

Usually:

```text
shadow-none
```

Padding:

```text
p-4
p-5
p-6
```

depending on complexity.

---

# 28. Card Restrictions

Avoid:

```text
card
  └ card
      └ card
```

Try to keep nesting depth low.

If many cards are needed, reconsider information architecture.

---

# 29. Tables

Recommended table structure:

```text
Table container
├── Header
└── Rows
```

Table container:

```text
border
rounded-xl
overflow-hidden
```

Header:

```text
bg-slate-50
dark:bg-slate-800/60
```

Rows should usually:

```text
border-t
hover:bg-slate-50
dark:hover:bg-slate-800/50
```

---

# 30. Table Row Height

Typical operational row:

```text
48–60px
```

Do not make every row 80–100px unless content requires it.

---

# 31. Table Headers

Use:

```text
text-xs
font-medium
text-slate-500
```

Avoid overly bold table headers.

---

# 32. Selected Row

Selected state:

```text
bg-blue-50
dark:bg-blue-500/10
```

Optional left indicator may be used.

Do not use very saturated selected backgrounds.

---

# 33. Badges

Badges should be compact.

Recommended:

```text
inline-flex
items-center
h-6
px-2
rounded-md
text-xs
font-medium
```

Avoid making all metadata into badges.

---

# 34. Status Badge Examples

Success:

```text
bg-green-50
text-green-700

dark:
bg-green-500/10
text-green-300
```

Warning:

```text
bg-amber-50
text-amber-700
```

Error:

```text
bg-red-50
text-red-700
```

Information:

```text
bg-blue-50
text-blue-700
```

Neutral:

```text
bg-slate-100
text-slate-600
```

---

# 35. Tabs

Recommended:

```text
border-bottom navigation
```

rather than giant pill tabs.

Example:

```text
概要   案件   書類   履歴   メモ
────
```

Active tab:

```text
text-blue-600
border-blue-600
```

---

# 36. Segmented Controls

Use pill-style segmented controls only for compact view switching.

Examples:

```text
一覧 | カード
日 | 週 | 月
```

Do not use pill navigation for every section.

---

# 37. Dropdown Menus

Dropdown:

```text
rounded-lg
border
shadow-lg
p-1
```

Items:

```text
h-9
px-3
rounded-md
text-sm
```

Destructive menu actions should use red text.

---

# 38. Modal Layout

Recommended modal:

```text
Header
Content
Footer
```

Typical widths:

Small:

```text
max-w-md
```

Medium:

```text
max-w-lg
```

Large:

```text
max-w-2xl
```

Avoid full-screen desktop modal unless necessary.

---

# 39. Modal Overlay

Recommended:

```text
bg-black/40
```

or appropriate equivalent.

Avoid excessive blur.

---

# 40. Drawer

Desktop width:

```text
400–560px
```

depending on content.

Mobile:

```text
w-full
```

Drawer should slide from side naturally.

---

# 41. Empty State

Use minimal iconography.

Recommended:

```text
small icon
title
description
optional action
```

Do not create huge illustrations.

---

# 42. Loading States

Prefer skeletons for structured content.

Spinner appropriate for small operations.

Avoid blocking entire application unnecessarily.

---

# 43. Toast Notifications

Use toast for:

- successful saves
- lightweight confirmation
- API operation results

Do not use toast for information requiring explicit decisions.

---

# 44. Alerts

Use inline alert for persistent important information.

Alert types:

```text
info
success
warning
error
```

Keep alerts compact.

---

# 45. Sidebar

Sidebar should remain visually stable.

Preferred characteristics:

- dark neutral or subtle surface
- strong active item
- consistent icon size
- compact navigation spacing

Do not redesign sidebar differently for every page.

---

# 46. Sidebar Navigation Item

Typical:

```text
h-10
px-3
rounded-lg
gap-3
```

Icon:

```text
18–20px
```

Active item:

```text
clear background
clear foreground
```

Inactive items should remain readable.

---

# 47. Header / Topbar

Global header should not compete visually with page content.

Recommended height:

```text
56–64px
```

Use for:

- menu toggle
- office context
- notifications
- user profile
- theme control

---

# 48. Notification Indicator

Use subtle badges.

Avoid flashing or aggressive animation.

Unread notification example:

```text
small red indicator
```

with accessible label.

---

# 49. Avatars

Recommended sizes:

Small:

```text
32px
```

Medium:

```text
40px
```

Large profile:

```text
64px
```

Use consistent shape.

---

# 50. Employee Status

Possible statuses:

```text
勤務中
休憩中
外出
退勤
```

Status indicator should combine:

- color
- label

Do not rely only on avatar placement.

---

# 51. Timeline

Recommended layout:

```text
● ─ Event
│
● ─ Event
│
● ─ Event
```

Keep line and indicators subtle.

Timeline entries should prioritize:

```text
action
actor
time
details
```

---

# 52. Document Lists

Documents should visually communicate:

- file name
- type
- status
- updated date
- responsible person
- actions

Avoid huge file cards.

Prefer compact rows.

---

# 53. Approval Items

Approval UI should prominently show:

```text
request title
requester
reason
date/time
related matter
approve
reject
```

Important decisions should not be hidden.

---

# 54. AI Chat

AI社員 chat should remain professional.

Message bubbles may use moderate radius.

Avoid:

- glowing AI gradients
- neon effects
- giant AI logos
- animated backgrounds

AI interface belongs to the same product.

---

# 55. Responsive Breakpoints

Follow Tailwind breakpoints unless existing project conventions differ.

General:

```text
sm
md
lg
xl
2xl
```

Design desktop and mobile intentionally.

---

# 56. Mobile Rules

Mobile should use:

- single column
- stacked controls
- drawers
- detail navigation
- compact headers

Avoid:

- tiny desktop tables
- multiple squeezed columns
- overflowing fixed widths

---

# 57. Touch Targets

Preferred minimum:

```text
40px
```

for important controls.

---

# 58. Light Mode

Light mode must not look washed out.

Use:

- white surfaces
- subtle gray background
- clear borders
- dark primary text

---

# 59. Dark Mode

Dark mode should use layered neutral surfaces.

Avoid pure:

```text
#000000
```

for all surfaces.

Create hierarchy using:

```text
slate-950
slate-900
slate-800
```

---

# 60. Focus Styles

All keyboard-focusable controls need visible focus state.

Recommended:

```text
focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-blue-500
focus-visible:ring-offset-2
```

Adapt ring offset for dark mode.

---

# 61. Transitions

Recommended:

```text
transition-colors
duration-150
```

or:

```text
duration-200
```

Avoid slow animations.

---

# 62. Hover Effects

Preferred:

```text
color change
background change
border change
```

Avoid:

```text
scale-105
translate-y
large shadow growth
```

for routine operational controls.

---

# 63. Icon Usage

Use lucide-react.

Standard icon size:

```text
16px
18px
20px
```

Larger icons only when semantically required.

---

# 64. Icon Stroke

Keep default Lucide stroke unless specific hierarchy requires otherwise.

Do not mix multiple visual icon styles.

---

# 65. Data Visualization

Charts should only be used when they help understand data.

Do not add charts just to make a dashboard appear sophisticated.

Every chart must answer a real operational question.

---

# 66. Dashboard Statistics

Statistics are allowed when genuinely useful.

Examples:

```text
案件数
期限超過
承認待ち
本日の勤務人数
```

Do not automatically create exactly four statistic cards.

Layout should respond to actual data.

---

# 67. Japanese Business UI Density

Operational Japanese software often benefits from compact presentation.

THEMIS should favor:

```text
more useful information
less decorative whitespace
```

while maintaining readability.

---

# 68. Anti-AI Design Checklist

Before finishing a page, check:

- Did we create unnecessary statistic cards?
- Did we add gradients?
- Did we use too many rounded cards?
- Did we put icons everywhere?
- Did we create too much empty space?
- Did we create fake analytics?
- Did we use excessive badges?
- Does this look like a generic template?

If yes:

simplify.

---

# 69. Tailwind Class Consistency

Prefer recurring patterns.

Do not create entirely different class combinations for visually identical controls.

Shared patterns should eventually become reusable components.

---

# 70. Visual Consistency Rule

When two things perform the same role:

> They should look the same.

Examples:

All primary buttons should share visual language.

All inputs should share visual language.

All modals should share visual language.

All status badges should share visual language.

---

# 71. Visual Hierarchy

A user should understand within approximately 3 seconds:

1. what page they are on
2. what the important information is
3. what action they can take

If everything has equal emphasis, hierarchy has failed.

---

# 72. Page Quality Target

Frontend screens should aim for:

```text
Visual hierarchy: 9/10+
Typography: 9/10+
Spacing: 9/10+
Consistency: 9/10+
Usability: 9/10+
Professionalism: 9/10+
Responsive UX: 9/10+
Originality: 8.5/10+
```

Originality does NOT mean decorative complexity.

It means the UI feels deliberately designed for THEMIS.

---

# 73. Final Design Rule

When uncertain, choose:

```text
simple
structured
precise
professional
compact
consistent
```

instead of:

```text
decorative
flashy
experimental
generic AI
```

---

# Final Principle

THEMIS should feel like:

> professional software built specifically for a modern legal office.

Not:

> a dashboard generated from an AI design prompt.

---

## Approved Reference UI

Primary reference page:

```text
在留申請進捗管理 (/visa-progress)
```

Use this page as the visual reference for future THEMIS work involving:

- page headers and action hierarchy
- spacing rhythm and restrained surfaces
- borders, buttons, inputs, and filters
- semantic status and deadline treatment
- compact operational tables
- responsive desktop/mobile transformation
- light and dark mode layering

Reuse its visual language, not its exact page structure. Each feature must still follow its own operational workflow.
