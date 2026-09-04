THEMIS Design System

Visual design source of truth for the THEMIS Employee Management system.

All frontend developers and AI coding agents must follow this document when creating or modifying UI.

0. Canonical Visual Language — THEMIS Command

THEMIS Command is the mandatory visual language for the application.

It is a Dark Navy Command Center for Japanese legal-office operations — not a military UI, gaming dashboard, fintech terminal, or generic SaaS admin template.

Core character:

dark navy foundation

calm and precise hierarchy

professional Japanese legal-office tone

information-first and moderately dense

solid operational surfaces for data-heavy work

restrained indigo accent for navigation and workflow

semantic colors used only when they communicate state

minimal shadow, minimal glow, minimal decoration

Primary rule:

Operational clarity first. Visual drama never wins over readability.

0.1 Canonical Color Tokens

These tokens are the visual source of truth. Prefer shared CSS/Tailwind theme variables rather than arbitrary page-level colors.

--tm-bg: #0B1220
--tm-surface: #111B2E
--tm-surface-elevated: #162238
--tm-border: #26344D

--tm-text: #F3F6FC
--tm-text-secondary: #CBD5E1
--tm-text-muted: #94A3B8

--tm-primary: #5B6CFF
--tm-primary-hover: #7080FF

--tm-success: #3F9B76
--tm-warning: #C58A32
--tm-danger: #C75B64
--tm-ai: #8668E8

Light mode equivalents may use the existing neutral light palette, but the same semantic hierarchy and component language must remain.

0.2 Color Meaning

Color is functional, not decorative.

Indigo / blue = workflow, active navigation, selected state, primary action
Emerald = completed, confirmed, success
Amber = warning, deadline attention, preservation priority
Red = overdue, error, rejected, destructive
Violet = AI-specific emphasis only
Slate / gray = neutral, inactive, unnecessary, supporting information

Do not introduce a new accent color for an individual page.

0.3 Surface Strategy

Use solid dark surfaces for:

tables

document lists

case workspaces

forms

dense operational panels

employee/task/approval data

Subtle translucency may be used sparingly for:

modal overlays

dropdowns/popovers

floating AI surfaces

Do not build the main application out of glassmorphism. Do not stack translucent panels.

0.4 Visual Density

THEMIS Command is moderately dense.

Prefer:

compact 40–44px controls

48–60px operational rows

restrained section spacing

clear typography hierarchy

subtle separators instead of nested cards

Avoid increasing whitespace just to make a page look “premium”.

0.5 Interaction Language

Routine interactions should use:

background/color/border changes

120–180ms transitions

visible focus states

clear selected states

Avoid:

scaling cards

bounce animations

large glow effects

animated gradients

0.6 AI Visual Exception

AI may use restrained violet (--tm-ai) as a secondary identity cue.

Violet must not leak into ordinary workflow pages as a decorative accent.

0.7 Model / Agent Rule

When an AI coding agent, Hallmark, or another design tool proposes a style that conflicts with THEMIS Command:

THEMIS Command wins.

Hallmark is a quality-control / anti-slop tool, not a replacement design system.

1. Design Philosophy

THEMIS is professional internal software used in a legal-office environment.

The interface should feel:

calm

precise

reliable

mature

premium

efficient

professional

THEMIS is NOT:

a marketing website

a startup landing page

a generic SaaS dashboard

an AI template

a gaming interface

Primary principle:

Information first. Decoration second.

2. Visual Character

The interface should resemble a modern Japanese legal-office operations command center.

Preferred characteristics:

dark navy operational foundation

structured layouts

subtle cool borders

restrained indigo accent

moderate-to-high information density

compact controls

strong visual hierarchy

clear status semantics

minimal visual noise

professional, quiet, deliberate surfaces

Avoid:

excessive gradients

neon or gaming-style glow

glassmorphism-heavy layouts

floating decorative elements

giant cards

excessive rounded corners

excessive shadows

decorative illustrations without purpose

fintech-terminal theatrics

generic AI/SaaS dashboard styling

3. Design Tokens

Use consistent design tokens instead of arbitrary values.

Recommended spacing scale:

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

Recommended Tailwind equivalents:

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

Avoid random spacing such as:

17px
23px
37px

unless absolutely required.

4. Application Background

Dark mode is the primary visual reference for THEMIS Command.

Dark mode:

Main background:
#0B1220

Primary surface:
#111B2E

Elevated / secondary surface:
#162238

Primary border:
#26344D

Light mode remains supported:

Main background:
slate-50 / #F5F7FB

Primary surface:
white

Secondary surface:
slate-50 / #F8FAFC

Border:
slate-200

Rules:

avoid pure black backgrounds

do not create large brightness jumps between adjacent surfaces

data-heavy content should use solid surfaces

use surface layering, typography, and separators before adding shadows

page-specific background colors are not allowed unless explicitly added to this design system

5. Primary Color

THEMIS primary accent is a restrained indigo-blue.

Canonical token:

Primary:
#5B6CFF

Primary hover / stronger emphasis:
#7080FF

Use primary color mainly for:

selected state

primary action

links

active navigation

keyboard focus

workflow emphasis

Do not use primary blue on every label, icon, border, or card.

Do not introduce unrelated page-specific purple/teal/cyan accents.

6. Semantic Colors

Semantic colors must communicate business meaning.

Success

Use restrained emerald.

#3F9B76

Examples:

勤務中
完了
承認済み
確認済み

Warning

Use restrained amber.

#C58A32

Examples:

保留
確認待ち
期限注意
保全優先

Error / Destructive

Use restrained red.

#C75B64

Examples:

削除
却下
期限超過
エラー
差戻し

Information / Workflow

Use THEMIS indigo-blue.

#5B6CFF

Examples:

審査中
情報
選択中
必要

AI

Use restrained violet only for AI-specific identity or actions.

#8668E8

Do not use violet as a normal workflow accent.

Neutral

Use slate / cool gray.

Examples:

未設定
無効
補助情報
不要

7. Text Colors

Light mode:

Primary text:
slate-900

Secondary text:
slate-600

Muted text:
slate-500

Disabled text:
slate-400

Dark mode:

Primary text:
slate-100

Secondary text:
slate-300

Muted text:
slate-400

Disabled text:
slate-500

Do not use low-contrast gray text for important information.

8. Typography Hierarchy

Page Title

Recommended:

text-2xl
md:text-3xl
font-semibold
tracking-tight

Approximate:

28–32px

Do not use giant 40–64px dashboard titles.

Page Description

text-sm
text-slate-500

Maximum approximately:

14–15px

Section Heading

text-lg
font-semibold

Approximately:

18–20px

Component Heading

text-sm
font-semibold

or

text-base
font-medium

depending on hierarchy.

Body Text

Default:

text-sm

Approximately:

14px

Metadata

Recommended:

text-xs
text-slate-500

Approximately:

12–13px

9. Font Weight

Prefer:

font-normal
font-medium
font-semibold

Use:

font-bold

sparingly.

Excessive bold text creates visual noise.

10. Line Height

Body content should remain readable.

Typical:

leading-5
leading-6

Japanese text should not feel vertically cramped.

11. Border Radius

THEMIS should not have a bubble-like interface.

Recommended:

Small controls

rounded-md

Approximately:

6px

Inputs

rounded-lg

Approximately:

8px

Panels

rounded-lg

or maximum:

rounded-xl

Modals

rounded-xl

Avoid defaulting to:

rounded-2xl
rounded-3xl

12. Borders

Borders are preferred over strong shadows.

Light mode:

border-slate-200

Dark mode:

border-slate-700

Common example:

border border-slate-200
dark:border-slate-700

13. Shadows

Default surfaces:

shadow-none

Small elevated surfaces:

shadow-sm

Dropdown / popover:

shadow-lg

Modal:

shadow-xl

Avoid heavy shadows around every card.

14. Page Layout

Recommended page shell:

Sidebar

- Main content

Main content should use:

min-w-0
flex-1

to prevent overflow.

Desktop padding:

p-6
xl:p-8

Tablet:

p-5

Mobile:

p-4

15. Maximum Width

Operational pages usually should use available space.

Do NOT automatically use:

max-w-4xl

for data-heavy pages.

Appropriate examples:

max-w-screen-2xl

or:

w-full

Forms may use narrower widths when appropriate.

16. Page Header

Preferred:

Title
Optional description
Right-side actions

Example structure:

┌───────────────────────────────────────────────┐
│ 業務クエスト ＋案件を追加 │
│ 顧客・案件・書類を管理します │
└───────────────────────────────────────────────┘

Avoid huge welcome sections.

17. Toolbar

Toolbar may contain:

search

filters

view options

primary action

sorting

Recommended height:

40–48px controls

Do not make toolbars unnecessarily tall.

18. Primary Buttons

Recommended:

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

Avoid:

huge padding
huge rounded radius
strong shadow
gradient background

19. Secondary Buttons

Recommended:

border
bg-white
text-slate-700

dark:
bg-slate-900
text-slate-200
border-slate-700

20. Ghost Buttons

Use for lower-priority actions.

Example:

hover:bg-slate-100
dark:hover:bg-slate-800

21. Destructive Buttons

Recommended:

bg-red-600
hover:bg-red-700
text-white

or destructive ghost:

text-red-600
hover:bg-red-50

Use only for destructive operations.

22. Icon Buttons

Recommended touch target:

h-9 w-9

or:

h-10 w-10

Icon size:

16–20px

Do not create tiny clickable icons.

23. Inputs

Recommended:

h-10
w-full
rounded-lg
border
px-3
text-sm

Light mode:

bg-white
border-slate-300
text-slate-900

Dark mode:

bg-slate-900
border-slate-700
text-slate-100

Focus:

focus:border-blue-500
focus:ring-2
focus:ring-blue-500/20

24. Textareas

Same visual language as inputs.

Minimum recommended height:

min-h-24

Avoid uncontrolled auto-growing areas that destroy page layout.

25. Select Controls

Select elements should visually match text inputs.

Do not design completely different select components unless required.

26. Search Input

Recommended structure:

Search icon

- Input
- Optional clear action

Search should usually be:

h-10

Do not create oversized search bars unless search is the dominant page action.

27. Cards

Recommended card:

bg-white
dark:bg-slate-900
border
border-slate-200
dark:border-slate-700
rounded-xl

Usually:

shadow-none

Padding:

p-4
p-5
p-6

depending on complexity.

28. Card Restrictions

Avoid:

card
└ card
└ card

Try to keep nesting depth low.

If many cards are needed, reconsider information architecture.

29. Tables

Recommended table structure:

Table container
├── Header
└── Rows

Table container:

border
rounded-xl
overflow-hidden

Header:

bg-slate-50
dark:bg-slate-800/60

Rows should usually:

border-t
hover:bg-slate-50
dark:hover:bg-slate-800/50

30. Table Row Height

Typical operational row:

48–60px

Do not make every row 80–100px unless content requires it.

31. Table Headers

Use:

text-xs
font-medium
text-slate-500

Avoid overly bold table headers.

32. Selected Row

Selected state:

bg-blue-50
dark:bg-blue-500/10

Optional left indicator may be used.

Do not use very saturated selected backgrounds.

33. Badges

Badges should be compact.

Recommended:

inline-flex
items-center
h-6
px-2
rounded-md
text-xs
font-medium

Avoid making all metadata into badges.

34. Status Badge Examples

Success:

bg-green-50
text-green-700

dark:
bg-green-500/10
text-green-300

Warning:

bg-amber-50
text-amber-700

Error:

bg-red-50
text-red-700

Information:

bg-blue-50
text-blue-700

Neutral:

bg-slate-100
text-slate-600

35. Tabs

Recommended:

border-bottom navigation

rather than giant pill tabs.

Example:

概要 案件 書類 履歴 メモ
────

Active tab:

text-blue-600
border-blue-600

36. Segmented Controls

Use pill-style segmented controls only for compact view switching.

Examples:

一覧 | カード
日 | 週 | 月

Do not use pill navigation for every section.

37. Dropdown Menus

Dropdown:

rounded-lg
border
shadow-lg
p-1

Items:

h-9
px-3
rounded-md
text-sm

Destructive menu actions should use red text.

38. Modal Layout

Recommended modal:

Header
Content
Footer

Typical widths:

Small:

max-w-md

Medium:

max-w-lg

Large:

max-w-2xl

Avoid full-screen desktop modal unless necessary.

39. Modal Overlay

Recommended:

bg-black/40

or appropriate equivalent.

Avoid excessive blur.

40. Drawer

Desktop width:

400–560px

depending on content.

Mobile:

w-full

Drawer should slide from side naturally.

41. Empty State

Use minimal iconography.

Recommended:

small icon
title
description
optional action

Do not create huge illustrations.

42. Loading States

Prefer skeletons for structured content.

Spinner appropriate for small operations.

Avoid blocking entire application unnecessarily.

43. Toast Notifications

Use toast for:

successful saves

lightweight confirmation

API operation results

Do not use toast for information requiring explicit decisions.

44. Alerts

Use inline alert for persistent important information.

Alert types:

info
success
warning
error

Keep alerts compact.

45. Sidebar

Sidebar is a stable THEMIS Command surface and must remain visually consistent across the application.

Preferred characteristics:

dark navy / deep neutral surface

compact navigation spacing

consistent Lucide icon sizing

active item uses restrained indigo surface or left accent

active text/icon becomes clearer, not neon

inactive items remain readable

Avoid:

strong glow

gradient navigation items

page-specific sidebar themes

oversized active pills

Do not redesign sidebar differently for every page.

46. Sidebar Navigation Item

Typical:

h-10
px-3
rounded-lg
gap-3

Icon:

18–20px

Active item:

clear background
clear foreground

Inactive items should remain readable.

47. Header / Topbar

Global header should not compete visually with page content.

Recommended height:

56–64px

Use for:

menu toggle

office context

notifications

user profile

theme control

48. Notification Indicator

Use subtle badges.

Avoid flashing or aggressive animation.

Unread notification example:

small red indicator

with accessible label.

49. Avatars

Recommended sizes:

Small:

32px

Medium:

40px

Large profile:

64px

Use consistent shape.

50. Employee Status

Possible statuses:

勤務中
休憩中
外出
退勤

Status indicator should combine:

color

label

Do not rely only on avatar placement.

51. Timeline

Recommended layout:

● ─ Event
│
● ─ Event
│
● ─ Event

Keep line and indicators subtle.

Timeline entries should prioritize:

action
actor
time
details

52. Document Lists

Documents should visually communicate:

file name

type

status

updated date

responsible person

actions

Avoid huge file cards.

Prefer compact rows.

53. Approval Items

Approval UI should prominently show:

request title
requester
reason
date/time
related matter
approve
reject

Important decisions should not be hidden.

54. AI Chat

AI社員 chat should remain professional and clearly part of THEMIS Command.

Message bubbles may use moderate radius.

AI may use restrained violet (#8668E8) as a secondary identity cue, but the base surface remains dark navy / neutral.

Avoid:

glowing AI gradients

neon effects

giant AI logos

animated backgrounds

making AI look like a separate consumer product

AI interface belongs to the same product.

55. Responsive Breakpoints

Follow Tailwind breakpoints unless existing project conventions differ.

General:

sm
md
lg
xl
2xl

Design desktop and mobile intentionally.

56. Mobile Rules

Mobile should use:

single column

stacked controls

drawers

detail navigation

compact headers

Avoid:

tiny desktop tables

multiple squeezed columns

overflowing fixed widths

57. Touch Targets

Preferred minimum:

40px

for important controls.

58. Light Mode

Light mode must not look washed out.

Use:

white surfaces

subtle gray background

clear borders

dark primary text

59. Dark Mode

Dark mode is the primary visual expression of THEMIS Command.

Use canonical layers:

Page background: #0B1220
Primary surface: #111B2E
Elevated surface: #162238
Border: #26344D
Primary text: #F3F6FC
Secondary text: #CBD5E1
Muted text: #94A3B8
Primary accent: #5B6CFF

Avoid pure black (#000000) as the application foundation.

Do not invent new dark-surface hex values per page. Reuse shared theme tokens.

60. Focus Styles

All keyboard-focusable controls need visible focus state.

Recommended:

focus-visible:outline-none
focus-visible:ring-2
focus-visible:ring-blue-500
focus-visible:ring-offset-2

Adapt ring offset for dark mode.

61. Transitions

Recommended:

transition-colors
duration-150

or:

duration-200

Avoid slow animations.

62. Hover Effects

Preferred:

color change
background change
border change

Avoid:

scale-105
translate-y
large shadow growth

for routine operational controls.

63. Icon Usage

Use lucide-react.

Standard icon size:

16px
18px
20px

Larger icons only when semantically required.

64. Icon Stroke

Keep default Lucide stroke unless specific hierarchy requires otherwise.

Do not mix multiple visual icon styles.

65. Data Visualization

Charts should only be used when they help understand data.

Do not add charts just to make a dashboard appear sophisticated.

Every chart must answer a real operational question.

66. Dashboard Statistics

Statistics are allowed when genuinely useful.

Examples:

案件数
期限超過
承認待ち
本日の勤務人数

Do not automatically create exactly four statistic cards.

Layout should respond to actual data.

67. Japanese Business UI Density

Operational Japanese software often benefits from compact presentation.

THEMIS should favor:

more useful information
less decorative whitespace

while maintaining readability.

68. Anti-AI Design Checklist

Before finishing a page, check:

Did we create unnecessary statistic cards?

Did we add gradients?

Did we use too many rounded cards?

Did we put icons everywhere?

Did we create too much empty space?

Did we create fake analytics?

Did we use excessive badges?

Does this look like a generic template?

Does this look like a gaming/fintech command center instead of legal-office software?

Did we add a new accent color not defined by THEMIS Command?

Did we turn dense operational data into decorative cards?

If yes:

simplify and return to the THEMIS Command tokens and hierarchy.

69. Tailwind Class Consistency

Prefer recurring patterns.

Do not create entirely different class combinations for visually identical controls.

Shared patterns should eventually become reusable components.

70. Visual Consistency Rule

THEMIS Command tokens and shared components must be reused before creating new page-specific variants.

When two things perform the same role:

They should look the same.

Examples:

All primary buttons should share visual language.

All inputs should share visual language.

All modals should share visual language.

All status badges should share visual language.

71. Visual Hierarchy

A user should understand within approximately 3 seconds:

what page they are on

what the important information is

what action they can take

If everything has equal emphasis, hierarchy has failed.

72. Page Quality Target

Frontend screens should aim for:

Visual hierarchy: 9/10+
Typography: 9/10+
Spacing: 9/10+
Consistency: 9/10+
Usability: 9/10+
Professionalism: 9/10+
Responsive UX: 9/10+
Originality: 8.5/10+

Originality does NOT mean decorative complexity.

It means the UI feels deliberately designed for THEMIS.

73. Final Design Rule

When uncertain, choose:

THEMIS Command
simple
structured
precise
professional
compact
consistent
operational

instead of:

decorative
flashy
experimental
generic AI
gaming UI
fintech terminal
page-specific visual styles

Final Principle

THEMIS should feel like:

professional software built specifically for a modern legal office.

Not:

a dashboard generated from an AI design prompt.

Approved Reference UI

Primary existing reference page:

在留申請進捗管理 (/visa-progress)

Use it as a reference for:

page headers and action hierarchy

spacing rhythm

compact operational tables

responsive desktop/mobile transformation

useful status/deadline treatment

However, THEMIS Command tokens defined in this document override older page-specific colors or surface choices when they conflict.

Optional approved screenshot references should be stored in:

docs/frontend/references/

Recommended names:

themis-command-shell.png
themis-command-case.png
themis-command-documents.png
themis-command-drawer.png
themis-command-ai.png

AI coding agents should use these screenshots as visual references when available, but must preserve each feature's operational workflow rather than copying page structure literally.
