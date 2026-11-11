# Mobile UX follow-up

## Sign-in errors

The login page previously rendered the full Convex exception message, including the action and request ID. Sign-in now maps failed credentials to a readable message, handles known rate-limit/connection errors separately, preserves input, and supports showing or hiding the password. Other forms strip transport metadata while retaining useful business errors when available. Production-redacted authentication errors do not reveal their underlying cause; their sign-in fallback is the generic username/password message.

## Recorded payment groups

View Payments now allows individual bill selection inside each recorded group, Select All/Clear, a selected subtotal and Copy Selection. Selection totals use `paymentBills.amountAtPaymentPaise`, matching the original payment snapshot. The original paid group total remains visible. Checking bills is a local viewing/copying operation and does not modify or record payments.

## Pages reviewed and improved

| Page | Changes |
| --- | --- |
| Login and registration | Visible mobile headings, clear errors, password visibility, autocomplete and touch targets |
| Recovery and outlet selection | Mobile typography, spacing and readable instructions |
| Dashboard | Clear hierarchy, readable amounts, compact actions, clickable bill references and explicit notice when statistics are a bounded snapshot |
| Bill entry and editing | Required fields, input checks, populated edit forms after loading, save/delete feedback |
| Bill details | Mobile label/value rows and readable amounts |
| Bill and payment histories | Search/filter controls, readable cards, direct mobile navigation and consistent spacing |
| Pending bill selection | Search, Select All/Clear for visible results, compact checkbox rows and totals |
| Payment review | Document scrolling, separate compact copy control and readable rows |
| Recorded groups | Bill selection, selected subtotal, copy feedback and access to bill details |
| Receipts | Receipt-specific wording, aligned values, share progress and error handling |
| Distributors | List-first layout, editor on demand, scroll to editor, pending/error feedback and explicit Deactivate wording |
| Bank accounts | Active and inactive accounts shown, editor on demand, save feedback and preserved account number when no replacement is entered |
| Outlets | List-first editing, required name, pending/error/success feedback |
| Employees | Correct update action instead of creating another account when editing; reset controls on the employee editor; pending/error/success feedback |

## Verification

- 15 automated tests cover the existing billing regressions, authentication error presentation and preserving bank account numbers.
- Build, lint and backend TypeScript checks pass.
- Mobile Chrome emulation checked eleven signed-in routes at 320 × 640 without horizontal overflow. This includes loading and checking an existing bill edit form, the active bank list and initially hidden settings editors.
- Recorded-group interactions were checked at 320px: selecting one bill gives ₹1,386.75, selecting both gives ₹2,960.81, Clear returns to zero, and Copy Selection succeeds. The recorded paid total remains ₹2,960.81.
- Incorrect-password sign-in was exercised at 390 × 844. The readable message appeared, request metadata was absent from the visible page, and the entered username was preserved.
- In the isolated development QA workspace, an employee was created and then renamed through the editor; the employee count remained one. A bank nickname was saved with a blank replacement number; the existing masked account ending 1234 was retained.

The backend changes were pushed to development `diligent-bobcat-974` only. All test writes used synthetic records in the development QA workspace. No production deployment or production data edits were performed. These are emulator checks rather than physical-device certification. The dashboard and pending-list scaling limits documented in `billing-production-audit.md` remain separate backend work.
