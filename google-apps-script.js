/**
 * Keeptime Google Apps Script (API Bridge & Midnight Auditor)
 * 
 * Instructions:
 * 1. Open your Google Sheet.
 * 2. Click Extensions > Apps Script.
 * 3. Delete any default code and paste this script.
 * 4. Click Deploy > New Deployment.
 * 5. Choose type: Web App.
 * 6. Set Description: "Keeptime API"
 * 7. Set "Execute as": "Me"
 * 8. Set "Who has access": "Anyone" (Required for Chrome Extension Fetch API).
 * 9. Click Deploy and copy the Web App URL (the API Bridge).
 * 10. Also set up a Time-driven trigger for `runMidnightAuditor` to run daily between 11 PM and midnight (e.g. 11:59 PM).
 */

// --- CONFIGURATION ---
const TABS = {
  DIRECTORY: "Directory",
  LEAVE_INBOX: "Leave_Inbox",
  RAW_LOGS: "RAW_LOGS",
  SETTINGS: "Company_Settings"
};

// --- HTTP POST API ENTRY POINT ---
function doPost(e) {
  var responseData = { success: false, message: "" };
  try {
    var payload;
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      throw new Error("No payload found in POST request");
    }

    var action = payload.action;
    var email = payload.email;

    if (!action) {
      throw new Error("Missing action parameter");
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    initializeDatabase(ss);
    
    // Action 1: Verify User during Setup
    if (action === "verifyUser") {
      var dirSheet = ss.getSheetByName(TABS.DIRECTORY);
      if (!dirSheet) throw new Error("Directory sheet not found");

      var data = dirSheet.getDataRange().getValues();
      var userFound = null;

      // Search directory (Columns: EmpID [0], Name [1], Email [2], Batch [3], TargetHours [4], Role [5])
      for (var i = 1; i < data.length; i++) {
        if (data[i][2] && data[i][2].toString().toLowerCase().trim() === email.toLowerCase().trim()) {
          userFound = {
            empId: data[i][0],
            name: data[i][1],
            email: data[i][2],
            batch: data[i][3],
            targetHours: data[i][4],
            role: getStandardizedRole(data[i][5]),
            companyName: getCompanyName(),
            spreadsheetUrl: ss.getUrl()
          };
          break;
        }
      }

      if (userFound) {
        responseData = {
          success: true,
          user: userFound
        };
      } else {
        responseData = {
          success: false,
          message: "Email address not found in company directory."
        };
      }
    } 
    
    // Action 2: Log Attendance Event (START, BREAK, RESUME, STOP)
    else if (action === "logEvent") {
      var logsSheet = ss.getSheetByName(TABS.RAW_LOGS);
      if (!logsSheet) {
        // Create RAW_LOGS sheet if it does not exist
        logsSheet = ss.insertSheet(TABS.RAW_LOGS);
        logsSheet.appendRow(["Timestamp", "Email", "Type", "Location", "Device/Note"]);
      }

      var timestamp = payload.timestamp || new Date().toISOString();
      var type = payload.type;
      var loc = payload.location ? payload.location.lat + ", " + payload.location.lng : "0, 0";
      var note = payload.note || "";

      logsSheet.appendRow([timestamp, email, type, loc, note]);
      
      responseData = { success: true };
    } 
    
    // Action 3: Request Leave
    else if (action === "requestLeave") {
      var inboxSheet = ss.getSheetByName(TABS.LEAVE_INBOX);
      if (!inboxSheet) throw new Error("Leave_Inbox sheet not found");

      var date = payload.date || getFormattedDate(new Date());
      var name = getUserNameByEmail(email) || "Unknown";
      var leaveType = payload.leaveType; // e.g. "Sick", "Casual"
      var dayAmount = payload.dayAmount; // e.g. "Full", "Half"
      var reason = payload.reason || "";
      var rmName = payload.rmName || "";

      inboxSheet.appendRow([date, name, email, leaveType, dayAmount, reason, rmName, "⏳ Pending Review"]);
      responseData = { success: true };
    } 
    
    // Action 4: Get Pending Leaves (For ADMIN and MANAGER)
    else if (action === "getPendingLeaves") {
      var dirSheet = ss.getSheetByName(TABS.DIRECTORY);
      if (!dirSheet) throw new Error("Directory sheet not found");

      var dirData = dirSheet.getDataRange().getValues();
      var senderRole = "EMPLOYEE";
      var senderBatch = "";
      
      // Look up caller details
      for (var i = 1; i < dirData.length; i++) {
        if (dirData[i][2] && dirData[i][2].toString().toLowerCase().trim() === email.toLowerCase().trim()) {
          senderRole = getStandardizedRole(dirData[i][5]);
          senderBatch = dirData[i][3] ? dirData[i][3].toString().trim() : "";
          break;
        }
      }

      if (senderRole !== "ADMIN" && senderRole !== "MANAGER") {
        throw new Error("Unauthorized to access leave inbox.");
      }

      // Map users to batch and name
      var userBatchMap = {};
      var userNameMap = {};
      for (var k = 1; k < dirData.length; k++) {
        var mail = dirData[k][2].toString().toLowerCase().trim();
        userBatchMap[mail] = dirData[k][3] ? dirData[k][3].toString().trim() : "";
        userNameMap[mail] = dirData[k][1] ? dirData[k][1].toString().trim() : "";
      }

      var inboxSheet = ss.getSheetByName(TABS.LEAVE_INBOX);
      var leaves = [];
      if (inboxSheet) {
        var inboxData = inboxSheet.getDataRange().getValues();
        for (var j = 1; j < inboxData.length; j++) {
          var status = inboxData[j][7] ? inboxData[j][7].toString().toUpperCase().trim() : "";
          if (status.indexOf("PENDING") !== -1 || status === "") {
            var applicantEmail = inboxData[j][2] ? inboxData[j][2].toString().toLowerCase().trim() : "";
            var applicantBatch = userBatchMap[applicantEmail] || "";
            var applicantName = userNameMap[applicantEmail] || inboxData[j][1] || "Unknown User";

            // Filter: ADMIN sees all, MANAGER sees only their batch
            var include = false;
            if (senderRole === "ADMIN") {
              include = true;
            } else if (senderRole === "MANAGER" && senderBatch && senderBatch === applicantBatch) {
              include = true;
            }

            if (include) {
              leaves.push({
                rowId: j + 1,
                date: inboxData[j][0],
                name: applicantName,
                email: inboxData[j][2],
                type: inboxData[j][3],
                amount: inboxData[j][4],
                reason: inboxData[j][5],
                rmName: inboxData[j][6],
                status: inboxData[j][7]
              });
            }
          }
        }
      }

      responseData = { success: true, leaves: leaves };
    }

    // Action 5: Process Leave Request (Approve/Reject)
    else if (action === "processLeaveRequest") {
      var dirSheet = ss.getSheetByName(TABS.DIRECTORY);
      if (!dirSheet) throw new Error("Directory sheet not found");

      var dirData = dirSheet.getDataRange().getValues();
      var senderRole = "EMPLOYEE";
      var senderBatch = "";
      
      // Look up caller details
      for (var i = 1; i < dirData.length; i++) {
        if (dirData[i][2] && dirData[i][2].toString().toLowerCase().trim() === email.toLowerCase().trim()) {
          senderRole = getStandardizedRole(dirData[i][5]);
          senderBatch = dirData[i][3] ? dirData[i][3].toString().trim() : "";
          break;
        }
      }

      if (senderRole !== "ADMIN" && senderRole !== "MANAGER") {
        throw new Error("Unauthorized to process leave requests.");
      }

      var rowId = parseInt(payload.rowId);
      var newStatus = payload.status || "APPROVED";
      
      var inboxSheet = ss.getSheetByName(TABS.LEAVE_INBOX);
      if (!inboxSheet) throw new Error("Leave inbox sheet not found");

      if (rowId <= 1 || rowId > inboxSheet.getLastRow()) {
        throw new Error("Invalid request row index: " + rowId);
      }

      if (senderRole === "MANAGER") {
        var applicantEmail = inboxSheet.getRange(rowId, 3).getValue().toString().toLowerCase().trim();
        var applicantBatch = "";
        for (var k = 1; k < dirData.length; k++) {
          if (dirData[k][2] && dirData[k][2].toString().toLowerCase().trim() === applicantEmail) {
            applicantBatch = dirData[k][3] ? dirData[k][3].toString().trim() : "";
            break;
          }
        }
        if (senderBatch !== applicantBatch) {
          throw new Error("Unauthorized: Cannot approve leaves for users outside your batch.");
        }
      }

      inboxSheet.getRange(rowId, 8).setValue(newStatus);
      responseData = { success: true };
    }

    // Action 6: Get Full Admin Dashboard Data (Restricted to ADMIN)
    else if (action === "getAdminDashboardData") {
      var dirSheet = ss.getSheetByName(TABS.DIRECTORY);
      if (!dirSheet) throw new Error("Directory sheet not found");

      var dirData = dirSheet.getDataRange().getValues();
      var senderRole = "EMPLOYEE";
      
      // Look up caller details
      for (var i = 1; i < dirData.length; i++) {
        if (dirData[i][2] && dirData[i][2].toString().toLowerCase().trim() === email.toLowerCase().trim()) {
          senderRole = getStandardizedRole(dirData[i][5]);
          break;
        }
      }

      if (senderRole !== "ADMIN") {
        throw new Error("Unauthorized: Admin dashboard access is restricted.");
      }

      // 1. Fetch Directory Users
      var users = [];
      for (var i = 1; i < dirData.length; i++) {
        if (dirData[i][2]) {
          users.push({
            empId: dirData[i][0],
            name: dirData[i][1],
            email: dirData[i][2],
            batch: dirData[i][3],
            targetHours: dirData[i][4],
            role: dirData[i][5] || "EMPLOYEE"
          });
        }
      }

      // 2. Fetch recent 100 RAW Logs
      var logs = [];
      var logsSheet = ss.getSheetByName(TABS.RAW_LOGS);
      if (logsSheet) {
        var logsData = logsSheet.getDataRange().getValues();
        var startRow = Math.max(1, logsData.length - 100);
        for (var j = logsData.length - 1; j >= startRow; j--) {
          if (logsData[j][1]) {
            logs.push({
              timestamp: logsData[j][0],
              email: logsData[j][1],
              type: logsData[j][2],
              location: logsData[j][3],
              note: logsData[j][4]
            });
          }
        }
      }

      // 3. Fetch Pending Leaves
      var pendingLeaves = [];
      var inboxSheet = ss.getSheetByName(TABS.LEAVE_INBOX);
      if (inboxSheet) {
        var inboxData = inboxSheet.getDataRange().getValues();
        for (var k = 1; k < inboxData.length; k++) {
          var status = inboxData[k][7] ? inboxData[k][7].toString().toUpperCase().trim() : "";
          if (status.indexOf("PENDING") !== -1 || status === "") {
            pendingLeaves.push({
              rowId: k + 1,
              date: inboxData[k][0],
              name: inboxData[k][1],
              email: inboxData[k][2],
              type: inboxData[k][3],
              amount: inboxData[k][4],
              reason: inboxData[k][5],
              rmName: inboxData[k][6],
              status: inboxData[k][7]
            });
          }
        }
      }

      responseData = {
        success: true,
        users: users,
        logs: logs,
        leaves: pendingLeaves,
        companyName: getCompanyName(),
        spreadsheetUrl: ss.getUrl()
      };
    }

    // Action 9: Get User Report Details (For Reports Screen)
    else if (action === "getUserReport") {
      var logsSheet = ss.getSheetByName(TABS.RAW_LOGS);
      var userLogs = [];
      var weekHours = 0.0;
      
      if (logsSheet) {
        var logsData = logsSheet.getDataRange().getValues();
        var rawUserLogs = [];
        for (var i = 1; i < logsData.length; i++) {
          if (logsData[i][1] && logsData[i][1].toString().toLowerCase().trim() === email.toLowerCase().trim()) {
            rawUserLogs.push({
              timestamp: logsData[i][0],
              type: logsData[i][2],
              note: logsData[i][4]
            });
          }
        }
        
        var limit = Math.min(rawUserLogs.length, 10);
        for (var j = rawUserLogs.length - 1; j >= rawUserLogs.length - limit; j--) {
          if (j >= 0) {
            var punchType = rawUserLogs[j].type.toString().toUpperCase();
            var punchStatus = "Completed";
            if (punchType === "START" || punchType === "RESUME") punchStatus = "Active";
            if (punchType === "BREAK") punchStatus = "On Break";
            
            userLogs.push({
              date: rawUserLogs[j].timestamp ? getFormattedDate(new Date(rawUserLogs[j].timestamp), "GMT") : "",
              type: punchType.toLowerCase(),
              status: punchStatus,
              hours: rawUserLogs[j].note || ""
            });
          }
        }

        var now = new Date();
        var startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())); // Sunday
        startOfWeek.setHours(0, 0, 0, 0);

        var weekMs = 0;
        var tempStart = null;
        
        var weekLogs = rawUserLogs.filter(function(log) {
          var logDate = new Date(log.timestamp);
          return logDate >= startOfWeek;
        });

        weekLogs.sort(function(a, b) {
          return new Date(a.timestamp) - new Date(b.timestamp);
        });

        for (var k = 0; k < weekLogs.length; k++) {
          var log = weekLogs[k];
          if (log.type === "START" || log.type === "RESUME") {
            tempStart = new Date(log.timestamp);
          } else if ((log.type === "BREAK" || log.type === "STOP") && tempStart) {
            weekMs += (new Date(log.timestamp) - tempStart);
            tempStart = null;
          }
        }
        if (tempStart) {
          weekMs += (new Date() - tempStart);
        }
        weekHours = weekMs / 3600000.0;
      }

      var leavesCount = 0;
      var inboxSheet = ss.getSheetByName(TABS.LEAVE_INBOX);
      if (inboxSheet) {
        var inboxData = inboxSheet.getDataRange().getValues();
        var currentMonth = new Date().getMonth();
        var currentYear = new Date().getFullYear();
        for (var l = 1; l < inboxData.length; l++) {
          var applicantEmail = inboxData[l][2] ? inboxData[l][2].toString().toLowerCase().trim() : "";
          if (applicantEmail === email.toLowerCase().trim() && inboxData[l][0]) {
            var reqDate = new Date(inboxData[l][0]);
            if (reqDate.getMonth() === currentMonth && reqDate.getFullYear() === currentYear) {
              var status = inboxData[l][7] ? inboxData[l][7].toString().toUpperCase().trim() : "";
              if (status.indexOf("APPROVED") !== -1) {
                var amount = parseFloat(inboxData[l][4] || 1);
                leavesCount += amount;
              }
            }
          }
        }
      }

      responseData = {
        success: true,
        logs: userLogs,
        weekHours: weekHours,
        leavesCount: leavesCount
      };
    }

    // Action 7: Add user to Directory (Restricted to ADMIN)
    else if (action === "addUser") {
      var dirSheet = ss.getSheetByName(TABS.DIRECTORY);
      if (!dirSheet) throw new Error("Directory sheet not found");

      var dirData = dirSheet.getDataRange().getValues();
      var senderRole = "EMPLOYEE";
      
      // Look up caller details
      for (var i = 1; i < dirData.length; i++) {
        if (dirData[i][2] && dirData[i][2].toString().toLowerCase().trim() === email.toLowerCase().trim()) {
          senderRole = getStandardizedRole(dirData[i][5]);
          break;
        }
      }

      if (senderRole !== "ADMIN") {
        throw new Error("Unauthorized to add directory users.");
      }

      var newUser = payload.newUser;
      if (!newUser || !newUser.email) {
        throw new Error("Missing new user email.");
      }

      // Check if user already exists
      for (var k = 1; k < dirData.length; k++) {
        if (dirData[k][2] && dirData[k][2].toString().toLowerCase().trim() === newUser.email.toLowerCase().trim()) {
          throw new Error("User with email " + newUser.email + " already exists in directory.");
        }
      }

      // Append to directory sheet
      dirSheet.appendRow([
        newUser.empId || "",
        newUser.name || "",
        newUser.email.trim(),
        newUser.batch || "General",
        newUser.targetHours || 8,
        newUser.role || "EMPLOYEE"
      ]);

      responseData = { success: true };
    }

    // Action 8: Delete user from Directory (Restricted to ADMIN)
    else if (action === "deleteUser") {
      var dirSheet = ss.getSheetByName(TABS.DIRECTORY);
      if (!dirSheet) throw new Error("Directory sheet not found");

      var dirData = dirSheet.getDataRange().getValues();
      var senderRole = "EMPLOYEE";
      
      // Look up caller details
      for (var i = 1; i < dirData.length; i++) {
        if (dirData[i][2] && dirData[i][2].toString().toLowerCase().trim() === email.toLowerCase().trim()) {
          senderRole = getStandardizedRole(dirData[i][5]);
          break;
        }
      }

      if (senderRole !== "ADMIN") {
        throw new Error("Unauthorized to delete directory users.");
      }

      var targetEmail = payload.targetEmail;
      if (!targetEmail) {
        throw new Error("Missing target email to delete.");
      }

      // Find and delete row
      var rowDeleted = false;
      for (var k = dirData.length - 1; k >= 1; k--) {
        if (dirData[k][2] && dirData[k][2].toString().toLowerCase().trim() === targetEmail.toLowerCase().trim()) {
          dirSheet.deleteRow(k + 1); // 1-indexed row is index + 1
          rowDeleted = true;
          break;
        }
      }

      if (!rowDeleted) {
        throw new Error("User not found in directory.");
      }

      responseData = { success: true };
    }
    
    else {
      throw new Error("Unknown action: " + action);
    }

  } catch (error) {
    responseData = { success: false, message: error.toString() };
  }

  // Return CORS-enabled JSON output
  return ContentService.createTextOutput(JSON.stringify(responseData))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- HELPERS ---

function getCompanyName() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var settingsSheet = ss.getSheetByName(TABS.SETTINGS);
    if (!settingsSheet) return "Keeptime Workspace";
    
    var data = settingsSheet.getDataRange().getValues();
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase().indexOf("company name") !== -1) {
        return data[i][1];
      }
    }
  } catch (e) {}
  return "Keeptime Workspace";
}

function getUserNameByEmail(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dirSheet = ss.getSheetByName(TABS.DIRECTORY);
  if (!dirSheet) return null;
  
  var data = dirSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][2] && data[i][2].toString().toLowerCase().trim() === email.toLowerCase().trim()) {
      return data[i][1];
    }
  }
  return null;
}

function getFormattedDate(date, tz) {
  tz = tz || "GMT";
  return Utilities.formatDate(date, tz, "yyyy-MM-dd");
}

// --- THE MIDNIGHT AUDITOR ENGINE ---
function runMidnightAuditor() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dirSheet = ss.getSheetByName(TABS.DIRECTORY);
  var logsSheet = ss.getSheetByName(TABS.RAW_LOGS);
  var settingsSheet = ss.getSheetByName(TABS.SETTINGS);
  var inboxSheet = ss.getSheetByName(TABS.LEAVE_INBOX);
  
  if (!dirSheet || !logsSheet || !settingsSheet || !inboxSheet) {
    Logger.log("Error: Mandatory sheets missing. Check Sheet configuration.");
    return;
  }
  
  // 1. Get Timezone and settings
  var timezone = "GMT";
  var settingsData = settingsSheet.getDataRange().getValues();
  var weekends = []; // indices of weekend days (0 = Sunday, 6 = Saturday)
  var holidays = []; // strings "YYYY-MM-DD"
  
  for (var i = 0; i < settingsData.length; i++) {
    var cell = settingsData[i][0] ? settingsData[i][0].toString().toLowerCase().trim() : "";
    if (cell.indexOf("timezone") !== -1) {
      timezone = settingsData[i][1] || "GMT";
    } else if (cell.indexOf("weekend") !== -1) {
      // Parse weekends (e.g. "Saturday, Sunday")
      var wStr = settingsData[i][1] ? settingsData[i][1].toString() : "";
      if (wStr.toLowerCase().indexOf("sunday") !== -1) weekends.push(0);
      if (wStr.toLowerCase().indexOf("monday") !== -1) weekends.push(1);
      if (wStr.toLowerCase().indexOf("tuesday") !== -1) weekends.push(2);
      if (wStr.toLowerCase().indexOf("wednesday") !== -1) weekends.push(3);
      if (wStr.toLowerCase().indexOf("thursday") !== -1) weekends.push(4);
      if (wStr.toLowerCase().indexOf("friday") !== -1) weekends.push(5);
      if (wStr.toLowerCase().indexOf("saturday") !== -1) weekends.push(6);
    } else if (cell.indexOf("holiday") !== -1 || settingsData[i][0] instanceof Date) {
      // Check column 0 or 1 for dates
      if (settingsData[i][0] instanceof Date) {
        holidays.push(getFormattedDate(settingsData[i][0], timezone));
      }
      if (settingsData[i][1] instanceof Date) {
        holidays.push(getFormattedDate(settingsData[i][1], timezone));
      }
    }
  }
  
  // 2. Determine Auditor Run Date (Today's date in local Timezone)
  var todayLocal = new Date();
  var todayStr = getFormattedDate(todayLocal, timezone);
  var dayOfWeek = todayLocal.getDay(); // 0-6 in GMT/local? Better to convert to local first
  
  // Convert dayOfWeek to local timezone
  var localDayString = Utilities.formatDate(todayLocal, timezone, "u"); // 1=Mon, 7=Sun
  var localDay = parseInt(localDayString);
  if (localDay === 7) localDay = 0; // standard 0=Sun
  else localDay = localDay;
  
  var isWeekend = weekends.indexOf(localDay) !== -1;
  var isHoliday = holidays.indexOf(todayStr) !== -1;
  var isExceptionDay = isWeekend || isHoliday;
  
  Logger.log("Auditor checking date: " + todayStr + " (Is Weekend: " + isWeekend + ", Is Holiday: " + isHoliday + ")");
  
  // 3. Load all directory users
  var dirData = dirSheet.getDataRange().getValues();
  var employees = [];
  for (var i = 1; i < dirData.length; i++) {
    if (dirData[i][2]) { // Email
      employees.push({
        empId: dirData[i][0],
        name: dirData[i][1],
        email: dirData[i][2],
        targetHoursStr: dirData[i][4] || "08:00"
      });
    }
  }
  
  // 4. Load all RAW_LOGS
  var rawLogsData = logsSheet.getDataRange().getValues();
  var todayLogs = [];
  
  for (var j = 1; j < rawLogsData.length; j++) {
    var tsStr = rawLogsData[j][0];
    if (!tsStr) continue;
    
    var logDate = new Date(tsStr);
    var logDateStr = getFormattedDate(logDate, timezone);
    
    if (logDateStr === todayStr) {
      todayLogs.push({
        timestamp: logDate.getTime(),
        email: rawLogsData[j][1],
        type: rawLogsData[j][2]
      });
    }
  }
  
  // Group logs by email
  var logsByUser = {};
  todayLogs.forEach(function(log) {
    if (!logsByUser[log.email]) logsByUser[log.email] = [];
    logsByUser[log.email].push(log);
  });
  
  // 5. Run Audit per Employee
  employees.forEach(function(emp) {
    var userLogs = logsByUser[emp.email] || [];
    userLogs.sort(function(a, b) { return a.timestamp - b.timestamp; });
    
    // Parse target hours to ms (e.g. "8h 00m" or "08:00")
    var targetMs = parseTargetHoursToMs(emp.targetHoursStr);
    
    // Calculate total worked time using Replay Logic
    var totalWorkedMs = calculateWorkedTime(userLogs);
    
    // Audit Logic
    if (isExceptionDay) {
      if (totalWorkedMs > 0) {
        var hoursWorked = (totalWorkedMs / (1000 * 60 * 60)).toFixed(2);
        inboxSheet.appendRow([
          todayStr, 
          emp.name, 
          emp.email, 
          "SYSTEM", 
          "Extra", 
          "SYSTEM FLAG: Worked " + hoursWorked + "h on Holiday (" + (isHoliday ? "Company Holiday" : "Weekend") + ")",
          "", 
          "⏳ Pending Review"
        ]);
        Logger.log("Exception Logged: " + emp.email + " worked on non-working day.");
      }
    } else {
      if (userLogs.length === 0) {
        inboxSheet.appendRow([
          todayStr, 
          emp.name, 
          emp.email, 
          "SYSTEM", 
          "Full", 
          "SYSTEM FLAG: No-Show / Did not clock in",
          "", 
          "⏳ Pending Review"
        ]);
        Logger.log("No-Show Logged: " + emp.email);
      } else {
        var workedRatio = totalWorkedMs / targetMs;
        var workedHours = (totalWorkedMs / (1000 * 60 * 60)).toFixed(2);
        var targetHours = (targetMs / (1000 * 60 * 60)).toFixed(2);
        
        if (workedRatio < 0.5) {
          inboxSheet.appendRow([
            todayStr, 
            emp.name, 
            emp.email, 
            "SYSTEM", 
            "Full", 
            "SYSTEM FLAG: Shortfall (Worked " + workedHours + "h of " + targetHours + "h)",
            "", 
            "⏳ Pending Review"
          ]);
          Logger.log("Shortfall (Full Leave) Logged: " + emp.email);
        } else if (workedRatio >= 0.5 && workedRatio < 1.0) {
          inboxSheet.appendRow([
            todayStr, 
            emp.name, 
            emp.email, 
            "SYSTEM", 
            "Half", 
            "SYSTEM FLAG: Shortfall (Worked " + workedHours + "h of " + targetHours + "h)",
            "", 
            "⏳ Pending Review"
          ]);
          Logger.log("Shortfall (Half Leave) Logged: " + emp.email);
        } else {
          Logger.log("Attendance Cleared: " + emp.email + " worked " + workedHours + "h.");
        }
      }
    }
  });
}

function parseTargetHoursToMs(targetStr) {
  // Handles formatting like "8h 00m", "4h 30m", "08:00", etc.
  var hours = 8;
  var minutes = 0;
  
  targetStr = targetStr.toString().toLowerCase().trim();
  
  if (targetStr.indexOf("h") !== -1) {
    var parts = targetStr.split("h");
    hours = parseFloat(parts[0]);
    if (parts[1]) {
      var minPart = parts[1].replace("m", "").trim();
      minutes = parseFloat(minPart) || 0;
    }
  } else if (targetStr.indexOf(":") !== -1) {
    var parts = targetStr.split(":");
    hours = parseFloat(parts[0]);
    minutes = parseFloat(parts[1]) || 0;
  } else {
    hours = parseFloat(targetStr) || 8;
  }
  
  return (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
}

function calculateWorkedTime(logs) {
  var totalWorkedMs = 0;
  var sessionStart = null;
  var breakStart = null;
  var sessionBreaks = 0;
  var currentStatus = "STOPPED";
  
  logs.forEach(function(log) {
    var time = log.timestamp;
    
    if (log.type === "START") {
      if (sessionStart === null) {
        sessionStart = time;
        sessionBreaks = 0;
        currentStatus = "WORKING";
      }
    } else if (log.type === "BREAK") {
      if (currentStatus === "WORKING") {
        breakStart = time;
        currentStatus = "ON BREAK";
      }
    } else if (log.type === "RESUME") {
      if (currentStatus === "ON BREAK" && breakStart) {
        var duration = time - breakStart;
        sessionBreaks += duration;
        breakStart = null;
        currentStatus = "WORKING";
      }
    } else if (log.type === "STOP") {
      if (sessionStart) {
        var duration = time - sessionStart - sessionBreaks;
        if (duration > 0) totalWorkedMs += duration;
        
        sessionStart = null;
        sessionBreaks = 0;
        breakStart = null;
        currentStatus = "STOPPED";
      }
    }
  });
  
  // If the employee is still clocked in at the time the auditor runs (11:59 PM),
  // we count the time until the auditor run (now).
  if (sessionStart) {
    var now = new Date().getTime();
    var duration = 0;
    if (currentStatus === "WORKING") {
      duration = now - sessionStart - sessionBreaks;
    } else if (currentStatus === "ON BREAK" && breakStart) {
      duration = breakStart - sessionStart - sessionBreaks;
    }
    if (duration > 0) totalWorkedMs += duration;
  }
  
  return totalWorkedMs;
}

/**
 * Ensures that necessary tabs exist in the Google Sheet and are formatted with headers.
 * Allows using a blank Google Sheet directly without a pre-made template copy.
 */
function initializeDatabase(ss) {
  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }
  function ensureSheet(tabName, headers) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    }
    return sheet;
  }
  
  ensureSheet(TABS.DIRECTORY, ["Employee ID", "Name", "Email", "Batch", "Target Hours", "Role"]);
  ensureSheet(TABS.RAW_LOGS, ["Timestamp", "Email", "Event Type", "Latitude", "Longitude", "Note", "Synced At"]);
  ensureSheet(TABS.LEAVE_INBOX, ["Timestamp", "Email", "Date", "Type", "Amount", "Reason", "RM Name", "Status"]);
  
  // Settings sheet
  var settingsSheet = ss.getSheetByName(TABS.SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(TABS.SETTINGS);
  }
  if (settingsSheet.getLastRow() === 0) {
    settingsSheet.appendRow(["Setting Key", "Setting Value"]);
    settingsSheet.getRange(1, 1, 1, 2).setFontWeight("bold");
    settingsSheet.appendRow(["Company Name", "Keeptime Workspace"]);
    settingsSheet.appendRow(["Weekends", "Saturday,Sunday"]);
    settingsSheet.appendRow(["Holidays", ""]);
  }
}

/**
 * Standardizes human-entered roles (e.g. Tutor, Student, Manager, Registrar)
 * into core system capabilities (ADMIN, MANAGER, EMPLOYEE).
 */
function getStandardizedRole(roleStr) {
  if (!roleStr) return "EMPLOYEE";
  var r = roleStr.toString().toLowerCase().trim();
  
  if (r === "admin" || r === "super admin" || r === "registrar" || r === "office") {
    return "ADMIN";
  }
  if (r === "manager" || r === "tutor" || r === "teacher" || r === "instructor" || r === "supervisor" || r === "team lead" || r === "team-lead") {
    return "MANAGER";
  }
  return "EMPLOYEE"; // Defaults to Employee/Student
}

