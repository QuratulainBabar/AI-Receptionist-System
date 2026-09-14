# Health Connect UI

Create the frontend UI for a new React project named AI Receptionist.
This is an AI-powered medical receptionist system for patients and doctors. Patients interact with an AI receptionist to ask about doctor specialities, find doctors, book appointments, receive confirmations/follow-ups, and provide medical history or reports. Doctors can manage their schedules and view patient information.
IMPORTANT — CURRENT SCOPE
For this task, ONLY prepare the frontend foundation, design system, routing, layouts, reusable components, and realistic static/mock data.
Do NOT implement:

Backend


Database


Real authentication logic


Real AI/API integration


Real voice calling


Real email/SMS sending


Payment functionality


Real file upload/storage


External API integrations

All functionality must use static/mock data only for now.
AUTHENTICATION UI
Create the basic UI structure for:

Login


Sign Up


Forgot Password


Role selection during signup: Patient / Doctor

These are UI-only. Do not implement real authentication.
PATIENT MODULES
Prepare routing and base structure for:

Patient Dashboard


AI Receptionist Chat


Doctor/Speciality Search


Doctor Details


Book Appointment


Appointment Confirmation


My Appointments


Medical History


Medical Records / Reports


Follow-up Messages

The UI structure should support these requirements:

Patient can ask about a doctor's speciality.


Patient can find/select a suitable doctor.


Patient can view available appointment dates and time slots.


Patient can book an appointment.


Appointment information can appear in the doctor's schedule using static data.


Patient can see appointment confirmation.


Patient can see follow-up email/message information using static data.


Patient can provide medical history/information.


Patient can see a UI for uploading medical reports/records.


Patient can see appointment/activity history.

DOCTOR MODULES
Prepare routing and base structure for:

Doctor Dashboard


Appointment Schedule


Appointment Notifications


Patient List


Patient Details


Medical History & Reports


Appointment/Activity History

The doctor UI should support viewing:

Upcoming appointments


Patient information


Patient medical history


Medical reports


Appointment notifications


Appointment/activity history

AI RECEPTIONIST
Prepare the base structure for an AI Receptionist Chat where a patient can:

Ask about doctor specialities


Ask about available doctors


Start the appointment-booking flow


View/select available appointment slots


Receive appointment confirmation

For now, use realistic static/mock chat messages only. Do not connect any real AI service.
ROUTING & PROJECT STRUCTURE
Set up clean frontend routing for the authentication, patient and doctor areas.
Create separate reusable base layouts for:

AUTHENTICATION UI
Create the basic UI structure for:

Login


Sign Up


Forgot Password


Role selection during signup: Patient / Doctor

For the Login screen, add static demo credentials for testing the UI:
Demo Patient

Username: patient@example.com


Password: Patient123

Demo Doctor

Username: doctor@example.com


Password: Doctor123

These are demo/static credentials only. Do not implement real authentication or connect them to any backend.
After entering the demo credentials, the UI can navigate to the corresponding Patient Dashboard or Doctor Dashboard.

STRICT SCOPE CONTROL
Do NOT build all detailed screens yet.
For this first task, ONLY:

Set up the React project structure.


Set up the healthcare design system/theme.


Set up authentication UI routes.


Set up Patient and Doctor base layouts.


Set up routing/navigation.


Create reusable UI components.


Create realistic static/mock data files.


Create placeholder/base pages for the listed modules.

Do not add detailed screen functionality yet. Do not create backend or real integrations.
After completing these foundation tasks, STOP. We will build and refine each screen one by one with separate instructions.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://care-connect-ai-94.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a09b2fa5-8dc2-4b14-8b8f-6e19c18f5275).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
