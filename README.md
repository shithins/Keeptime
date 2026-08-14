# ⏳ Keeptime: BYOD Attendance & Admin Dashboard

Welcome to **Keeptime**! A high-fidelity, data-sovereign **Bring-Your-Own-Database (BYOD)** attendance tracking extension and management dashboard built using Google Sheets and Google Apps Script. 

It is ideal for companies (Admins, Managers, Employees) and academic institutions (Admins, Tutors, Students).

---

## 🌟 Key Features

### 👤 Student & Employee Tracker (Extension Popup)
*   **Simple Onboarding**: Join a workspace instantly via an invitation link.
*   **Shift Logger**: Track clock-ins, break pauses, and clock-outs.
*   **Progress Dial**: Real-time circular progress bar comparing worked hours to daily shift targets.
*   **Leave Requests**: Apply for Casual or Sick leave directly in the extension.
*   **Personal Reports**: View weekly logs and leave counters.
*   **Offline Cache**: Attendance logs sync automatically when network connections drop.

### 🔑 Tutor & Admin Dashboard (`admin.html`)
*   **Analytics Widgets**: Track total users, pending leaves, and active clock-ins.
*   **Recent Punch Feed**: Real-time feed of employee events, locations, and notes.
*   **Attendance Logs Table**: Search, filter, and review logs by user name/email and batch.
*   **Leave Approvals**: Approve or reject leave applications with a single click.
*   **User Directory (CRUD)**: Add, view, and delete registered students or employees.
*   **Automatic Role Standardization**: Sheet column inputs (e.g. *Student*, *Tutor*, *Teacher*, *Admin*) map automatically to corresponding client permissions.

---

## 🛠️ Setup Guide

### 1. Backend Google Sheets & Apps Script Setup
Keeptime automatically initializes itself. You do not need to format sheets manually:
1.  Create a blank **Google Sheet**.
2.  Go to **Extensions > Apps Script** in the top menu.
3.  Delete any default placeholder code.
4.  Copy the entire code from [`google-apps-script.js`](google-apps-script.js) and paste it into the editor.
5.  Click the **Save (floppy disk) icon**.
6.  Select the **`initializeDatabase`** function in the top dropdown and click **Run**. Grant all requested permissions.
7.  Click **Deploy > New deployment** (choose **Web App**).
    *   *Execute as*: `Me` (your account)
    *   *Who has access*: `Anyone` (required for Chrome extension connectivity)
8.  Copy the generated **Web App URL** (the API gateway).

---

### 2. Install the Extension in Chrome
To run the extension in developer mode:
1.  Download the **`Keeptime.zip`** file from the Github release page (or compress the `/dist` directory of this project).
2.  Unpack the ZIP file into a folder on your computer.
3.  Open Chrome and navigate to `chrome://extensions`.
4.  Toggle **Developer Mode** on in the top-right corner.
5.  Click **Load unpacked** (top-left) and select the unpacked folder (containing `manifest.json`).

---

### 3. Setup & Onboarding Flow
1.  **Admin Registration**: Open the extension popup, go to **Register Company**, paste your **Web App URL**, and enter your email.
2.  **Invite Users**: Click the settings gear in the popup, select **Copy Invite Link**, and share this link with your staff or students.
3.  **User Setup**: When users click the link, their Keeptime extension is configured automatically. They only need to enter their registered email to sign in.
4.  **Admin Dashboard**: Click the Settings gear -> **Open Admin Dashboard** to launch the interactive manager portal in a full browser tab.
