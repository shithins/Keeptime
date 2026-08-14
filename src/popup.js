// Keeptime Popup Controller

// --- DOM ELEMENTS ---

// Screens
const screens = {
    setup: document.getElementById('setup-screen'),
    login: document.getElementById('login-screen'),
    tracker: document.getElementById('tracker-screen'),
    leave: document.getElementById('leave-screen'),
    report: document.getElementById('report-screen'),
    team: document.getElementById('team-screen')
};

// Setup Screen Role Selection Tabs
const tabEmployee = document.getElementById('tab-employee');
const tabAdmin = document.getElementById('tab-admin');
const setupEmployeeBlock = document.getElementById('setup-employee-block');
const setupAdminBlock = document.getElementById('setup-admin-block');

// Setup Screen Forms
const employeeSetupForm = document.getElementById('employee-setup-form');
const inviteCodeInput = document.getElementById('invite-code');
const employeeSetupError = document.getElementById('employee-setup-error');

const adminSetupForm = document.getElementById('admin-setup-form');
const scriptUrlInput = document.getElementById('script-url');
const adminSetupError = document.getElementById('admin-setup-error');

// Login Screen
const loginForm = document.getElementById('login-form');
const employeeEmailInput = document.getElementById('employee-email');
const employeePasswordInput = document.getElementById('employee-password');
const loginError = document.getElementById('login-error');
const loginWorkspaceName = document.getElementById('login-workspace-name');
const btnBackSetup = document.getElementById('btn-back-setup');

// Tracker Screen
const profileAvatar = document.getElementById('profile-avatar');
const employeeName = document.getElementById('employee-name');
const employeeBadge = document.getElementById('employee-badge');
const timerDisplay = document.getElementById('timer-display');
const targetDisplay = document.getElementById('target-display');
const progressBar = document.getElementById('progress-bar');
const warningBanner = document.getElementById('warning-banner');
const breakBadge = document.getElementById('break-badge');
const btnStart = document.getElementById('btn-start');
const activeActionsRow = document.getElementById('active-actions');
const btnBreak = document.getElementById('btn-break');
const breakIconWrapper = document.getElementById('break-icon-wrapper');
const breakBtnText = document.getElementById('break-btn-text');
const btnStop = document.getElementById('btn-stop');
const settingsGearBtn = document.getElementById('btn-settings-gear');
const btnLogout = document.getElementById('btn-logout');

// Bottom Nav
const navTracker = document.getElementById('nav-tracker');
const navLeave = document.getElementById('nav-leave');
const navReport = document.getElementById('nav-report');
const navTeam = document.getElementById('nav-team');

// Sync Indicators
const syncIconSynced = document.getElementById('sync-icon-synced');
const syncIconOffline = document.getElementById('sync-icon-offline');
const syncSpinner = document.getElementById('sync-spinner');

// Leave Screen
const btnBackTrackerLeave = document.getElementById('btn-back-tracker-leave');
const leaveFormContent = document.getElementById('leave-form-content');
const leaveSuccessContent = document.getElementById('leave-success-content');
const leaveForm = document.getElementById('leave-form');
const leaveDateInput = document.getElementById('leave-date');
const leaveTypeSelect = document.getElementById('leave-type');
const leaveAmountSelect = document.getElementById('leave-amount');
const leaveReasonInput = document.getElementById('leave-reason');
const leaveError = document.getElementById('leave-error');

// Reports Screen
const btnBackTrackerReport = document.getElementById('btn-back-tracker-report');
const summaryHoursWeek = document.getElementById('summary-hours-week');
const summaryLeavesMonth = document.getElementById('summary-leaves-month');
const logsList = document.getElementById('logs-list');

// Team Screen (Supervisors/Admins)
const btnBackTrackerTeam = document.getElementById('btn-back-tracker-team');
const teamLeavesEmpty = document.getElementById('team-leaves-empty');
const teamLeavesList = document.getElementById('team-leaves-list');

// Settings Modal
const settingsPanel = document.getElementById('settings-panel');
const settingsApiUrl = document.getElementById('settings-api-url');
const btnOpenDashboard = document.getElementById('btn-open-dashboard');
const btnCopyInvite = document.getElementById('btn-copy-invite');
const btnCopyInviteText = document.getElementById('btn-copy-invite-text');
const disconnectBtn = document.getElementById('btn-disconnect');
const closeSettingsBtn = document.getElementById('btn-close-settings');

// --- STATE VARIABLES ---
let currentStatus = 'STOPPED';
let timerInterval = null;
let startTime = null;
let totalBreakTime = 0;
let accumulatedTime = 0;
let userTargetHoursStr = '8h 00m';
let userRole = 'EMPLOYEE';

// Dummy Logs for Reports Screen
const defaultLogs = [
    { date: 'Yesterday', hours: '8h 05m', status: 'Completed', type: 'completed' },
    { date: 'Mon, Jun 29', hours: '7h 50m', status: 'Completed', type: 'completed' },
    { date: 'Fri, Jun 26', hours: '0h 00m', status: 'Sick Leave', type: 'leave' }
];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    await initTheme();
    await restoreSession();
    setupSetupTabs();
    
    // Periodically trigger sync runner to catch up on any offline queues
    chrome.runtime.sendMessage({ action: 'TRIGGER_SYNC' });
});

// Setup tab navigation on first screen (Employee Join vs Admin Register)
function setupSetupTabs() {
    if (!tabEmployee || !tabAdmin) return;
    
    tabEmployee.addEventListener('click', () => {
        tabEmployee.classList.add('active');
        tabAdmin.classList.remove('active');
        setupEmployeeBlock.style.display = 'block';
        setupAdminBlock.style.display = 'none';
    });
    
    tabAdmin.addEventListener('click', () => {
        tabAdmin.classList.add('active');
        tabEmployee.classList.remove('active');
        setupAdminBlock.style.display = 'block';
        setupEmployeeBlock.style.display = 'none';
    });

    const btnCopyScript = document.getElementById('btn-copy-script');
    if (btnCopyScript) {
        btnCopyScript.addEventListener('click', async () => {
            try {
                btnCopyScript.innerText = "Copying...";
                btnCopyScript.disabled = true;
                
                const fileUrl = chrome.runtime.getURL('google-apps-script.js');
                const response = await fetch(fileUrl);
                if (!response.ok) throw new Error("Failed to load file.");
                
                const code = await response.text();
                await navigator.clipboard.writeText(code);
                
                btnCopyScript.innerText = "Copied!";
                btnCopyScript.style.backgroundColor = 'var(--accent-emerald)';
                
                setTimeout(() => {
                    btnCopyScript.innerText = "Copy Script";
                    btnCopyScript.style.backgroundColor = '';
                    btnCopyScript.disabled = false;
                }, 2000);
            } catch (err) {
                console.error("Failed to copy Apps Script:", err);
                btnCopyScript.innerText = "Failed";
                btnCopyScript.style.backgroundColor = 'var(--accent-rose)';
                
                setTimeout(() => {
                    btnCopyScript.innerText = "Copy Script";
                    btnCopyScript.style.backgroundColor = '';
                    btnCopyScript.disabled = false;
                }, 2000);
            }
        });
    }
}

// Load state from local storage and determine screen to show
async function restoreSession() {
    try {
        const data = await chrome.storage.local.get([
            'apiGatewayUrl',
            'email',
            'employeeName',
            'batch',
            'targetHours',
            'companyName',
            'currentStatus',
            'startTime',
            'totalBreakTime',
            'breakStartTime',
            'accumulatedTime',
            'syncStatus',
            'role'
        ]);

        if (data.apiGatewayUrl && data.email) {
            // Linked & Signed In: Show Tracker
            showScreen('tracker');

            // Render workspace and user data
            employeeName.innerText = data.employeeName || 'John Doe';
            profileAvatar.innerText = getInitials(data.employeeName || 'John Doe');
            employeeBadge.innerText = data.batch || 'General';
            userTargetHoursStr = data.targetHours || '8h 00m';
            userRole = data.role || 'EMPLOYEE';

            // Configure screen elements based on user role
            if (userRole === 'ADMIN') {
                settingsGearBtn.style.display = 'block';
                navTeam.style.display = 'flex';
                navLeave.style.display = 'none'; // Admin doesn't need to request leaves
            } else if (userRole === 'MANAGER') {
                settingsGearBtn.style.display = 'block';
                navTeam.style.display = 'flex';
                navLeave.style.display = 'flex';
            } else {
                settingsGearBtn.style.display = 'none';
                navTeam.style.display = 'none';
                navLeave.style.display = 'flex';
            }

            // Load accumulated time
            accumulatedTime = parseInt(data.accumulatedTime || '0');
            totalBreakTime = parseInt(data.totalBreakTime || '0');
            startTime = data.startTime ? parseInt(data.startTime) : null;
            currentStatus = data.currentStatus || 'STOPPED';

            // Sync status badge
            updateSyncBadge(data.syncStatus || 'synced');

            // Render Status States
            updateUIStatus(currentStatus);

            // Timer restoration
            if (currentStatus === 'WORKING' && startTime) {
                startVisualTimer();
            } else if (currentStatus === 'ON BREAK' && startTime) {
                const breakStart = parseInt(data.breakStartTime || Date.now());
                const diff = breakStart - startTime - totalBreakTime;
                updateDisplay(accumulatedTime + diff);
                updateProgressBar(accumulatedTime + diff, userTargetHoursStr);
            } else {
                updateDisplay(accumulatedTime);
                updateProgressBar(accumulatedTime, userTargetHoursStr);
            }

            // Holiday banner check
            checkHolidayStatus(data);

        } else if (data.apiGatewayUrl) {
            // Workspace linked but not logged in: Show Login
            loginWorkspaceName.innerText = data.companyName || 'Keeptime Workspace';
            showScreen('login');
            stopVisualTimer();
        } else {
            // Fresh Setup
            showScreen('setup');
            stopVisualTimer();
        }
    } catch (err) {
        console.error("Error restoring session:", err);
    }
}

// Watch storage changes to sync with background automatic break/idle transitions
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        if (changes.currentStatus || changes.apiGatewayUrl || changes.syncStatus || changes.accumulatedTime || changes.role) {
            restoreSession();
        }
    }
});

// --- SCREEN ROUTING ---
function showScreen(screenKey) {
    Object.keys(screens).forEach(key => {
        if (screens[key]) {
            if (key === screenKey) {
                screens[key].classList.add('active');
            } else {
                screens[key].classList.remove('active');
            }
        }
    });

    // Handle Active class on Bottom Nav
    if (screenKey === 'tracker') {
        navTracker.classList.add('active');
        navLeave.classList.remove('active');
        navReport.classList.remove('active');
        navTeam.classList.remove('active');
    } else if (screenKey === 'leave') {
        navTracker.classList.remove('active');
        navLeave.classList.add('active');
        navReport.classList.remove('active');
        navTeam.classList.remove('active');
    } else if (screenKey === 'report') {
        navTracker.classList.remove('active');
        navLeave.classList.remove('active');
        navReport.classList.add('active');
        navTeam.classList.remove('active');
    } else if (screenKey === 'team') {
        navTracker.classList.remove('active');
        navLeave.classList.remove('active');
        navReport.classList.remove('active');
        navTeam.classList.add('active');
    }
}

// --- ONBOARDING / SETUP & LOGIN FLOW ---

// Step 1: Admin Register / Setup Company Form
adminSetupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const scriptUrl = scriptUrlInput.value.trim();

    if (!scriptUrl) {
        showAdminSetupError("Please enter a Web App URL.");
        return;
    }

    if (!scriptUrl.startsWith("https://script.google.com/")) {
        showAdminSetupError("Invalid URL. Must be a Google Apps Script Web App URL.");
        return;
    }

    showAdminSetupError("");
    const submitBtn = adminSetupForm.querySelector('button[type="submit"]');
    submitBtn.innerText = "Linking...";
    submitBtn.disabled = true;

    try {
        // Confirm connection (using empty email verification)
        const response = await fetch(scriptUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verifyUser', email: '' })
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        const workspaceName = data.user ? data.user.companyName : (data.companyName || "Workspace");

        // Save URL and company name
        await chrome.storage.local.set({
            apiGatewayUrl: scriptUrl,
            companyName: workspaceName
        });

        loginWorkspaceName.innerText = workspaceName;
        scriptUrlInput.value = '';
        showScreen('login');

    } catch (err) {
        showAdminSetupError(`Link failed: ${err.message}. Ensure deployment is public & accessible.`);
    } finally {
        submitBtn.innerText = "Link Database";
        submitBtn.disabled = false;
    }
});

// Step 1: Employee Join Form (handles invitation links or base64 codes)
employeeSetupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = inviteCodeInput.value.trim();

    if (!code) {
        showEmployeeSetupError("Please enter an invitation link or code.");
        return;
    }

    showEmployeeSetupError("");
    const submitBtn = employeeSetupForm.querySelector('button[type="submit"]');
    submitBtn.innerText = "Connecting...";
    submitBtn.disabled = true;

    const scriptUrl = extractUrlFromCode(code);

    if (!scriptUrl) {
        showEmployeeSetupError("Invalid invitation code or link. Please verify and try again.");
        submitBtn.innerText = "Join Workspace";
        submitBtn.disabled = false;
        return;
    }

    try {
        // Confirm connection
        const response = await fetch(scriptUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verifyUser', email: '' })
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        const workspaceName = data.user ? data.user.companyName : (data.companyName || "Workspace");

        // Save URL
        await chrome.storage.local.set({
            apiGatewayUrl: scriptUrl,
            companyName: workspaceName
        });

        loginWorkspaceName.innerText = workspaceName;
        inviteCodeInput.value = '';
        showScreen('login');

    } catch (err) {
        showEmployeeSetupError(`Connection failed: ${err.message}. Check your internet connection.`);
    } finally {
        submitBtn.innerText = "Join Workspace";
        submitBtn.disabled = false;
    }
});

// Helper: Decodes full invite URL query parameters or direct base64 strings
function extractUrlFromCode(code) {
    code = code.trim();
    
    // 1. If full URL, parse search param
    if (code.startsWith("http://") || code.startsWith("https://")) {
        try {
            const urlObj = new URL(code);
            const workspaceParam = urlObj.searchParams.get("workspace");
            if (workspaceParam) {
                code = workspaceParam;
            } else {
                if (code.startsWith("https://script.google.com/")) {
                    return code;
                }
            }
        } catch(e) {
            // Ignore parse errors
        }
    }
    
    // 2. Decode base64 value
    try {
        const decoded = atob(code);
        if (decoded.startsWith("https://script.google.com/")) {
            return decoded;
        }
    } catch(e) {
        // Ignore decode errors
    }
    
    return null;
}

// Step 2: Sign In / Access Workspace Form
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = employeeEmailInput.value.trim();

    if (!email) {
        showLoginError("Please enter your corporate email.");
        return;
    }

    showLoginError("");
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.innerText = "Signing In...";
    submitBtn.disabled = true;

    try {
        const dataStorage = await chrome.storage.local.get('apiGatewayUrl');
        const scriptUrl = dataStorage.apiGatewayUrl;

        const response = await fetch(scriptUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'verifyUser',
                email: email
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();

        if (data && data.success) {
            // Save verified credentials
            await chrome.storage.local.set({
                email: data.user.email,
                employeeName: data.user.name,
                batch: data.user.batch,
                targetHours: data.user.targetHours,
                role: data.user.role || 'EMPLOYEE',
                companyName: data.user.companyName || 'Workspace',
                spreadsheetUrl: data.user.spreadsheetUrl || '',
                currentStatus: 'STOPPED',
                accumulatedTime: 0,
                totalBreakTime: 0,
                offlineQueue: [],
                syncStatus: 'synced'
            });

            employeeEmailInput.value = '';
            employeePasswordInput.value = '';
            await restoreSession();

            // Trigger background sync
            chrome.runtime.sendMessage({ action: 'TRIGGER_SYNC' });
        } else {
            showLoginError(data.message || "Failed to link. Check email.");
        }

    } catch (err) {
        showLoginError(`Sign in failed: ${err.message}.`);
    } finally {
        submitBtn.innerText = "Access Workspace";
        submitBtn.disabled = false;
    }
});

btnBackSetup.addEventListener('click', async () => {
    // Clear temp URL and go back
    await chrome.storage.local.remove('apiGatewayUrl');
    showScreen('setup');
});

// --- TRACKER SHIFT CONTROLS ---

btnStart.addEventListener('click', async () => {
    btnStart.disabled = true;
    btnStart.innerText = "Locating...";

    const coords = await getCoordinates();
    const timestampNow = Date.now();

    startTime = timestampNow;
    totalBreakTime = 0;
    currentStatus = 'WORKING';

    await chrome.storage.local.set({
        currentStatus: 'WORKING',
        startTime: startTime,
        totalBreakTime: 0
    });
    await chrome.storage.local.remove('breakStartTime');

    // Notify background worker to log START
    const data = await chrome.storage.local.get('email');
    chrome.runtime.sendMessage({
        action: 'QUEUE_LOG',
        payload: {
            action: 'logEvent',
            email: data.email,
            type: 'START',
            timestamp: new Date(timestampNow).toISOString(),
            location: coords,
            note: 'Manual Start'
        }
    });

    btnStart.disabled = false;
    btnStart.innerText = "Start Shift";
    restoreSession();
});

btnBreak.addEventListener('click', async () => {
    const data = await chrome.storage.local.get(['currentStatus', 'breakStartTime', 'totalBreakTime', 'email', 'startTime']);
    const current = data.currentStatus;
    const timestampNow = Date.now();

    if (current === 'WORKING') {
        // Start Break
        await chrome.storage.local.set({
            currentStatus: 'ON BREAK',
            breakStartTime: timestampNow
        });

        chrome.runtime.sendMessage({
            action: 'QUEUE_LOG',
            payload: {
                action: 'logEvent',
                email: data.email,
                type: 'BREAK',
                timestamp: new Date(timestampNow).toISOString(),
                location: { lat: 0, lng: 0 },
                note: 'Manual Break'
            }
        });
    } else if (current === 'ON BREAK') {
        // Resume Work
        const breakStart = parseInt(data.breakStartTime || '0');
        let totalBreak = parseInt(data.totalBreakTime || '0');
        if (breakStart > 0) {
            totalBreak += (timestampNow - breakStart);
        }

        await chrome.storage.local.set({
            currentStatus: 'WORKING',
            totalBreakTime: totalBreak
        });
        await chrome.storage.local.remove('breakStartTime');

        chrome.runtime.sendMessage({
            action: 'QUEUE_LOG',
            payload: {
                action: 'logEvent',
                email: data.email,
                type: 'RESUME',
                timestamp: new Date(timestampNow).toISOString(),
                location: { lat: 0, lng: 0 },
                note: 'Manual Resume'
            }
        });
    }
    restoreSession();
});

btnStop.addEventListener('click', async () => {
    if (!confirm("Are you sure you want to stop your shift? This will finalize your today's logs.")) return;

    btnStop.disabled = true;
    btnStop.innerText = "Stopping...";

    const coords = await getCoordinates();
    const timestampNow = Date.now();
    const data = await chrome.storage.local.get(['startTime', 'totalBreakTime', 'accumulatedTime', 'email']);
    
    const sessionStart = parseInt(data.startTime || '0');
    const totalBreak = parseInt(data.totalBreakTime || '0');
    let accum = parseInt(data.accumulatedTime || '0');

    if (sessionStart > 0) {
        const sessionDuration = timestampNow - sessionStart - totalBreak;
        if (sessionDuration > 0) {
            accum += sessionDuration;
        }
    }

    // Reset session states, save final accumulatedTime
    await chrome.storage.local.set({
        accumulatedTime: accum
    });
    await chrome.storage.local.remove(['startTime', 'totalBreakTime', 'breakStartTime', 'currentStatus']);

    // Notify background worker to log STOP
    chrome.runtime.sendMessage({
        action: 'QUEUE_LOG',
        payload: {
            action: 'logEvent',
            email: data.email,
            type: 'STOP',
            timestamp: new Date(timestampNow).toISOString(),
            location: coords,
            note: 'Manual Stop'
        }
    });

    btnStop.disabled = false;
    btnStop.innerText = "Stop Shift";
    restoreSession();
});

// --- LEAVE SCREEN ACTIONS ---

// Submit Leave form
leaveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = leaveDateInput.value;
    const leaveType = leaveTypeSelect.value;
    const dayAmount = leaveAmountSelect.value;
    const reason = leaveReasonInput.value.trim();

    if (!reason) {
        showLeaveError("Please enter a reason.");
        return;
    }

    showLeaveError("");
    const submitBtn = leaveForm.querySelector('button[type="submit"]');
    submitBtn.innerText = "Submitting...";
    submitBtn.disabled = true;

    const data = await chrome.storage.local.get('email');

    chrome.runtime.sendMessage({
        action: 'SUBMIT_LEAVE',
        payload: {
            email: data.email,
            leaveType: leaveType,
            dayAmount: dayAmount,
            reason: reason,
            date: date
        }
    }, (response) => {
        submitBtn.innerText = "Submit Request";
        submitBtn.disabled = false;

        if (response && response.success) {
            // Show custom success screen with delay redirect
            leaveFormContent.style.display = 'none';
            leaveSuccessContent.style.display = 'flex';

            setTimeout(() => {
                // Clear inputs
                leaveDateInput.value = '';
                leaveReasonInput.value = '';
                leaveFormContent.style.display = 'block';
                leaveSuccessContent.style.display = 'none';
                showScreen('tracker');
            }, 2500);
        } else {
            showLeaveError(response ? response.message : "Failed to submit request.");
        }
    });
});

// --- NAVIGATION TRIGGER EVENTS ---
navTracker.addEventListener('click', () => showScreen('tracker'));
navLeave.addEventListener('click', () => {
    showScreen('leave');
    leaveDateInput.value = new Date().toISOString().split('T')[0];
});
navReport.addEventListener('click', () => {
    showScreen('report');
    populateReportsScreen();
});

btnBackTrackerLeave.addEventListener('click', () => showScreen('tracker'));
btnBackTrackerReport.addEventListener('click', () => showScreen('tracker'));
navTeam.addEventListener('click', () => {
    showScreen('team');
    loadSupervisorLeaves();
});
btnBackTrackerTeam.addEventListener('click', () => showScreen('tracker'));

btnLogout.addEventListener('click', async () => {
    if (!confirm("Are you sure you want to sign out?")) return;
    
    stopVisualTimer();
    
    await chrome.storage.local.remove([
        'email',
        'employeeName',
        'batch',
        'targetHours',
        'role',
        'spreadsheetUrl',
        'currentStatus',
        'startTime',
        'totalBreakTime',
        'breakStartTime',
        'accumulatedTime'
    ]);
    
    await restoreSession();
});

// --- THEME / DARK MODE CONTROLLER ---
async function initTheme() {
    const data = await chrome.storage.local.get('theme');
    let theme = data.theme || 'dark'; // Default to dark theme
    setTheme(theme);

    document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
        btn.addEventListener('click', async () => {
            const currentTheme = document.body.classList.contains('dark') ? 'dark' : 'light';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            await chrome.storage.local.set({ theme: newTheme });
            setTheme(newTheme);
        });
    });
}

function setTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark');
        document.querySelectorAll('.theme-icon-sun').forEach(el => el.style.display = 'block');
        document.querySelectorAll('.theme-icon-moon').forEach(el => el.style.display = 'none');
    } else {
        document.body.classList.remove('dark');
        document.querySelectorAll('.theme-icon-sun').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.theme-icon-moon').forEach(el => el.style.display = 'block');
    }
}

// --- SETTINGS MODAL DIALOG ---
settingsGearBtn.addEventListener('click', async () => {
    const data = await chrome.storage.local.get('apiGatewayUrl');
    settingsApiUrl.innerText = data.apiGatewayUrl || '';
    settingsPanel.style.display = 'flex';
});

closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.style.display = 'none';
});

btnOpenDashboard.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('admin.html') });
});

// Copy Invite Link to Clipboard for Admin
btnCopyInvite.addEventListener('click', async () => {
    const data = await chrome.storage.local.get('apiGatewayUrl');
    if (data.apiGatewayUrl) {
        const encoded = btoa(data.apiGatewayUrl);
        // Constructed invite link incorporating encoded workspace URL
        const inviteLink = `https://keeptime.github.io/invite.html?workspace=${encoded}`;
        
        try {
            await navigator.clipboard.writeText(inviteLink);
            btnCopyInviteText.innerText = "Link Copied!";
            btnCopyInvite.style.backgroundColor = 'var(--accent-emerald)';
            
            setTimeout(() => {
                btnCopyInviteText.innerText = "Copy Invitation Link";
                btnCopyInvite.style.backgroundColor = 'var(--accent-indigo)';
            }, 2000);
        } catch (err) {
            console.error("Clipboard copy failed:", err);
            alert(`Workspace Code:\n${encoded}`);
        }
    } else {
        alert("API Endpoint not set. Please reconnect database.");
    }
});

disconnectBtn.addEventListener('click', async () => {
    if (!confirm("Are you sure you want to disconnect this database? All local logs and cache will be cleared.")) return;

    stopVisualTimer();
    await chrome.storage.local.clear();
    settingsPanel.style.display = 'none';
    await restoreSession();
});

// --- TIMER & VISUAL PROGRESS HELPERS ---

function startVisualTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        if (!startTime) return;
        const currentSession = Date.now() - startTime - totalBreakTime;
        const total = accumulatedTime + currentSession;
        updateDisplay(total);
        updateProgressBar(total, userTargetHoursStr);
    }, 1000);
}

function stopVisualTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function updateDisplay(ms) {
    if (ms < 0) ms = 0;
    const hrs = Math.floor(ms / (1000 * 60 * 60)).toString().padStart(2, '0');
    const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
    const secs = Math.floor((ms % (1000 * 60)) / 1000).toString().padStart(2, '0');
    timerDisplay.innerText = `${hrs}:${mins}:${secs}`;
}

function parseTargetHoursToSeconds(targetStr) {
    if (!targetStr) return 8 * 3600;
    let hours = 8;
    let minutes = 0;
    
    targetStr = targetStr.toString().toLowerCase().trim();
    
    if (targetStr.indexOf("h") !== -1) {
        const parts = targetStr.split("h");
        hours = parseFloat(parts[0]);
        if (parts[1]) {
            const minPart = parts[1].replace("m", "").trim();
            minutes = parseFloat(minPart) || 0;
        }
    } else if (targetStr.indexOf(":") !== -1) {
        const parts = targetStr.split(":");
        hours = parseFloat(parts[0]);
        minutes = parseFloat(parts[1]) || 0;
    } else {
        hours = parseFloat(targetStr) || 8;
    }
    
    return (hours * 3600) + (minutes * 60);
}

function updateProgressBar(elapsedMs, targetHoursStr) {
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const targetSeconds = parseTargetHoursToSeconds(targetHoursStr);
    const progressPercent = Math.min((elapsedSeconds / targetSeconds) * 100, 100);
    
    progressBar.style.width = `${progressPercent}%`;
    
    const elapsedHours = Math.floor(elapsedSeconds / 3600);
    const targetHoursClean = Math.floor(targetSeconds / 3600);
    targetDisplay.innerText = `${elapsedHours}h / ${targetHoursClean}h Target`;
}

// --- GENERAL HELPER LOGIC ---

function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

function checkHolidayStatus(data) {
    const today = new Date();
    const day = today.getDay();
    let isWeekend = (day === 0 || day === 6);
    let isHoliday = false;

    if (data.weekends) {
        const wStr = data.weekends.toLowerCase();
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        isWeekend = wStr.includes(dayNames[day]);
    }

    if (data.holidays) {
        const todayStr = today.toISOString().split('T')[0];
        isHoliday = data.holidays.includes(todayStr);
    }

    if (isWeekend || isHoliday) {
        warningBanner.style.display = 'flex';
    } else {
        warningBanner.style.display = 'none';
    }
}

function updateSyncBadge(status) {
    if (status === 'syncing') {
        syncSpinner.style.display = 'block';
        syncIconSynced.style.display = 'none';
        syncIconOffline.style.display = 'none';
    } else if (status === 'synced') {
        syncSpinner.style.display = 'none';
        syncIconSynced.style.display = 'block';
        syncIconOffline.style.display = 'none';
    } else {
        syncSpinner.style.display = 'none';
        syncIconSynced.style.display = 'none';
        syncIconOffline.style.display = 'block';
    }
}

function updateUIStatus(status) {
    timerDisplay.className = 'timer-value';
    
    if (status === 'WORKING') {
        timerDisplay.classList.add('active');
        btnStart.style.display = 'none';
        activeActionsRow.style.display = 'grid';
        
        breakBadge.style.display = 'none';
        btnBreak.classList.remove('on-break');
        breakBtnText.innerText = 'Take Break';
        breakIconWrapper.innerHTML = `<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`;
        
    } else if (status === 'ON BREAK') {
        timerDisplay.classList.add('break');
        btnStart.style.display = 'none';
        activeActionsRow.style.display = 'grid';
        
        breakBadge.style.display = 'inline-flex';
        btnBreak.classList.add('on-break');
        breakBtnText.innerText = 'Resume';
        breakIconWrapper.innerHTML = `<svg class="icon" style="fill:currentColor;" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        
    } else {
        timerDisplay.classList.add('stopped');
        btnStart.style.display = 'flex';
        activeActionsRow.style.display = 'none';
        breakBadge.style.display = 'none';
    }
}

function getCoordinates() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ lat: 0, lng: 0 });
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    lat: parseFloat(pos.coords.latitude.toFixed(6)),
                    lng: parseFloat(pos.coords.longitude.toFixed(6))
                });
            },
            (err) => {
                console.warn("Geolocation query failed/blocked:", err);
                resolve({ lat: 0, lng: 0 });
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    });
}

async function populateReportsScreen() {
    const data = await chrome.storage.local.get(['accumulatedTime', 'startTime', 'totalBreakTime', 'currentStatus', 'targetHours']);
    if (!logsList) return;
    
    logsList.innerHTML = '';
    
    let todayMs = parseInt(data.accumulatedTime || '0');
    if (data.currentStatus === 'WORKING' && data.startTime) {
        const sessionDuration = Date.now() - parseInt(data.startTime) - parseInt(data.totalBreakTime || '0');
        if (sessionDuration > 0) todayMs += sessionDuration;
    }
    
    const todaySeconds = Math.floor(todayMs / 1000);
    const todayHrs = Math.floor(todaySeconds / 3600);
    const todayMins = Math.floor((todaySeconds % 3600) / 60);
    
    const todayHoursStr = `${todayHrs}h ${todayMins.toString().padStart(2, '0')}m`;
    const todayStatus = data.currentStatus === 'WORKING' ? 'Active' : 'Completed';
    const todayType = data.currentStatus === 'WORKING' ? 'active' : 'completed';
    
    if (data.currentStatus === 'WORKING' || todayMs > 0) {
        const todayItem = document.createElement('div');
        todayItem.className = 'log-item animate-fade';
        todayItem.innerHTML = `
            <div>
                <p class="log-date">Today</p>
                <p class="log-status ${todayType}">${todayStatus}</p>
            </div>
            <div class="log-value">${todayHoursStr}</div>
        `;
        logsList.appendChild(todayItem);
    }
    
    defaultLogs.forEach(log => {
        const logItem = document.createElement('div');
        logItem.className = 'log-item animate-fade';
        logItem.innerHTML = `
            <div>
                <p class="log-date">${log.date}</p>
                <p class="log-status ${log.type}">${log.status}</p>
            </div>
            <div class="log-value">${log.hours}</div>
        `;
        logsList.appendChild(logItem);
    });
    
    const weekHoursTotal = 32.25 + (todaySeconds / 3600);
    const wH = Math.floor(weekHoursTotal);
    const wM = Math.floor((weekHoursTotal - wH) * 60);
    summaryHoursWeek.innerText = `${wH}h ${wM.toString().padStart(2, '0')}m`;
}

function showAdminSetupError(msg) {
    if (!msg) {
        adminSetupError.style.display = 'none';
    } else {
        adminSetupError.innerText = msg;
        adminSetupError.style.display = 'block';
    }
}

function showEmployeeSetupError(msg) {
    if (!msg) {
        employeeSetupError.style.display = 'none';
    } else {
        employeeSetupError.innerText = msg;
        employeeSetupError.style.display = 'block';
    }
}

function showLoginError(msg) {
    if (!msg) {
        loginError.style.display = 'none';
    } else {
        loginError.innerText = msg;
        loginError.style.display = 'block';
    }
}

function showLeaveError(msg) {
    if (!msg) {
        leaveError.style.display = 'none';
    } else {
        leaveError.innerText = msg;
        leaveError.style.display = 'block';
    }
}

function hideLeaveError() {
    leaveError.style.display = 'none';
}

// --- SUPERVISOR LEAVE APPROVAL SERVICES ---

async function loadSupervisorLeaves() {
    const data = await chrome.storage.local.get(['apiGatewayUrl', 'email']);
    const scriptUrl = data.apiGatewayUrl;
    const email = data.email;
    if (!scriptUrl || !email) return;

    teamLeavesList.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);padding:10px;">Loading leaves...</div>';
    teamLeavesEmpty.style.display = 'none';

    try {
        const response = await fetch(scriptUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'getPendingLeaves',
                email: email
            })
        });

        if (!response.ok) throw new Error("HTTP error " + response.status);
        const result = await response.json();

        if (result && result.success) {
            renderSupervisorLeaves(result.leaves);
        } else {
            teamLeavesList.innerHTML = `<div class="error-box">${result.message || "Failed to fetch leaves."}</div>`;
        }
    } catch (err) {
        console.error("Failed to load team leaves:", err);
        teamLeavesList.innerHTML = `<div class="error-box">Connection error: ${err.message}</div>`;
    }
}

function renderSupervisorLeaves(leaves) {
    teamLeavesList.innerHTML = '';
    if (!leaves || leaves.length === 0) {
        teamLeavesEmpty.style.display = 'flex';
        return;
    }

    teamLeavesEmpty.style.display = 'none';

    leaves.forEach(leave => {
        const card = document.createElement('div');
        card.className = 'team-leave-card';
        card.innerHTML = `
            <div class="team-leave-header">
                <span class="team-leave-name">${leave.name}</span>
                <span class="team-leave-batch">${leave.batch || "General"}</span>
            </div>
            <div class="team-leave-details">
                <strong>Date:</strong> ${leave.date}<br>
                <strong>Type:</strong> ${leave.type} (${leave.amount} Day)<br>
                <strong>Reason:</strong> ${leave.reason}
            </div>
            <div class="team-leave-actions">
                <button class="btn-approve-small" data-row-id="${leave.rowId}">Approve</button>
                <button class="btn-reject-small" data-row-id="${leave.rowId}">Reject</button>
            </div>
        `;

        card.querySelector('.btn-approve-small').addEventListener('click', (e) => {
            processLeave(leave.rowId, 'APPROVED', e.target);
        });
        card.querySelector('.btn-reject-small').addEventListener('click', (e) => {
            processLeave(leave.rowId, 'REJECTED', e.target);
        });

        teamLeavesList.appendChild(card);
    });
}

async function processLeave(rowId, status, buttonEl) {
    const data = await chrome.storage.local.get(['apiGatewayUrl', 'email']);
    const scriptUrl = data.apiGatewayUrl;
    const email = data.email;
    if (!scriptUrl || !email) return;

    // Disable both action buttons in the card
    const container = buttonEl.parentNode;
    const buttons = container.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = true);
    buttonEl.innerText = status === 'APPROVED' ? 'Approving...' : 'Rejecting...';

    try {
        const response = await fetch(scriptUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'processLeaveRequest',
                email: email,
                rowId: rowId,
                status: status === 'APPROVED' ? 'APPROVED' : 'REJECTED'
            })
        });

        if (!response.ok) throw new Error("HTTP error " + response.status);
        const result = await response.json();

        if (result && result.success) {
            // Reload list
            loadSupervisorLeaves();
        } else {
            alert("Action failed: " + result.message);
            buttons.forEach(btn => btn.disabled = false);
            buttons[0].innerText = 'Approve';
            buttons[1].innerText = 'Reject';
        }
    } catch (err) {
        console.error("Failed to process leave:", err);
        alert("Network Error: " + err.message);
        buttons.forEach(btn => btn.disabled = false);
        buttons[0].innerText = 'Approve';
        buttons[1].innerText = 'Reject';
    }
}

