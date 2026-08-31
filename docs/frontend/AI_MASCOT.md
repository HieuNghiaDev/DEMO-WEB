# Floating THEMIS AI companion

The mascot is inline SVG, not a remote image. Its asymmetric navy shell, small
side fins, inset face and integrated status module use local brand colors so
the same character remains dark in both application themes. No library was added.

## Ownership

- `ThemisAIMascot.tsx` owns the SVG and event-driven, near-pointer eye tracking.
  `useId` gives every instance independent gradient/clip IDs. Pointer movement
  writes only the mascot gaze group's CSS variables, never page React state.
- `ThemisAIMascot.css` owns face/fin poses, blink, float, transient hint and
  responsive launcher positioning. Each face/body region is a separate SVG group.
- `ThemisAIFloatingButton.tsx` owns the native button, hover/focus attention and
  55-second inactivity timer. Its `onOpen` prop directly receives the existing
  assistant `openPanel` handler; no click delay or second click layer was added.
- `mascotExpressions.ts` defines six expressions, mouth geometry, precedence,
  gaze limits and durations; `useMascotFeedback.ts` owns temporary result feedback.
- `ThemisAiAssistant.tsx` still owns all permission checks, requests, conversation
  state and panel behavior. Only its launcher and compact header mascot changed.

## Expressions and real connections

| Expression | Trigger | Behavior |
| --- | --- | --- |
| idle | Default | Attentive eyes, small smile, 3.8s float, occasional blink |
| hover | Mouse enter or keyboard focus | Slight lift, larger eyes, lifted fins |
| thinking | Existing persona loading or message sending | Upward gaze, three small dots, cyan status pulse |
| happy | Successful, non-empty chat response | Curved eyes, cheerful mouth, one small lift; 1.5s |
| sad | Existing persona/chat error | Concerned lids, lowered pupils/fins, amber status; 2.4s |
| sleepy | 55s without pointer/key/scroll activity | Half-closed eyes, reduced float, small SVG Z |

Thinking/result feedback overrides attention and sleep. Interaction wakes an
idle mascot immediately; opening the assistant never waits for a wake animation.
Feedback expiry does **not** clear actual error messages. The green indicator
continues the former availability visual; it is not a connectivity health check.
The launcher is hidden while the panel is mounted, so the same expressions also
appear on the existing 48px header avatar. No global AI-page state was introduced.

## Motion and accessibility

The real button is labelled `THEMIS AIを開く`, uses native Enter/Space activation
and retains a visible focus outline. The decorative SVG is hidden from assistive
technology. Existing panel messages remain responsible for textual loading/errors.

Pointer tracking is limited to mouse/fine-pointer environments within 160 CSS px.
Displacement is capped at 3.5 SVG units (under 3 rendered px). Movement uses at
most one requested frame per pointer-event burst, not an idle animation loop.
Leaving the near zone/window, changing motion preference, or unmounting recenters
the gaze and cancels pending work. Event listeners and timers are cleaned up.

Reduced motion disables CSS float/blink/result movement, dot effects, gaze and
transitions. Static facial expressions and the open action remain available.
The default launcher is 76px from 768px upward, 64px below that; safe-area-aware
offsets are 24px desktop / 16px mobile, at the existing z-index 70. The panel
keeps z-index 90. Existing footer right padding leaves the corner clear.

## Verification

`/tests/fixtures/mascot-preview.html` is a dev-only expression/interaction sheet,
not a production route or build entry. It renders actual components, supplies
manual expression overrides and simulates result feedback without calling APIs.
The test panel verifies the launch callback only, not authenticated chat.

```sh
npm run build
node --test tests/mascotExpressions.test.mjs tests/themeTransition.test.mjs tests/authNavigation.test.mjs
```

Browser checks cover all six poses in both themes, 1440/1024/768/390px layouts,
callback opening, temporary feedback and inactivity. Native-key activation and
OS reduced-motion appearance need a manual check in a normal browser: the current
in-app automation did not trigger default keyboard activation and offers no
reduced-motion emulation. Pointer-disable conditions are covered by unit tests;
the reduced-motion stylesheet was reviewed. Full authenticated chat verification
requires an existing signed-in session.
