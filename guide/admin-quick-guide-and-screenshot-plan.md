# Daily Digital Admin Quick Guide

## Purpose

Daily Digital is a browser-based simulated Android phone used by OT staff to teach, practise, and assess digital community skills. It lets users practise sensitive digital tasks without using real personal data, real banking, or real Singpass credentials.

## Quick Start for Admin

## Access Links and QR Codes

These links work when the app is running locally with `npm run dev`.

If Vite starts on a different port, replace `5173` with the port shown in the terminal.

| Panel | Link | QR Code |
| --- | --- | --- |
| Admin Panel | [http://127.0.0.1:5173/admin](http://127.0.0.1:5173/admin) | ![Admin panel QR code](https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=http%3A%2F%2F127.0.0.1%3A5173%2Fadmin) |
| User Panel | [http://127.0.0.1:5173/](http://127.0.0.1:5173/) | ![User panel QR code](https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=http%3A%2F%2F127.0.0.1%3A5173%2F) |

Important: `127.0.0.1` means "this same laptop". If users are joining from separate devices later, replace it with the deployed Cloudflare URL or the correct network-accessible address.

## Quick Start

1. Open the admin page:

   `http://127.0.0.1:5173/admin`

   If Vite started on another port, use the port shown in the terminal.

2. Check the session PIN at the top of the admin page.

3. Ask each user to open the user page:

   `http://127.0.0.1:5173/`

4. User login flow:

   - Select an assigned alias.
   - Enter the 4-digit user PIN.
   - Enter the 6-letter session PIN from admin.

5. Once joined, users appear in the live device panel.

6. Click a user tile in the live panel before changing mode or pushing a module.

## Admin Layout

### Current Session

Use this during live sessions.

- Left panel: live views of up to 6 joined devices.
- Right panel: control panel for selected user.
- Mode controls: Learn, Practice, Assessment, Free.
- Mode-aware settings: each mode shows only relevant controls.
- Evaluation panel: changes depending on selected mode.

### Past Sessions

Use this after sessions to review patient progress.

- Shows de-identified user tiles.
- Clicking a user opens report-card style panels.
- Left panel: functional performance.
- Right panel: cognitive performance.
- Filters can be used by mode, app, or scenario.

## Modes

### Learn Mode

Purpose: teach one app function at a time.

Admin steps:

1. Select user.
2. Choose `Learn`.
3. Press `ENTER`.
4. In Learn Mode Settings, choose the app module.
5. Press `Start Learn Module`.

User experience:

- User is guided step by step.
- Correct target areas are highlighted.
- Questions use multiple choice only.
- User receives a completion page after finishing a module.

Tracked Learn outcomes:

- Modules completed.
- Time spent on modules.
- Accurate clicks or answers overall and by app.

### Practice Mode

Purpose: rehearse scenarios with optional checklist support.

Admin steps:

1. Select user.
2. Choose `Practice`.
3. Press `ENTER`.
4. Choose a scenario.
5. Push the scenario.

User experience:

- Starts from the home screen.
- Task card appears beside the phone.
- Checklist is page-aware.
- Admin can allow checklist support, hidden checklist, or prompts.
- Multiple-choice answer checks are used where needed.

Tracked Practice outcomes:

- Scenario progress.
- Checklist step completion.
- Attempts.
- Wrong-step attempts.
- Prompt count.
- Time taken.

### Assessment Mode

Purpose: observe independent functional performance.

Admin steps:

1. Select user.
2. Choose `Assessment`.
3. Press `ENTER`.
4. Choose an assessment scenario.
5. Push the assessment.

User experience:

- Starts from the home screen.
- User sees one task card first.
- Instructions are hidden unless user opens them briefly.
- User submits assessment with a confirmation popup.
- Completion overlay thanks the user but does not end the whole session.

Admin monitoring:

- Live checklist capture.
- App-level step detection.
- Initiation time.
- Time between actions.
- Prompt response.
- Stuck alert after prolonged inactivity.

### Free Mode

Purpose: allow open exploration without structured scoring.

Admin steps:

1. Select user.
2. Choose `Free`.
3. Press `ENTER`.
4. Optional: push a custom SMS or WhatsApp input.

Free Mode controls:

- Choose SMS or WhatsApp.
- Choose target user or all users.
- Enter sender/title.
- Enter message.
- Enter custom task-card instructions.
- Push custom message.
- Remove pushed input if sent by mistake.

Free Mode monitoring:

- See active pushed inputs.
- Read/open status.
- WhatsApp reply count.
- Last observed action.
- Remove custom input.

## Simulated Apps

### Home Screen

Skills:

- Identify app purpose.
- Check battery and signal.
- Use home, back, and recent-app buttons.

### Messages

Skills:

- Open formal SMS.
- Identify sender.
- Extract date, time, and location.

### Calendar

Skills:

- Select correct date.
- Add title.
- Set date and time.
- Save, edit, or remove appointments.
- Correct errors.

### WhatsApp

Skills:

- Open relevant chat.
- Read informal message.
- Type and send response.
- Manage social scheduling.

### Maps

Skills:

- Choose current location.
- Choose destination.
- Select travel mode.
- Read route and duration.

### Bank

Skills:

- Log in to simulated bank.
- Check balance.
- Choose payee.
- Enter amount and purpose.
- Review payment details.
- Trigger Singpass approval.

### Singpass

Skills:

- Understand dashboard use.
- Review digital identity card.
- Open inbox.
- Review approval requests.
- Approve only when details match the bank payment.

## Suggested Scenario Screenshots

Capture these screenshots for a complete report or slide deck.

### Admin Screenshots

1. Admin current session dashboard with no users joined.
2. Admin current session dashboard with one user selected.
3. Mode selector showing Learn, Practice, Assessment, Free.
4. Learn Mode Settings panel.
5. Practice Scenario Push panel.
6. Assessment Scenario Push panel.
7. Free Mode Settings with custom input fields.
8. Free Mode Monitoring with pushed input status.
9. Past Sessions report-card user tile view.
10. Individual past session report card with Functional and Cognitive panels.

### User Screenshots

1. Login page with alias and PIN.
2. Join Session page with 6-letter session PIN.
3. Android-style home screen.
4. Learn mode task card beside phone.
5. Practice mode page-aware checklist.
6. Assessment task card with hidden task button.
7. Assessment completion overlay.
8. Free mode custom task card beside phone.

### Scenario Screenshots

1. Messages: Doctor SMS opened.
2. Calendar: date selection and appointment editor.
3. Calendar: saved appointment visible.
4. WhatsApp: Family Group or Jia Wei chat with reply box.
5. Maps: Home to Clinic B route with travel duration.
6. Bank: balance screen.
7. Bank: payment review screen.
8. Singpass: dashboard.
9. Singpass: approval request with recipient and amount.
10. Singpass: approval result and return to Bank.

## Screenshot Capture Notes

Use a consistent browser size for screenshots so the report looks clean.

Recommended desktop screenshot size:

`1280 x 900`

Recommended report crop:

- Include the phone simulator and task card together.
- For admin screenshots, include both live panel and control panel.
- Avoid using real names, NRIC, or patient identifiers.
- Use only assigned aliases such as `Calm Panda`.

## Admin Session Checklist

Before session:

- Create or confirm user aliases.
- Confirm each alias has a 4-digit PIN.
- Start a new session PIN.
- Decide mode: Learn, Practice, Assessment, or Free.

During session:

- Select the correct user tile.
- Confirm mode with `ENTER`.
- Push the relevant module or scenario.
- Observe live view and checklist status.
- Use prompts only when clinically appropriate.
- Note errors, latency, and need for cueing.

After session:

- Review past session report cards.
- Compare functional app performance.
- Compare cognitive metrics such as initiation and action timing.
- Document clinical interpretation separately from objective app metrics.

## Common Troubleshooting

### User cannot join

- Check that admin page is open.
- Check the session PIN.
- Confirm alias and 4-digit user PIN.
- Confirm the session has not ended.

### Wrong user selected

- Click the correct user tile in the live panel.
- Check the selected alias shown in the Mode panel.
- Press `ENTER` after selecting the intended mode.

### Mode settings look wrong

- The settings panel is mode-aware.
- Select the correct mode.
- Press `ENTER`.
- The relevant settings should appear for that mode.

### Local app stopped

Run:

```powershell
cd "C:\Users\kuang\OneDrive\Desktop\AI Experiments\Virtual Executive Function Assessment"
npm run dev
```

Then reopen the local URL shown in the terminal.
