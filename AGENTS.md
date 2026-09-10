THEMIS / EmployeeManagement Agent Instructions

Instructions for AI coding agents working in this repository.

These rules apply to the entire repository unless a more specific instruction file exists inside a subdirectory.

1. Repository Overview

Main application:

EmployeeManagement/

Technology:

Frontend:

React
TypeScript
Vite
Tailwind CSS
lucide-react
Axios
React Router

Backend:

Laravel
PHP
REST API
Laravel Sanctum
MySQL

2. Documentation Source of Truth

Repository documentation is stored in:

docs/

Agents must read documentation relevant to the requested task.

3. Architecture Documentation

For architecture-related work read:

docs/ARCHITECTURE.md

4. API Documentation

For frontend/backend API work read:

docs/API.md

5. Database Documentation

For:

database

models

migrations

relationships

foreign keys

read:

docs/DATA_MODEL.md

6. Frontend Documentation

Before significant frontend/UI work read:

docs/frontend/FRONTEND_GUIDE.md
docs/frontend/DESIGN_SYSTEM.md
docs/frontend/COMPONENT_RULES.md

These documents are the source of truth for frontend implementation.

Mandatory THEMIS Command Rule

For every frontend/UI task, agents must treat THEMIS Command as the canonical visual language.

Before significant UI work:

read docs/frontend/DESIGN_SYSTEM.md

read docs/frontend/COMPONENT_RULES.md

inspect only the requested screen/components

reuse existing theme tokens and shared components before creating new variants

THEMIS Command means:

Japanese legal-office operations command center
Dark navy foundation
Calm
Precise
Professional
Moderately dense
Information-first
Restrained indigo workflow accent
Solid operational data surfaces

Agents must NOT invent a page-specific visual style.

Do not introduce:

generic SaaS styling

gaming / cyberpunk command-center styling

fintech-terminal theatrics

glassmorphism-heavy layouts

random accent colors

strong glow

decorative gradients

card-inside-card layouts

oversized whitespace

Color meaning must remain consistent:

Blue / indigo = workflow / active / selected
Green = completed / confirmed
Amber = warning / deadline / preservation priority
Red = overdue / error / rejected / destructive
Violet = AI-specific emphasis only
Gray / slate = neutral / inactive / supporting information

Hallmark is quality control only.

Hallmark may identify anti-patterns, hierarchy problems, spacing problems, or visual slop, but it must not replace THEMIS Command with a different design concept.

When Hallmark or another model conflicts with DESIGN_SYSTEM.md:

DESIGN_SYSTEM.md wins.

Preserve existing information architecture and business workflow unless the user explicitly requests structural redesign.

Avoid global CSS/theme changes for page-specific problems. If a requested change truly belongs to the global design system, modify the design system intentionally and verify affected shared components.

If approved screenshot references exist in docs/frontend/references/, use them as visual references.

7. AI Feature Documentation

Before modifying the AI employee system read:

docs/ai/AI_PROGRESS.md

when the file exists.

8. Do Not Read Everything Automatically

Do NOT automatically scan the entire repository for every small task.

Read only:

relevant documentation

requested file

directly related components

directly related backend/API files when needed

Expand scope only when necessary.

This reduces:

token usage

accidental modifications

unnecessary analysis

9. Inspect Before Editing

Before modifying code:

inspect target file

inspect relevant imports

inspect related components

inspect relevant API calls

understand existing behavior

Do not immediately rewrite files.

10. Scope Control

Only modify files necessary for the task.

Do NOT make unrelated changes.

If asked to change:

BusinessQuest

do not redesign:

EmployeeRoom
Sidebar
OrganizationDesign
AI
Approvals

unless required.

11. Preserve Existing Functionality

UI changes are NOT permission to remove functionality.

Before changing existing UI identify:

current actions

current API calls

current state

existing responsive behavior

existing dark mode behavior

Preserve them unless change is explicitly required.

12. Frontend Design Rule

THEMIS uses the mandatory THEMIS Command visual language defined in:

docs/frontend/DESIGN_SYSTEM.md

THEMIS is professional internal legal-office operations software.

Do NOT produce generic AI-generated SaaS designs or independently invent another command-center style.

Avoid:

excessive cards

excessive rounded corners

gradients

glassmorphism-heavy layouts

gaming/cyberpunk glow

fintech terminal aesthetics

fake statistics

huge welcome sections

decorative icons

excessive empty space

excessive badges

random animations

page-specific accent palettes

Use existing shared tokens/components first. Color must communicate business meaning rather than decoration.

13. Frontend Workflow

For significant UI modifications:

Step 1:

Read relevant frontend documentation.

Step 2:

Inspect current implementation.

Step 3:

Understand user workflow.

Step 4:

Identify reusable components.

Step 5:

Plan changes.

Step 6:

Implement the smallest coherent change.

Step 7:

Verify responsiveness.

Step 8:

Verify light/dark mode.

Step 9:

Run build.

Step 10:

Summarize changes.

14. Frontend Stack

Do not replace:

React
TypeScript
Vite
Tailwind
lucide-react
Axios

without explicit instruction.

15. New Dependencies

Do not install packages without strong justification.

Before installing:

check whether project already provides solution

check whether React/Tailwind can handle it

explain why dependency is needed

Do not install UI frameworks automatically.

16. Icon Library

Use:

lucide-react

Do not introduce another icon library for routine UI work.

17. Component Reuse

Before creating a component:

search for an existing implementation.

Prefer reuse over duplication.

Follow:

docs/frontend/COMPONENT_RULES.md

18. Large React Files

Avoid making already-large page files larger unnecessarily.

When adding significant functionality:

consider extracting meaningful domain components.

Do not split components purely for line count.

19. Backend Rules

For Laravel tasks:

inspect:

routes
controllers
models
requests
services
migrations

relevant to the feature.

Do not modify unrelated backend modules.

20. API Compatibility

Do not silently change API contracts.

If changing:

request field
response field
route
HTTP method
status code

identify all consumers first.

21. Database Safety

Do not:

delete tables

drop columns

reset production data

recreate database

run destructive migrations

unless explicitly requested.

22. Migration Rule

Database schema changes should normally use Laravel migrations.

Do not manually alter production database structure outside migration workflow unless explicitly required.

23. Data Preservation

Never assume existing data can be discarded.

Treat current data as important.

24. Laravel Models

When modifying models verify:

fillable/guarded

casts

relationships

table name if non-standard

Do not mass-assign sensitive fields accidentally.

25. Authentication

Current authentication uses Laravel Sanctum.

Do not replace authentication architecture during unrelated tasks.

Before modifying auth inspect existing:

login
logout
me
Sanctum
Axios credential configuration

26. Security

Do not expose:

secrets

API keys

passwords

tokens

private credentials

Do not commit .env.

27. Environment Variables

When introducing environment variables:

update:

.env.example

when appropriate.

Do not write real secrets into documentation.

28. AI Provider Secrets

Never hardcode:

ANTHROPIC_API_KEY
OPENAI_API_KEY

or other provider secrets.

Use environment variables.

29. AI Employee Feature

The AI employee system has its own architecture.

Before major modifications inspect:

docs/ai/AI_PROGRESS.md

and directly relevant code.

Do not rewrite the AI system without understanding:

persona

skills

tool registry

orchestrator

tool execution

chat API

30. Fake AI Mode

If the existing application supports fake/demo AI mode, preserve it unless explicitly instructed otherwise.

Do not force external AI API usage when fake mode is intentionally enabled.

31. Attendance Feature

Attendance-related work must preserve existing business states.

Possible concepts include:

勤務中
休憩中
外出
退勤

Inspect actual backend values before modifying.

Do not guess database status strings.

32. Task Management

Task-related changes should verify:

employee

task

duration/deadline

acceptance state

notifications

manager actions

Do not redesign data structures simply for frontend convenience.

33. BusinessQuest

For client/case management work consider:

client
matter
case type
responsible employee/lawyer
documents
communication history
status
memo
next action

UI should prioritize operational workflow.

34. Approval System

Approval changes should preserve:

pending
approved
rejected

or actual current backend values.

Inspect existing implementation first.

35. Responsive Requirements

Frontend UI should be verified at approximately:

1440px
1024px
768px
390px

Avoid unintended horizontal overflow.

36. Light and Dark Mode

New UI must support both when the application currently supports both.

Do not hardcode colors that only work in one theme.

37. Testing

After frontend work run appropriate existing tests.

At minimum for meaningful frontend changes:

npm run build

if available.

38. Laravel Testing

For backend changes run relevant Laravel tests when available.

Examples:

php artisan test

or targeted tests.

Do not unnecessarily run huge suites repeatedly if a targeted test is sufficient.

39. Build Failures

Do not ignore build or TypeScript errors introduced by your change.

Fix them before completion.

40. Existing Failures

If the repository already contains unrelated failures:

do not silently rewrite unrelated code.

Report them separately.

41. Git Safety

Do not:

git reset --hard
git clean -fd
force push
delete branches
rewrite history

unless explicitly requested.

42. File Deletion

Do not delete files simply because they appear unused.

Verify references first.

43. Refactoring

Do not combine large unrelated refactoring with feature work.

Prefer:

feature change

- minimal necessary refactor

44. Comments

Comments should explain:

why
business rule
non-obvious behavior

not obvious syntax.

45. Naming

Use clear domain names.

Good:

ApprovalRequest
ClientMatter
AttendanceStatus

Avoid:

DataThing
NewComponent
TempItem
Test2

46. Temporary Files

Do not leave temporary files such as:

test123
new-copy
backup2
final-final

inside source directories.

47. Generated Output

Generated reports, screenshots or temporary files should not be mixed into production source directories unless intentionally part of the project.

48. Documentation Updates

If behavior or architecture changes significantly:

update relevant documentation.

Examples:

API changed:

docs/API.md

Database changed:

docs/DATA_MODEL.md

Frontend rules changed:

docs/frontend/

AI architecture changed:

docs/ai/AI_PROGRESS.md

49. Documentation Must Match Code

Do not update documentation with speculative behavior.

Documentation should reflect implemented architecture or clearly mark proposed work.

50. Avoid Over-Engineering

Use the simplest implementation that fits:

current architecture

expected scale

business requirements

Do not introduce complex abstractions without need.

51. Avoid AI-Generated Boilerplate

Do not create unnecessary:

service layers

repositories

factories

adapters

generic hooks

generic components

unless they solve an actual problem.

52. User Workflow First

For UI work, ask internally:

What is the employee trying to accomplish?

before asking:

What components should be placed here?

53. Significant Redesign Tasks

Before implementing a major redesign, provide or internally establish:

current problems
user workflow
information hierarchy
proposed layout
files to modify

Then implement.

Do not blindly start with JSX.

54. Visual Consistency

New pages must look like part of THEMIS Command.

Do not independently invent:

colors

radius

shadows

typography

buttons

forms

surface styles

status palettes

navigation patterns

Use the design system and shared theme tokens.

If a page-specific requirement conflicts with the current design system, implement the user-requested behavior while keeping the closest compatible THEMIS Command visual treatment. Do not create a second design language.

55. Avoid Unnecessary Re-Reading

Once relevant architecture has been inspected for the current task, avoid repeatedly reopening the same large files unless necessary.

This repository values efficient context usage.

56. Search Strategically

When locating functionality:

search by:

route name
component name
API endpoint
model name
database field

instead of scanning every file.

57. Before Creating New Code

Search for:

existing similar function

existing component

existing helper

existing API method

Avoid duplication.

58. Output Summary

After completing code changes summarize:

What changed
Files changed
Important behavior
Tests/build performed
Remaining limitations

Keep summaries concise.

59. Do Not Claim Tests Passed Unless Run

Never say:

all tests pass

unless tests were actually executed.

60. Do Not Claim UI Is Pixel Perfect Without Verification

If no screenshot/browser verification occurred, do not claim visual perfection.

State what was verified.

61. Priority Order

When requirements conflict, prioritize:

1. User instruction
2. Data safety
3. Existing functionality
4. Project architecture
5. Documentation
6. Maintainability
7. Visual polish

8. Final Repository Principle

THEMIS is a growing production application.

AI agents should improve the system incrementally.

Do not behave like generating a demo from scratch.

Preserve what works.

Understand before modifying.

Modify only what is needed.

Verify before completing.
