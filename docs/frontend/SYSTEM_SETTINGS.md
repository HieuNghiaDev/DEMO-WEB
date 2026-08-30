# System Settings navigation

The global sidebar groups the six existing routes under Workspace and adds
Settings at `/system` under System. Its footer profile link opens the account
section. Password and logout actions now live in Settings, not the sidebar.

## Sections

- `/system` or `/system?section=account`: read-only information from `useAuth()`.
  Employee ID, email, roles and office appear only when present in the user data.
- `/system?section=security`: links to the existing password-change screen.
- `/system?section=appearance`: light/dark radio controls use the existing
  `ThemeContext.setTheme`. The sidebar toggle uses that same context.
- Logout sits below a divider at the bottom of the Settings navigation from
  1024px. Below that breakpoint it appears under Account operations at the end
  of Settings, never inside the horizontal category tabs. Both placements reuse
  `SettingsLogoutAction` and the same confirmation/state/handler. Confirming
  uses the existing `AuthContext.logout` and returns to `/login`.

`/system/password` renders the existing `ChangePassword` component inside the
existing protected-route boundary, outside `MainLayout`. This separate entry is
necessary because `/change-password` is reserved by `ProtectedRoute` for mandatory
password changes. The mandatory-change guard, authentication context, API calls
and password submission behavior are unchanged.

Password forms are not resumable post-login destinations: both `/change-password`
and `/system/password` resolve to `/` after ordinary sign-in. Accounts still
requiring a password change go directly to `/change-password`. Login and the
protected route share this rule in `src/utils/authNavigation.ts`, including old
login history entries created before the rule was introduced.

## Layout and accessibility

The desktop sidebar stays 288px wide. Below 768px it becomes a drawer with Escape
handling, keyboard focus containment and background scroll locking. Closed mobile
navigation is hidden from keyboard access.

The workspace pill and theme button are separate 38px controls, with an 8px gap
and no enclosing card. The workspace is a disabled indicator with a decorative
chevron: workspace switching is not implemented. The theme icon has no visible
inner ring; local styles preserve the shared icon and radial reveal animations.
The row never wraps and only the workspace label may truncate in a narrow drawer.

Settings categories use a left column from 1024px and compact links above the
content below that width. Query parameters preserve the selected category on
reload and support browser Back/Forward. The logout confirmation uses a native
modal dialog for focus containment and focus restoration.

## Theme motion

The shared `ThemeToggle` defaults to a 40px hit area and 28px inner shell.
The sidebar overrides these to a 38px rounded-square control and transparent
26px shell, with no press ring. Its dark icon combines a 16px Moon and a 6px
Sparkle; the light icon is a 16px Sun.
Icons crossfade with a short lead-in; hover brightens the tiny star. The visible
icon represents the current theme; the Japanese accessible label names the action.

`ThemeContext` retains the existing storage key, root `dark` class and pre-render
initialization. User-triggered changes pass the control as an optional origin.
Supported browsers reveal the new theme from its center over 580ms after a 60ms
micro pause (640ms total), using native View Transition snapshots. A gentler
initial easing makes the clean clip-path edge easier to follow, without adding
a fullscreen blur or halo layer. Settings theme options use their own control centers.
Without the API or an origin, color-bearing surfaces transition for 260ms.
Reduced motion bypasses the reveal and removes rotation/scale and the press ring. No fullscreen DOM
overlay or animation dependency is used.

The transition controller cancels superseded snapshots and prevents stale update
callbacks from overwriting newer choices. Unmount cleanup removes transient CSS
classes. The former 1.7-second sweep and glow styles have been removed.

Regression checks (Node 24):

```sh
node --test tests/themeTransition.test.mjs tests/authNavigation.test.mjs
```

The dev-only `/tests/fixtures/theme-preview.html` fixture exercises the real theme
provider and toggle without authentication or API data. It is not an application
route or production build entry. Use it for responsive, reload and motion QA;
full workspace visual verification still requires a signed-in session.

## Implementation files

- `EmployeeManagement/frontend/src/components/layout/Sidebar.tsx`
- `EmployeeManagement/frontend/src/pages/system/SystemSettings.tsx`
- `EmployeeManagement/frontend/src/components/settings/LogoutConfirmationDialog.tsx`
- `EmployeeManagement/frontend/src/App.tsx`

## Shared application footer

`AppFooter` is rendered once in `MainLayout`, after the flex-growing main area.
It is in normal document flow, only in the content column, never under the
sidebar. All routes using MainLayout inherit it; login and standalone password
screens remain outside that layout. Desktop height is about 48px; mobile text
wraps rather than overflowing. Settings no longer forces its own viewport height.

`src/config/app.ts` owns release metadata. The current demo defaults to
`Demo v1.0.0`; `VITE_APP_VERSION` and `VITE_APP_ENV_LABEL` override it at build
time (see `frontend/.env.example`). Set an empty environment label to hide it.
These values are public display metadata, not authentication or backend settings.
The footer has no runtime environment, account, device or infrastructure claims.

The dev-only `/tests/fixtures/settings-controls.html` checks footer flow and
the real logout action/dialog without an auth provider or API. Its confirmation
counter is test-only, not an authentication test. Signed-in Settings navigation
and actual logout still require a real session for end-to-end verification.
