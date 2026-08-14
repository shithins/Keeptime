// Keeptime Admin Dashboard Controller

document.addEventListener('DOMContentLoaded', async () => {
    // Layout elements
    const sidebarLayout = document.getElementById('sidebar-layout');
    const mainLayout = document.getElementById('main-layout');
    const errorLayout = document.getElementById('error-layout');
    const lblErrorMessage = document.getElementById('lbl-error-message');

    // Header labels
    const lblWorkspaceTitle = document.getElementById('lbl-workspace-title');
    const lblAdminAvatar = document.getElementById('lbl-admin-avatar');
    const lblAdminName = document.getElementById('lbl-admin-name');
    const linkGoogleSheet = document.getElementById('link-google-sheet');

    // Metrics
    const metricTotalUsers = document.getElementById('metric-total-users');
    const metricActiveShifts = document.getElementById('metric-active-shifts');
    const metricPendingLeaves = document.getElementById('metric-pending-leaves');

    // Tables
    const tableOverviewLogs = document.getElementById('table-overview-logs');
    const tableLogs = document.getElementById('table-logs');
    const tableLeaves = document.getElementById('table-leaves');
    const tableDirectory = document.getElementById('table-directory');

    // Log filters
    const filterLogsEmail = document.getElementById('filter-logs-email');
    const filterLogsBatch = document.getElementById('filter-logs-batch');

    // Tab buttons
    const menuItems = document.querySelectorAll('.menu-item');
    const panels = document.querySelectorAll('.dashboard-panel');

    // Add User Modal & Form
    const btnOpenAddUser = document.getElementById('btn-open-add-user');
    const modalAddUser = document.getElementById('modal-add-user');
    const formAddUser = document.getElementById('form-add-user');
    const btnAddUserCancel = document.getElementById('btn-add-user-cancel');
    const addUserId = document.getElementById('add-user-id');
    const addUserName = document.getElementById('add-user-name');
    const addUserEmail = document.getElementById('add-user-email');
    const addUserBatch = document.getElementById('add-user-batch');
    const addUserTarget = document.getElementById('add-user-target');
    const addUserRole = document.getElementById('add-user-role');

    // Cached data
    let dbUsers = [];
    let dbLogs = [];
    let dbLeaves = [];
    let userMap = {}; // email -> user details

    // --- 1. SESSION & ROLE CHECK ---
    try {
        const session = await chrome.storage.local.get([
            'apiGatewayUrl',
            'email',
            'role',
            'employeeName'
        ]);

        if (!session.apiGatewayUrl || !session.email) {
            showAccessDenied("Database URL or Admin session email not found. Please link your company database and sign in first.");
            return;
        }

        const role = (session.role || '').toUpperCase().trim();
        if (role !== 'ADMIN') {
            showAccessDenied(`Access Restricted. Your current logged-in role is "${session.role || 'EMPLOYEE'}". Only authorized Workspace Administrators can view this page.`);
            return;
        }

        // Show layout & configure header details
        errorLayout.style.display = 'none';
        sidebarLayout.style.display = 'flex';
        mainLayout.style.display = 'flex';

        lblAdminName.innerText = session.employeeName || 'Admin User';
        lblAdminAvatar.innerText = getInitials(session.employeeName || 'Admin');

        // Fetch first batch of data
        await refreshDashboardData(session.apiGatewayUrl, session.email);

    } catch (err) {
        console.error("Dashboard authorization check failed:", err);
        showAccessDenied("An error occurred while validating your admin credentials: " + err.message);
    }

    // --- 2. SWITCH PANEL TABS ---
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            
            // Toggle active menu tab button style
            menuItems.forEach(btn => btn.classList.remove('active'));
            item.classList.add('active');

            // Toggle active content panel visibility
            panels.forEach(panel => {
                if (panel.id === target) {
                    panel.classList.add('active');
                } else {
                    panel.classList.remove('active');
                }
            });
        });
    });

    // --- Modal open/close listeners ---
    if (btnOpenAddUser) {
        btnOpenAddUser.addEventListener('click', () => {
            modalAddUser.style.display = 'flex';
        });
    }
    if (btnAddUserCancel) {
        btnAddUserCancel.addEventListener('click', () => {
            modalAddUser.style.display = 'none';
            formAddUser.reset();
        });
    }

    // Submit Add User Form
    if (formAddUser) {
        formAddUser.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const empId = addUserId.value.trim();
            const name = addUserName.value.trim();
            const newUserEmail = addUserEmail.value.trim();
            const batch = addUserBatch.value.trim();
            const targetHours = parseInt(addUserTarget.value.trim() || '8');
            const role = addUserRole.value.trim();

            const submitBtn = formAddUser.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerText = "Saving...";

            try {
                const session = await chrome.storage.local.get(['apiGatewayUrl', 'email']);
                const response = await fetch(session.apiGatewayUrl, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'addUser',
                        email: session.email,
                        newUser: {
                            empId,
                            name,
                            email: newUserEmail,
                            batch,
                            targetHours,
                            role
                        }
                    })
                });

                if (!response.ok) throw new Error("HTTP error " + response.status);
                const result = await response.json();

                if (result && result.success) {
                    modalAddUser.style.display = 'none';
                    formAddUser.reset();
                    await refreshDashboardData(session.apiGatewayUrl, session.email);
                } else {
                    alert("Failed to add user: " + result.message);
                }
            } catch (err) {
                console.error("Add user failed:", err);
                alert("Network Error: " + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = "Save User";
            }
        });
    }

    // --- 3. FETCH AND CACHE DASHBOARD DATA ---
    async function refreshDashboardData(scriptUrl, email) {
        try {
            const response = await fetch(scriptUrl, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'getAdminDashboardData',
                    email: email
                })
            });

            if (!response.ok) throw new Error("HTTP error " + response.status);
            const result = await response.json();

            if (result && result.success) {
                // Update Cache
                dbUsers = result.users || [];
                dbLogs = result.logs || [];
                dbLeaves = result.leaves || [];

                // Re-build user lookup dictionary
                userMap = {};
                dbUsers.forEach(u => {
                    if (u.email) {
                        userMap[u.email.toLowerCase().trim()] = u;
                    }
                });

                // Update company headers & links
                lblWorkspaceTitle.innerText = result.companyName || 'Keeptime Workspace';
                if (result.spreadsheetUrl) {
                    linkGoogleSheet.href = result.spreadsheetUrl;
                    linkGoogleSheet.style.pointerEvents = 'auto';
                }

                // Render views
                renderOverviewMetrics();
                renderOverviewLogsTable();
                renderAllLogsTable();
                renderLeavesTable(scriptUrl, email);
                renderDirectoryTable(scriptUrl, email);
            } else {
                alert("Database retrieval error: " + (result.message || "Failed to load sheets data."));
            }
        } catch (err) {
            console.error("Failed to load dashboard records:", err);
            alert("Connection error: Cannot fetch database details. Ensure the script URL is online.\n\nDetails: " + err.message);
        }
    }

    // --- 4. DATA RENDER CONTROLLERS ---

    function renderOverviewMetrics() {
        metricTotalUsers.innerText = dbUsers.length;
        metricPendingLeaves.innerText = dbLeaves.length;

        // Calculate Active Shifts count (users whose latest raw log is START or RESUME)
        const activeEmails = new Set();
        const inactiveEmails = new Set();

        dbLogs.forEach(log => {
            if (!log.email) return;
            const em = log.email.toLowerCase().trim();
            if (!activeEmails.has(em) && !inactiveEmails.has(em)) {
                if (log.type === 'START' || log.type === 'RESUME') {
                    activeEmails.add(em);
                } else {
                    inactiveEmails.add(em);
                }
            }
        });

        metricActiveShifts.innerText = activeEmails.size;
    }

    function renderOverviewLogsTable() {
        tableOverviewLogs.innerHTML = '';
        const limitLogs = dbLogs.slice(0, 15); // Show latest 15 events only

        if (limitLogs.length === 0) {
            tableOverviewLogs.innerHTML = `<tr><td colspan="5" class="empty-state">No punch activity recorded in RAW logs.</td></tr>`;
            return;
        }

        limitLogs.forEach(log => {
            const row = document.createElement('tr');
            const formattedTime = formatTimestamp(log.timestamp);
            const userDetails = getUserDetails(log.email);
            const badgeClass = (log.type || 'start').toLowerCase();

            row.innerHTML = `
                <td class="cell-mono">${formattedTime}</td>
                <td>
                    <strong>${userDetails.name}</strong><br>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${log.email}</span>
                </td>
                <td><span class="badge ${badgeClass}">${log.type}</span></td>
                <td>${log.location || 'Unknown'}</td>
                <td style="color:var(--text-muted);">${log.note || ''}</td>
            `;
            tableOverviewLogs.appendChild(row);
        });
    }

    // Filter Listeners
    filterLogsEmail.addEventListener('input', renderAllLogsTable);
    filterLogsBatch.addEventListener('input', renderAllLogsTable);

    function renderAllLogsTable() {
        // Read filter inputs
        const searchVal = filterLogsEmail.value.toLowerCase().trim();
        const batchVal = filterLogsBatch.value.toLowerCase().trim();

        tableLogs.innerHTML = '';

        const filtered = dbLogs.filter(log => {
            const user = getUserDetails(log.email);
            const emailMatch = !searchVal || log.email.toLowerCase().includes(searchVal) || user.name.toLowerCase().includes(searchVal);
            const batchMatch = !batchVal || user.batch.toLowerCase().includes(batchVal);
            return emailMatch && batchMatch;
        });

        if (filtered.length === 0) {
            tableLogs.innerHTML = `<tr><td colspan="5" class="empty-state">No matching logs found.</td></tr>`;
            return;
        }

        filtered.forEach(log => {
            const row = document.createElement('tr');
            const formattedTime = formatTimestamp(log.timestamp);
            const userDetails = getUserDetails(log.email);
            const badgeClass = (log.type || 'start').toLowerCase();

            row.innerHTML = `
                <td class="cell-mono">${formattedTime}</td>
                <td>
                    <strong>${userDetails.name}</strong> (${userDetails.batch})<br>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${log.email}</span>
                </td>
                <td><span class="badge ${badgeClass}">${log.type}</span></td>
                <td>${log.location || 'Unknown'}</td>
                <td style="color:var(--text-muted);">${log.note || ''}</td>
            `;
            tableLogs.appendChild(row);
        });
    }

    function renderLeavesTable(scriptUrl, email) {
        tableLeaves.innerHTML = '';

        if (dbLeaves.length === 0) {
            tableLeaves.innerHTML = `<tr><td colspan="6" class="empty-state">No pending leave requests found.</td></tr>`;
            return;
        }

        dbLeaves.forEach(leave => {
            const row = document.createElement('tr');
            const userDetails = getUserDetails(leave.email);

            row.innerHTML = `
                <td class="cell-mono">${leave.date}</td>
                <td>
                    <strong>${leave.name}</strong> (${userDetails.batch})<br>
                    <span style="font-size:0.7rem;color:var(--text-muted);">${leave.email}</span>
                </td>
                <td>
                    <span class="badge resume">${leave.type}</span><br>
                    <span style="font-size:0.75rem;color:var(--text-muted);">${leave.amount} Day Request</span>
                </td>
                <td><strong>${leave.rmName || 'N/A'}</strong></td>
                <td style="color:var(--text-muted); font-style:italic;">"${leave.reason}"</td>
                <td>
                    <div style="display:flex;gap:6px;">
                        <button class="btn-action-emerald btn-approve" data-row="${leave.rowId}">Approve</button>
                        <button class="btn-action-rose btn-reject" data-row="${leave.rowId}">Reject</button>
                    </div>
                </td>
            `;

            row.querySelector('.btn-approve').addEventListener('click', (e) => {
                processLeaveRow(scriptUrl, email, leave.rowId, 'APPROVED', e.target);
            });
            row.querySelector('.btn-reject').addEventListener('click', (e) => {
                processLeaveRow(scriptUrl, email, leave.rowId, 'REJECTED', e.target);
            });

            tableLeaves.appendChild(row);
        });
    }

    async function processLeaveRow(scriptUrl, adminEmail, rowId, status, buttonEl) {
        if (!confirm(`Are you sure you want to ${status.toLowerCase()} this leave request?`)) return;

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
                    email: adminEmail,
                    rowId: rowId,
                    status: status
                })
            });

            if (!response.ok) throw new Error("HTTP error " + response.status);
            const result = await response.json();

            if (result && result.success) {
                // Refresh full dashboard cache
                await refreshDashboardData(scriptUrl, adminEmail);
            } else {
                alert("Operation failed: " + result.message);
                buttons.forEach(btn => btn.disabled = false);
                buttons[0].innerText = 'Approve';
                buttons[1].innerText = 'Reject';
            }
        } catch (err) {
            console.error("Failed to update leave request:", err);
            alert("Network Error: " + err.message);
            buttons.forEach(btn => btn.disabled = false);
            buttons[0].innerText = 'Approve';
            buttons[1].innerText = 'Reject';
        }
    }

    function renderDirectoryTable(scriptUrl, adminEmail) {
        tableDirectory.innerHTML = '';

        if (dbUsers.length === 0) {
            tableDirectory.innerHTML = `<tr><td colspan="7" class="empty-state">No users registered in Directory.</td></tr>`;
            return;
        }

        dbUsers.forEach(user => {
            const row = document.createElement('tr');
            const roleClass = (user.role || 'EMPLOYEE').toLowerCase();

            row.innerHTML = `
                <td class="cell-mono">${user.empId || 'N/A'}</td>
                <td><strong>${user.name}</strong></td>
                <td>${user.email}</td>
                <td><span class="badge employee">${user.batch || 'General'}</span></td>
                <td>${user.targetHours || 8} Hours</td>
                <td><span class="badge ${roleClass}">${user.role || 'EMPLOYEE'}</span></td>
                <td>
                    <button class="btn-action-rose btn-delete-user" data-email="${user.email}">Delete</button>
                </td>
            `;

            row.querySelector('.btn-delete-user').addEventListener('click', (e) => {
                deleteUserRow(scriptUrl, adminEmail, user.email, e.target);
            });

            tableDirectory.appendChild(row);
        });
    }

    async function deleteUserRow(scriptUrl, adminEmail, targetEmail, buttonEl) {
        if (adminEmail.toLowerCase().trim() === targetEmail.toLowerCase().trim()) {
            alert("Security Warning: You cannot delete your own admin account from the dashboard.");
            return;
        }

        if (!confirm(`Are you sure you want to permanently delete user "${targetEmail}" from the directory?`)) {
            return;
        }

        buttonEl.disabled = true;
        buttonEl.innerText = "Deleting...";

        try {
            const response = await fetch(scriptUrl, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'deleteUser',
                    email: adminEmail,
                    targetEmail: targetEmail
                })
            });

            if (!response.ok) throw new Error("HTTP error " + response.status);
            const result = await response.json();

            if (result && result.success) {
                await refreshDashboardData(scriptUrl, adminEmail);
            } else {
                alert("Delete failed: " + result.message);
                buttonEl.disabled = false;
                buttonEl.innerText = "Delete";
            }
        } catch (err) {
            console.error("Delete user failed:", err);
            alert("Network Error: " + err.message);
            buttonEl.disabled = false;
            buttonEl.innerText = "Delete";
        }
    }

    // --- 5. HELPER UTILS ---

    function showAccessDenied(message) {
        lblErrorMessage.innerText = message;
        sidebarLayout.style.display = 'none';
        mainLayout.style.display = 'none';
        errorLayout.style.display = 'flex';
    }

    function getInitials(name) {
        if (!name) return 'A';
        const parts = name.split(' ');
        if (parts.length > 1) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name[0].toUpperCase();
    }

    function getUserDetails(email) {
        if (!email) return { name: 'Unknown', batch: 'N/A' };
        const key = email.toLowerCase().trim();
        if (userMap[key]) {
            return {
                name: userMap[key].name || 'User',
                batch: userMap[key].batch || 'General'
            };
        }
        return { name: email, batch: 'General' };
    }

    function formatTimestamp(timestampStr) {
        if (!timestampStr) return '';
        try {
            const d = new Date(timestampStr);
            if (isNaN(d.getTime())) return timestampStr;
            
            const yy = d.getFullYear();
            const mm = (d.getMonth() + 1).toString().padStart(2, '0');
            const dd = d.getDate().toString().padStart(2, '0');
            const hh = d.getHours().toString().padStart(2, '0');
            const min = d.getMinutes().toString().padStart(2, '0');
            return `${yy}-${mm}-${dd} ${hh}:${min}`;
        } catch (e) {
            return timestampStr;
        }
    }
});
