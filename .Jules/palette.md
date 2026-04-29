## 2026-04-29 - Accessible Icon-Only Buttons
**Learning:** Several core navigation and interaction buttons in the application were icon-only and lacked accessible names, making them difficult to use for screen reader users. Adding `aria-label` attributes to these buttons improves the overall accessibility and user experience.
**Action:** When creating or reviewing components with icon-only buttons, always ensure an `aria-label` or similar accessible text is provided so that the button's purpose is clear to all users.
