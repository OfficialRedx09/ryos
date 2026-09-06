# Design Summary

## Overview
This page is a dark admin dashboard for device management, styled as a pure dark-mode interface. It uses a true-black base, deep charcoal surfaces, hairline white borders, and white accents for active and primary states. The design is intentionally minimal so data and controls remain the focus.

## Style direction
- Theme: pure dark mode (`#080808` base + charcoal + white)
- Visual language: flat cards with hairline white borders over a subtle ambient light glow, restrained radii (10–14px)
- Accent: white (`#ffffff`) for primary actions, active states, icon highlights, and filled pills
- Semantic colors: white for online/positive, amber for warnings, red for danger
- Typography: Inter for UI, JetBrains Mono with tabular-nums for stats and values

## Layout structure
- Desktop: fixed left sidebar (brand, nav, lock button) + sticky translucent topbar (page title, device status pill, device selector, lock)
- Mobile: sidebar hidden; fixed bottom nav with 4 tabs + "More" bottom sheet
- Content: single-column cards on mobile, 2–3 column grids on larger screens
- Modal overlay for confirms/prompts; toast stack above the bottom nav

## Interaction details
- Interactive elements use `cursor: pointer` (per product request); smooth scrolling is enabled globally with momentum scrolling on overflowing panels
- Active nav/tab items use a filled white pill on a dark surface; bottom nav is a floating rounded black dock above the safe area
- Radio pills and tabbar active states use a white pill with a black label
- Buttons have hover lift and press-scale feedback; primary/danger buttons carry white or danger fills with soft glows
- Cards animate in with staggered fade-up, lift on hover; a slow ambient light glow sits behind the app
- Status dot glows white when a device is online; toggles slide with a springy easing

## Mobile optimization
- `100dvh` layout, `env(safe-area-inset-*)` padding on topbar, bottom nav, sheets, toasts, and PIN screen
- Breakpoints at 860px (nav switch) and 380px (small-phone tightening)
- Fluid grids, guarded horizontal overflow, momentum scrolling, `prefers-reduced-motion` respected

## Core aesthetic principles
- Flat, quiet surfaces that emphasize data over decoration
- Muted foregrounds (`#a1a1aa`) for secondary text, `#52525b` for faint labels
- Minimal, modern typography with tight letter-spacing on headings
- Functional dashboard feel: every accent is semantic, nothing glows without meaning
