/**
 * app.js - Advanced Timetable, Exam & Substitution Engine
 * Features: Absolute Determinism, Combined Class Splitter, Global Part-Time Tagging
 */

// ========================================================================
// MASTER CONFIGURATION
// ========================================================================
const APP_CONFIG = {
    fullName: "GHSS VELAMURITHANPETTAI",
    shortName: "GHSS VELAMURITHANPETTAI",
    scriptUrl: "https://script.google.com/macros/s/AKfycbxhbfj-RiHOmidh0opQmct7W1x-HPXvV0szc1x5QcdbeNZ3BZYx_YvPqRqyrYmI7BzA/exec"
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
window.teacherPartTimeStatus = {};

// SCHOOL_CONFIG (Required)
const SCHOOL_CONFIG = {
    regularTimings: [
        { label: '1', start: '09:30', end: '10:10', type: 'class' },
        { label: '2', start: '10:10', end: '10:50', type: 'class' },
        { label: 'Break', start: '10:50', end: '11:00', type: 'break' },
        { label: '3', start: '11:00', end: '11:40', type: 'class' },
        { label: '4', start: '11:40', end: '12:20', type: 'class' },
        { label: 'Lunch', start: '12:20', end: '13:00', type: 'break' },
        { label: '5', start: '13:00', end: '13:40', type: 'class' },
        { label: '6', start: '13:40', end: '14:20', type: 'class' },
        { label: 'Break', start: '14:20', end: '14:30', type: 'break' },
        { label: '7', start: '14:30', end: '15:10', type: 'class' },
        { label: '8', start: '15:10', end: '15:50', type: 'class' }
    ],
    assignments: []
};

// =========================================================
// GLOBAL HELPERS
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

function isPartTimeTeacherAvailable(teacherName, sessionType) {
    let tName = String(teacherName).replace('⭐ ', '').trim();
    let status = window.teacherPartTimeStatus[tName] || 'FULL';
    if (status === 'MORNING' && sessionType === 'AN') return false;
    if (status === 'AFTERNOON' && sessionType === 'FN') return false;
    return true;
}

function updateStatus(msg) {
    const indicator = document.getElementById('statusIndicator');
    if (indicator) indicator.innerText = msg;
}

// --- UI EVENT LISTENERS ---
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

// --- CORE TIMETABLE GENERATOR (Aggressive) ---
function generateAutoTimetable() {
    generatedWeeklyTimetable = [];
    let teacherAvail = {};
    let classAvail = {};
    let dailySubjectCount = {};
    let teacherSessionCount = {};

    if (!SCHOOL_CONFIG.assignments || SCHOOL_CONFIG.assignments.length === 0) {
        updateStatus("No assignment data!");
        return;
    }

    SCHOOL_CONFIG.assignments.sort((a, b) => {
        if (a.isClassTeacher !== b.isClassTeacher) return a.isClassTeacher ? -1 : 1;
        return (b.periodsPerWeek - a.periodsPerWeek);
    });

    const teachingPeriods = SCHOOL_CONFIG.regularTimings.filter(p => p.type === 'class');
    const firstPeriod = teachingPeriods[0];
    const fnPeriodLabels = teachingPeriods.slice(0, 4).map(p => p.label);
    const anPeriodLabels = teachingPeriods.slice(4, 8).map(p => p.label);

    // Phase 1: Class Teachers
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
                        day, period: firstPeriod.label, time: `${firstPeriod.start} - ${firstPeriod.end}`,
                        className: req.className, subjectName: req.subjectName, teacherName: `⭐ ${req.teacherName}`
                    });
                    teacherAvail[req.teacherName] = teacherAvail[req.teacherName] || {};
                    teacherAvail[req.teacherName][timeKey] = true;
                    indClasses.forEach(cls => {
                        classAvail[cls] = classAvail[cls] || {};
                        classAvail[cls][timeKey] = true;
                    });
                    teacherSessionCount[req.teacherName] = teacherSessionCount[req.teacherName] || {};
                    teacherSessionCount[req.teacherName][day] = teacherSessionCount[req.teacherName][day] || { FN: 0, AN: 0 };
                    if (isFN) teacherSessionCount[req.teacherName][day].FN++;
                    req.assignedCount++;
                }
            }
        }
    });

    // 🔥 Aggressive Phase 2
    SCHOOL_CONFIG.assignments.forEach(req => {
        let remaining = req.periodsPerWeek - req.assignedCount;
        if (remaining <= 0) return;
        let indClasses = getIndividualClasses(req.className);

        for (let i = 0; i < remaining; i++) {
            let placed = false;
            for (let day of daysOfWeek) {
                for (let period of SCHOOL_CONFIG.regularTimings) {
                    if (period.type === 'break' || period.type === 'fixed') continue;
                    if (!req.isClassTeacher && period.label === firstPeriod.label) continue;

                    let isFN = fnPeriodLabels.includes(period.label);
                    let sessionType = isFN ? 'FN' : 'AN';
                    if (!isPartTimeTeacherAvailable(req.teacherName, sessionType)) continue;

                    let timeKey = `${day}-${period.label}`;
                    let isClassBusy = indClasses.some(cls => classAvail[cls]?.[timeKey]);
                    if (teacherAvail[req.teacherName]?.[timeKey] || isClassBusy) continue;

                    if (!teacherSessionCount[req.teacherName]) teacherSessionCount[req.teacherName] = {};
                    if (!teacherSessionCount[req.teacherName][day]) teacherSessionCount[req.teacherName][day] = { FN: 0, AN: 0 };
                    let counts = teacherSessionCount[req.teacherName][day];

                    if (counts.FN + counts.AN >= 12) continue;
                    if (isFN && counts.FN >= 7) continue;
                    if (isAN && counts.AN >= 7) continue;

                    generatedWeeklyTimetable.push({
                        day, period: period.label, time: `${period.start} - ${period.end}`,
                        className: req.className, subjectName: req.subjectName, teacherName: req.teacherName
                    });

                    teacherAvail[req.teacherName] = teacherAvail[req.teacherName] || {};
                    teacherAvail[req.teacherName][timeKey] = true;

                    indClasses.forEach(cls => {
                        classAvail[cls] = classAvail[cls] || {};
                        classAvail[cls][timeKey] = true;
                    });

                    counts.FN += isFN ? 1 : 0;
                    counts.AN += isAN ? 1 : 0;
                    req.assignedCount++;
                    placed = true;
                    break;
                }
                if (placed) break;
            }
            if (!placed) {
                console.warn(`❌ FAILED: ${req.teacherName} - ${req.subjectName} (${req.className})`);
            }
        }
    });

    // Summary
    let totalRequired = 0, totalPlaced = 0;
    let summary = [];
    SCHOOL_CONFIG.assignments.forEach(req => {
        const required = req.periodsPerWeek;
        const placed = req.assignedCount || 0;
        totalRequired += required;
        totalPlaced += placed;
        const status = placed === required ? "✅" : "⚠️";
        summary.push(`${status} ${req.teacherName.replace('⭐ ','')} - ${req.subjectName} (${req.className}): ${placed}/${required}`);
    });

    summary.sort().forEach(line => console.log(line));
    console.log(`\nTotal: ${totalPlaced}/${totalRequired} (${Math.round(totalPlaced/totalRequired*100)}%)`);

    showGenerationSummary();
}

function showGenerationSummary() {
    const panel = document.getElementById('summaryPanel');
    const content = document.getElementById('summaryContent');
    if (!panel || !content) return;

    let html = '';
    let totalRequired = 0, totalPlaced = 0;

    SCHOOL_CONFIG.assignments.forEach(req => {
        const required = req.periodsPerWeek;
        const placed = req.assignedCount || 0;
        totalRequired += required;
        totalPlaced += placed;
        const percent = Math.round((placed / required) * 100);
        html += `
            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                <div class="font-medium text-gray-700">${req.teacherName.replace('⭐ ','')}</div>
                <div class="text-right">
                    <span class="font-bold ${placed === required ? 'text-emerald-600' : 'text-amber-600'}">${placed}/${required}</span>
                    <span class="text-xs ml-2 text-gray-500">(${percent}%)</span>
                </div>
            </div>`;
    });

    const overall = totalRequired > 0 ? Math.round((totalPlaced / totalRequired) * 100) : 0;
    html = `<div class="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg font-bold">Overall: ${totalPlaced}/${totalRequired} (${overall}%)</div>` + html;

    content.innerHTML = html;
    panel.classList.remove('hidden');
}

// --- RENDER FUNCTIONS ---
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

// (Add your original renderExamSchedule, renderSubstituteSchedule, populateAbsentTeachersList, saveDutiesToCloud, exportPDF functions here if you have them)

window.syncFromCloud = async function() {
    updateStatus("Downloading Sheets...");
    try {
        const response = await fetch(SCRIPT_URL);
        const cloudData = await response.json();

        window.subDutyTracker = {};
        if (cloudData.tracker && cloudData.tracker.length > 1) {
            cloudData.tracker.slice(1).forEach(row => {
                let tName = String(row[0]).trim();
                window.subDutyTracker[tName] = parseInt(row[1]) || 0;
            });
        }

        SCHOOL_CONFIG.assignments = [];
        window.teacherWorkload = {};
        window.teacherMaxGrade = {};
        let tempTeacherSubjects = {};

        if (cloudData.assignments && cloudData.assignments.length > 1) {
            cloudData.assignments.slice(1).forEach(row => {
                let teacherName = String(row[0] || '').trim();
                if (!teacherName) return;

                let sub1 = String(row[1] || '').trim();
                let cls1 = String(row[2] || '').trim();
                let sec1 = String(row[3] || '').trim();
                let per1 = parseInt(row[4]);
                let isCT = String(row[5] || '').trim().toLowerCase() === 'yes';

                if (!tempTeacherSubjects[teacherName]) tempTeacherSubjects[teacherName] = [];
                if (sub1) tempTeacherSubjects[teacherName].push(sub1.toUpperCase());

                if (cls1 && !isNaN(per1) && per1 > 0) {
                    SCHOOL_CONFIG.assignments.push({
                        teacherName: teacherName,
                        subjectName: sub1,
                        className: cls1 + "-" + sec1,
                        periodsPerWeek: per1,
                        isClassTeacher: isCT
                    });
                    window.teacherWorkload[teacherName] = (window.teacherWorkload[teacherName] || 0) + per1;
                    let gVal1 = getGradeValue(cls1);
                    window.teacherMaxGrade[teacherName] = Math.max((window.teacherMaxGrade[teacherName] || 0), gVal1);
                }

                for (let i = 6; i < row.length; i += 4) {
                    let subN = String(row[i] || '').trim();
                    let clsN = String(row[i+1] || '').trim();
                    let secN = String(row[i+2] || '').trim();
                    let perN = parseInt(row[i+3]);
                    if (!clsN || clsN.toLowerCase() === 'total load') break;

                    let actualSubN = subN ? subN : sub1;
                    if (actualSubN) tempTeacherSubjects[teacherName].push(actualSubN.toUpperCase());

                    if (!isNaN(perN) && perN > 0) {
                        SCHOOL_CONFIG.assignments.push({
                            teacherName: teacherName,
                            subjectName: actualSubN,
                            className: clsN + "-" + secN,
                            periodsPerWeek: perN,
                            isClassTeacher: false
                        });
                        window.teacherWorkload[teacherName] = (window.teacherWorkload[teacherName] || 0) + perN;
                        let gValN = getGradeValue(clsN);
                        window.teacherMaxGrade[teacherName] = Math.max((window.teacherMaxGrade[teacherName] || 0), gValN);
                    }
                }
            });

            window.teacherLevels = {};
            window.teacherPartTimeStatus = {};
            for (let t in window.teacherMaxGrade) {
                window.teacherLevels[t] = getTeacherCategory(window.teacherMaxGrade[t]);
                window.teacherPartTimeStatus[t] = 'FULL';
            }

            updateStatus("Generating Schedule...");
            generateAutoTimetable();
            populateAbsentTeachersList();
            window.generateGrid();
        }
    } catch (error) {
        console.error("Sync Error:", error);
        updateStatus("Sync Failed! Check Internet / Script URL");
    }
};

// Add your remaining functions (renderExamSchedule, renderSubstituteSchedule, etc.) here if needed
// For now, this should get Sync working and timetable generating.

console.log("App.js loaded successfully");
