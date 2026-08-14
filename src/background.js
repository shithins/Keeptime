// Keeptime Background Script (Service Worker)

// Configure Chrome Idle detection (60 seconds)
chrome.idle.setDetectionInterval(60);

// Keep track of active synchronization to prevent overlapping sync loops
let isSyncing = false;

// Initialize when extension is loaded
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({
        offlineQueue: [],
        syncStatus: 'synced'
    });
});

// Listener for System Idle State Changes
chrome.idle.onStateChanged.addListener(async (newState) => {
    try {
        const data = await chrome.storage.local.get([
            'currentStatus', 
            'apiGatewayUrl', 
            'email',
            'breakStartTime',
            'totalBreakTime'
        ]);

        const currentStatus = data.currentStatus;
        const apiGatewayUrl = data.apiGatewayUrl;
        const email = data.email;

        // Ignore idle if extension is not connected to a database
        if (!apiGatewayUrl || !email) return;

        if (newState === 'idle' || newState === 'locked') {
            // User went idle. If WORKING, automatically switch to ON BREAK
            if (currentStatus === 'WORKING') {
                console.log("User is idle/locked. Switching to ON BREAK.");
                
                const breakStart = Date.now();
                
                // Update storage state
                await chrome.storage.local.set({
                    currentStatus: 'ON BREAK',
                    statusColor: '#f59e0b',
                    breakStartTime: breakStart
                });

                // Enqueue BREAK log
                await enqueueLog({
                    action: 'logEvent',
                    email: email,
                    type: 'BREAK',
                    timestamp: new Date().toISOString(),
                    location: { lat: 0, lng: 0 },
                    note: 'Auto-Break (Idle)'
                });
            }
        } else if (newState === 'active') {
            // User returned. If ON BREAK, automatically resume work
            if (currentStatus === 'ON BREAK') {
                console.log("User is active. Resuming WORK.");
                
                const breakStart = parseInt(data.breakStartTime || '0');
                let totalBreak = parseInt(data.totalBreakTime || '0');

                if (breakStart > 0) {
                    totalBreak += (Date.now() - breakStart);
                }

                // Update storage state
                await chrome.storage.local.set({
                    currentStatus: 'WORKING',
                    statusColor: '#10b981',
                    totalBreakTime: totalBreak
                });
                await chrome.storage.local.remove('breakStartTime');

                // Enqueue RESUME log
                await enqueueLog({
                    action: 'logEvent',
                    email: email,
                    type: 'RESUME',
                    timestamp: new Date().toISOString(),
                    location: { lat: 0, lng: 0 },
                    note: 'Auto-Resume (Active)'
                });
            }
        }
    } catch (e) {
        console.error("Error in idle state change handler:", e);
    }
});

// Listener for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'QUEUE_LOG') {
        enqueueLog(request.payload)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
        return true; // async response
    }
    
    if (request.action === 'TRIGGER_SYNC') {
        processOfflineQueue()
            .then((res) => sendResponse({ success: res }))
            .catch(() => sendResponse({ success: false }));
        return true;
    }

    if (request.action === 'SUBMIT_LEAVE') {
        submitLeaveRequest(request.payload)
            .then((res) => sendResponse(res))
            .catch((err) => sendResponse({ success: false, message: err.message }));
        return true;
    }
});

// Helper to push logs to queue and trigger process
async function enqueueLog(logPayload) {
    const data = await chrome.storage.local.get('offlineQueue');
    const queue = data.offlineQueue || [];
    queue.push(logPayload);
    await chrome.storage.local.set({ offlineQueue: queue });
    console.log("Enqueued log event:", logPayload.type, "Queue size:", queue.length);
    // Silent trigger process
    processOfflineQueue();
}

// Process the queue one-by-one to maintain sequential history
async function processOfflineQueue() {
    if (isSyncing) return false;
    isSyncing = true;

    try {
        const data = await chrome.storage.local.get(['offlineQueue', 'apiGatewayUrl']);
        let queue = data.offlineQueue || [];
        const apiGatewayUrl = data.apiGatewayUrl;

        if (!apiGatewayUrl || queue.length === 0) {
            isSyncing = false;
            chrome.storage.local.set({ syncStatus: 'synced' });
            return true;
        }

        console.log("Processing offline queue. Count:", queue.length);
        chrome.storage.local.set({ syncStatus: 'offline' }); // default to offline until we succeed

        while (queue.length > 0) {
            const nextLog = queue[0];
            
            try {
                const response = await fetch(apiGatewayUrl, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nextLog)
                });

                if (!response.ok) {
                    throw new Error("HTTP error: " + response.status);
                }

                const result = await response.json();
                if (result && result.success) {
                    // Success! Remove from local queue
                    queue.shift();
                    await chrome.storage.local.set({ offlineQueue: queue });
                } else {
                    throw new Error(result.message || "Failed API validation");
                }

            } catch (err) {
                console.warn("Sync failed for event:", nextLog.type, "Error:", err.message);
                chrome.storage.local.set({ syncStatus: 'offline' });
                isSyncing = false;
                return false;
            }
        }

        console.log("All logs synced successfully.");
        chrome.storage.local.set({ syncStatus: 'synced' });
        isSyncing = false;
        return true;

    } catch (e) {
        console.error("General error in processOfflineQueue:", e);
        isSyncing = false;
        return false;
    }
}

// Direct leave submission (can be queued but usually immediate feedback is wanted in UI)
async function submitLeaveRequest(payload) {
    const data = await chrome.storage.local.get('apiGatewayUrl');
    const apiGatewayUrl = data.apiGatewayUrl;
    if (!apiGatewayUrl) throw new Error("Workspace not connected.");

    try {
        const response = await fetch(apiGatewayUrl, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'requestLeave',
                email: payload.email,
                leaveType: payload.leaveType,
                dayAmount: payload.dayAmount,
                reason: payload.reason,
                date: payload.date
            })
        });

        if (!response.ok) {
            return { success: false, message: "HTTP error " + response.status };
        }

        const res = await response.json();
        return res;

    } catch (err) {
        console.error("Submit leave request network error:", err);
        return { success: false, message: "Network error: Unable to contact Google Sheets. Try again later." };
    }
}

// Support Web-to-Extension communication for invitation links
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request.action === 'CONNECT_WORKSPACE' && request.url) {
        const url = request.url.trim();
        if (!url.startsWith("https://script.google.com/")) {
            sendResponse({ success: false, error: "Invalid script URL format." });
            return;
        }

        fetch(url, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'verifyUser', email: '' })
        })
        .then(res => {
            if (!res.ok) throw new Error("HTTP error " + res.status);
            return res.json();
        })
        .then(async (data) => {
            const workspaceName = data.user ? data.user.companyName : (data.companyName || "Workspace");
            await chrome.storage.local.set({
                apiGatewayUrl: url,
                companyName: workspaceName
            });
            sendResponse({ success: true, workspaceName: workspaceName });
        })
        .catch(async (err) => {
            console.warn("External verify failed, saving URL directly:", err);
            await chrome.storage.local.set({
                apiGatewayUrl: url,
                companyName: "Workspace"
            });
            sendResponse({ success: true, workspaceName: "Workspace" });
        });

        return true; // Keep channel open for async response
    }
    
    sendResponse({ success: false, error: "Unknown action" });
});

