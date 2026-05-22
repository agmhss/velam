/**
 * app.js - Advanced Timetable, Exam & Substitution Engine
 * Features: Absolute Determinism, Combined Class Splitter, Global Part-Time Tagging
 */

// ========================================================================
// ⚙️ MASTER CONFIGURATION (Change only this block for other schools)
// ========================================================================
const APP_CONFIG = {
    fullName: "GHSS VELAMURITHANPETTAI",
    shortName: "GHSS VELAMURITHANPETTAI",
    scriptUrl: "https://script.google.com/macros/s/AKfycbwWlI-5iHo-lXoIeaSeHLs-jeI5sFxviEBSsJ3PS4AQJEN8ReoCG9xwpYKGJvYcMDPh/exec"
};
const SCRIPT_URL = APP_CONFIG.scriptUrl;

// --- Global Trackers ---
let generatedWeeklyTimetable = [];
const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
let currentSession = 'FN';
window.examDutyTracker = window.examDutyTracker || {};
window.subDutyTracker = window.subDutyTracker || {};
window.teacherWorkload = {};
window.teacherLevels = {};
window.teacherMaxGrade = {};
window.dailyExamTracker = {};
window.teacherPartTimeStatus = {}; // 🌟 NEW: ஆசிரியர்களின் நிரந்தர நேரக் கட்டுப்பாடு

function updateStatus(msg) {
    const indicator = document.getElementById('statusIndicator');
    if (indicator) indicator.innerText = msg;
}

// =========================================================
// 🌟 GLOBAL HELPERS
// =========================================================
function getGradeValue(clsStr) {
    let match = String(clsStr).toUpperCase().match(/^(\d+|LKG|UKG)/);
    if (!match) return -1;
    if (match[1] === 'LKG' || match[1] === 'UKG') return 0;
    return parseInt(match[1]);
}

function getTeacherCategory(gradeVal) {
    if (gradeVal === -1) return 'Unknown';
    if (gradeVal <= 5) return 'Primary';
    if (gradeVal <= 10) return 'High School';
    return 'Hr. Secondary';
}

function getIndividualClasses(classNameStr) {
    let parts = String(classNameStr).split('-');
    if (parts.length < 2) return [String(classNameStr).trim()];
    let grade = parts[0].trim();
    let sections = parts[1].split(/[&,]/);
    return sections.map(sec => `${grade}-${sec.trim()}`);
}

// 🌟 NEW: Global Part-Time Availability Checker
function isPartTimeTeacherAvailable(teacherName, sessionType) {
    let tName = String(teacherName).replace('⭐ ', '').trim();
    let status = window.teacherPartTimeStatus[tName] || 'FULL';
   
    if (status === 'MORNING' && sessionType === 'AN') return false;
    if (status === 'AFTERNOON' && sessionType === 'FN') return false;
   
    return true;
}

// --- UI EVENT LISTENERS & DYNAMIC UPDATES ---
document.addEventListener('DOMContentLoaded', () => {
    document.title = `${APP_CONFIG.shortName} - Timetable Engine`;
    const headerDisplay = document.getElementById('schoolNameDisplay');
    if(headerDisplay) headerDisplay.innerText = APP_CONFIG.fullName;

    const viewType = document.getElementById('viewType');
    const viewFilter = document.getElementById('viewFilter');
    const opMode = document.getElementById('opMode');
    const examGroup = document.getElementById('examPatternGroup');
    const subGroup = document.getElementById('substituteGroup');
    const dailyTools = document.getElementById('dailyToolsGroup');

    const dateInput = document.getElementById('workDate');
    if(dateInput) dateInput.valueAsDate = new Date();

    if(opMode) {
        opMode.addEventListener('change', (e) => {
            if(examGroup) examGroup.classList.add('hidden');
            if(subGroup) subGroup.classList.add('hidden');
            if(dailyTools) dailyTools.classList.add('hidden');
           
            if (e.target.value === 'exam') {
                if(examGroup) examGroup.classList.remove('hidden');
                if(dailyTools) dailyTools.classList.remove('hidden');
            }
            if (e.target.value === 'substitution') {
                if(subGroup) subGroup.classList.remove('hidden');
                if(dailyTools) dailyTools.classList.remove('hidden');
            }
        });
    }

    if(viewType && viewFilter) {
        viewType.addEventListener('change', (e) => {
            viewFilter.innerHTML = '';
            let options = new Set();
            if (e.target.value === 'class') {
                viewFilter.classList.remove('hidden');
                generatedWeeklyTimetable.forEach(slot => {
                    getIndividualClasses(slot.className).forEach(c => options.add(c));
                });
            } else if (e.target.value === 'teacher') {
                viewFilter.classList.remove('hidden');
                generatedWeeklyTimetable.forEach(slot => options.add(slot.teacherName.replace('⭐ ', '')));
            } else {
                viewFilter.classList.add('hidden');
            }
            Array.from(options).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).forEach(opt => {
                viewFilter.innerHTML += `<option value="${opt}">${opt}</option>`;
            });
        });
    }

    const sessionBtns = document.querySelectorAll('#btnFN, #btnAN');
    sessionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            sessionBtns.forEach(b => b.classList.remove('bg-white', 'shadow-sm', 'text-blue-700', 'font-bold'));
            sessionBtns.forEach(b => b.classList.add('text-gray-500', 'hover:bg-gray-200'));
            e.target.classList.remove('text-gray-500', 'hover:bg-gray-200');
            e.target.classList.add('bg-white', 'shadow-sm', 'text-blue-700', 'font-bold');
            currentSession = e.target.id.replace('btn', '');
            if (document.getElementById('opMode').value === 'exam') window.generateGrid();
        });
    });
});

function getSelectedDateStr() {
    const dateVal = document.getElementById('workDate')?.value;
    if (!dateVal) return "N/A";
    const d = new Date(dateVal);
    return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
}

window.generateGrid = function() {
    const mode = document.getElementById('opMode').value;
    if (mode === 'regular') renderRegularTimetable();
    else if (mode === 'exam') renderExamSchedule();
    else if (mode === 'substitution') renderSubstituteSchedule();
};

// --- CORE TIMETABLE GENERATOR ---
function generateAutoTimetable() {
    generatedWeeklyTimetable = [];
    let teacherAvail = {};
    let classAvail = {};
    let dailySubjectCount = {};
    let teacherSessionCount = {};

    if (!SCHOOL_CONFIG.assignments || SCHOOL_CONFIG.assignments.length === 0) return;

    SCHOOL_CONFIG.assignments.sort((a, b) => {
        if (a.isClassTeacher !== b.isClassTeacher) return a.isClassTeacher ? -1 : 1;
        let keyA = `${a.teacherName}-${a.className}-${a.subjectName}`;
        let keyB = `${b.teacherName}-${b.className}-${b.subjectName}`;
        return keyA.localeCompare(keyB);
    });

    const teachingPeriods = SCHOOL_CONFIG.regularTimings.filter(p => p.type === 'class');
    const firstPeriod = teachingPeriods[0];
   
    const fnPeriodLabels = teachingPeriods.slice(0, 4).map(p => p.label);
    const anPeriodLabels = teachingPeriods.slice(4, 8).map(p => p.label);

    // Phase 1: Class Teachers Locked to Period 1
    SCHOOL_CONFIG.assignments.forEach(req => {
        req.assignedCount = 0;
        if (req.isClassTeacher && firstPeriod) {
            let isFN = fnPeriodLabels.includes(firstPeriod.label);
            let sessionType = isFN ? 'FN' : 'AN';
           
            if (!isPartTimeTeacherAvailable(req.teacherName, sessionType)) return;
           
            let indClasses = getIndividualClasses(req.className);
            for (let day of daysOfWeek) {
                let timeKey = `${day}-${firstPeriod.label}`;
                let isClassBusy = indClasses.some(cls => classAvail[cls]?.[timeKey]);
                if (!teacherAvail[req.teacherName]?.[timeKey] && !isClassBusy) {
                    generatedWeeklyTimetable.push({
                        day: day, period: firstPeriod.label, time: `${firstPeriod.start} - ${firstPeriod.end}`,
                        className: req.className, subjectName: req.subjectName, teacherName: `⭐ ${req.teacherName}`
                    });
                   
                    if (!teacherAvail[req.teacherName]) teacherAvail[req.teacherName] = {};
                    teacherAvail[req.teacherName][timeKey] = true;
                   
                    indClasses.forEach(cls => {
                        if (!classAvail[cls]) classAvail[cls] = {};
                        classAvail[cls][timeKey] = true;
                    });
                   
                    if (!teacherSessionCount[req.teacherName]) teacherSessionCount[req.teacherName] = {};
                    if (!teacherSessionCount[req.teacherName][day]) teacherSessionCount[req.teacherName][day] = { FN: 0, AN: 0 };
                    if (isFN) teacherSessionCount[req.teacherName][day].FN++;
                   
                    req.assignedCount++;
                }
            }
        }
    });

    // Phase 2: Distribute Remaining Periods (Max 2 same subject per day rule REMOVED)
    SCHOOL_CONFIG.assignments.forEach(req => {
        let remainingPeriods = req.periodsPerWeek - req.assignedCount;
        let indClasses = getIndividualClasses(req.className);

        for (let i = 0; i < remainingPeriods; i++) {
            let placed = false;
            let preferredDayIndex = (i + req.assignedCount) % 5;
            let attemptLimits = [true, false];
           
            for (let strictMode of attemptLimits) {
                for (let d = 0; d < 5; d++) {
                    let checkDayIndex = (preferredDayIndex + d) % 5;
                    let checkDay = daysOfWeek[checkDayIndex];
                   
                    for (let period of SCHOOL_CONFIG.regularTimings) {
                        if (period.type === 'break' || period.type === 'fixed') continue;
                        if (!req.isClassTeacher && period.label === firstPeriod.label) continue;

                        let isFN = fnPeriodLabels.includes(period.label);
                        let isAN = anPeriodLabels.includes(period.label);
                        let sessionType = isFN ? 'FN' : 'AN';

                        if (!isPartTimeTeacherAvailable(req.teacherName, sessionType)) continue;

                        let timeKey = `${checkDay}-${period.label}`;
                        let isClassBusy = indClasses.some(cls => classAvail[cls]?.[timeKey]);
                       
                        if (!teacherAvail[req.teacherName]?.[timeKey] && !isClassBusy) {
                           
                            // === MAX 2 SAME SUBJECT PER DAY RULE REMOVED ===
                           
                            if (!teacherSessionCount[req.teacherName]) teacherSessionCount[req.teacherName] = {};
                            if (!teacherSessionCount[req.teacherName][checkDay]) teacherSessionCount[req.teacherName][checkDay] = { FN: 0, AN: 0 };
                            let counts = teacherSessionCount[req.teacherName][checkDay];
                           
                            if (strictMode) {
                                if (isFN && counts.FN >= 3) continue;
                                if (isAN && counts.AN >= 3) continue;
                            }
                           
                            generatedWeeklyTimetable.push({
                                day: checkDay, period: period.label, time: `${period.start} - ${period.end}`,
                                className: req.className, subjectName: req.subjectName, teacherName: req.teacherName
                            });
                           
                            if (!teacherAvail[req.teacherName]) teacherAvail[req.teacherName] = {};
                            teacherAvail[req.teacherName][timeKey] = true;
                           
                            indClasses.forEach(cls => {
                                if (!classAvail[cls]) classAvail[cls] = {};
                                classAvail[cls][timeKey] = true;
                            });

                            // Maintain counter (but no longer enforce limit)
                            if (!dailySubjectCount[req.className]) dailySubjectCount[req.className] = {};
                            if (!dailySubjectCount[req.className][checkDay]) dailySubjectCount[req.className][checkDay] = {};
                            dailySubjectCount[req.className][checkDay][req.subjectName] = (dailySubjectCount[req.className][checkDay][req.subjectName] || 0) + 1;
                           
                            if (isFN) counts.FN++;
                            if (isAN) counts.AN++;
                           
                            req.assignedCount++;
                            placed = true;
                            break;
                        }
                    }
                    if (placed) break;
                }
                if (placed) break;
            }
        }
    });

    // 📊 NEW: Generation Summary Report (Console + UI)
    console.log("📊 TIMETABLE GENERATION SUMMARY:");
    let totalRequired = 0;
    let totalPlaced = 0;
    let summary = [];

    SCHOOL_CONFIG.assignments.forEach(req => {
        const required = req.periodsPerWeek;
        const placed = req.assignedCount;
        totalRequired += required;
        totalPlaced += placed;
       
        const status = placed === required ? "✅" : (placed > 0 ? "⚠️" : "❌");
        const teacherName = req.teacherName.replace('⭐ ', '');
        summary.push(`${status} ${teacherName} - ${req.subjectName} (${req.className}): ${placed}/${required}`);
    });

    summary.sort().forEach(line => console.log(line));
    console.log(`\nTotal: ${totalPlaced}/${totalRequired} periods placed (${Math.round(totalPlaced/totalRequired*100)}%)`);

    // Show summary on UI
    showGenerationSummary();
}

// === NEW: UI Summary Panel Function ===
function showGenerationSummary() {
    const panel = document.getElementById('summaryPanel');
    const content = document.getElementById('summaryContent');
    if (!panel || !content) return;

    let html = '';
    let totalRequired = 0;
    let totalPlaced = 0;

    SCHOOL_CONFIG.assignments.forEach(req => {
        const required = req.periodsPerWeek;
        const placed = req.assignedCount || 0;
        totalRequired += required;
        totalPlaced += placed;

        const percent = Math.round((placed / required) * 100);
        const status = placed === required ? '✅' : (placed > required * 0.7 ? '⚠️' : '❌');

        html += `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div class="font-medium text-gray-700">${req.teacherName.replace('⭐ ','')}</div>
                <div class="text-right">
                    <span class="font-bold ${placed === required ? 'text-emerald-600' : 'text-amber-600'}">
                        ${placed}/${required}
                    </span>
                    <span class="text-xs ml-2 text-gray-500">(${percent}%)</span>
                </div>
            </div>`;
    });

    const overallPercent = totalRequired > 0 ? Math.round((totalPlaced / totalRequired) * 100) : 0;
    html = `
        <div class="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div class="flex justify-between font-bold text-emerald-800">
                <span>Overall Completion</span>
                <span>${totalPlaced}/${totalRequired} (${overallPercent}%)</span>
            </div>
        </div>
        ${html}
    `;

    content.innerHTML = html;
    panel.classList.remove('hidden');
}

// --- RENDER 1: REGULAR TIMETABLE ---
function renderRegularTimetable() {
    const mainGrid = document.getElementById('mainGrid');
    const viewType = document.getElementById('viewType')?.value || 'all';
    const filterVal = document.getElementById('viewFilter')?.value || '';

    if (generatedWeeklyTimetable.length === 0) {
        mainGrid.innerHTML = `<div class="text-red-500 font-bold p-4">No data generated. Click Sync Data first!</div>`;
        return;
    }

    if (viewType === 'all') {
        mainGrid.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-gray-500 py-20">
            <i data-lucide="grid" class="w-12 h-12 mb-2 opacity-30"></i>
            <p class="text-lg">Please select <b>By Class</b> or <b>By Teacher</b> to view the Grid.</p>
        </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const teachingPeriods = SCHOOL_CONFIG.regularTimings.filter(p => p.type === 'class');
    let html = `<div class="overflow-x-auto"><table id="scheduleTable" class="w-full text-center border-collapse min-w-[800px] bg-white text-sm"><thead class="bg-blue-100 text-blue-900"><tr><th class="p-3 border border-blue-200 text-left w-24">Day</th>`;
   
    teachingPeriods.forEach((p, index) => { html += `<th class="p-3 border border-blue-200"><div class="font-bold text-lg">${index + 1}</div></th>`; });
    html += `</tr></thead><tbody>`;

    let displayData = [];
    if (viewType === 'class') {
        displayData = generatedWeeklyTimetable.filter(d => getIndividualClasses(d.className).includes(filterVal));
    } else if (viewType === 'teacher') {
        displayData = generatedWeeklyTimetable.filter(d => d.teacherName.replace('⭐ ', '') === filterVal);
    }

    daysOfWeek.forEach(day => {
        html += `<tr><td class="p-3 border border-gray-200 font-bold text-gray-700 bg-gray-50 text-left">${day}</td>`;
        teachingPeriods.forEach(period => {
            let slot = displayData.find(d => d.day === day && d.period === period.label);
            if (slot) {
                let cellText = viewType === 'class'
                    ? `<span class="font-semibold text-gray-800">${slot.subjectName}</span><br><span class="text-xs text-blue-600 font-bold">${slot.teacherName.replace('⭐ ', '')}</span>`
                    : `<span class="font-bold text-green-700">${slot.className}</span><br><span class="text-xs text-gray-600">${slot.subjectName}</span>`;
                html += `<td class="p-2 border border-gray-200 hover:bg-blue-50 transition-colors align-middle leading-tight">${cellText}</td>`;
            } else {
                html += `<td class="p-2 border border-gray-200 text-gray-300 bg-gray-50/30">-</td>`;
            }
        });
        html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    mainGrid.innerHTML = html;
    updateStatus(`Showing Grid for: ${filterVal}`);
}

// --- RENDER 2: EXAM SCHEDULE ---
// (Rest of your original renderExamSchedule, renderSubstituteSchedule, syncFromCloud, etc. remain unchanged)
function renderExamSchedule() {
    // ... [Your original code for renderExamSchedule - unchanged] ...
    // (I kept it short here to save space. Paste your original function)
}

function renderSubstituteSchedule() {
    // ... [Your original code for renderSubstituteSchedule - unchanged] ...
}

function populateAbsentTeachersList() {
    // ... [Your original code - unchanged] ...
}

window.syncFromCloud = async function() {
    // ... [Your original code - unchanged] ...
};

window.saveDutiesToCloud = async function() {
    // ... [Your original code - unchanged] ...
};

window.exportPDF = function() {
    // ... [Your original code - unchanged] ...
};
