/**
 * app.js - Advanced Timetable, Exam & Substitution Engine
 * Features: Master Config (White-labeling), Level Segregation, Fallback Search, Strict Equal Duty
 */

// ========================================================================
// ⚙️ MASTER CONFIGURATION (Change only this block for other schools)
// ========================================================================
const APP_CONFIG = {
    fullName: "XYZ School", 
    shortName: "XYZ SCHOOL",                                           
    scriptUrl: "https://script.google.com/macros/s/AKfycbyJfcbZpYU1gBylfCZrfzVoOs3Ru3TA32ic8_jyB10wYsObvEOBFXmnN5R8xL1InpP51A/exec" 
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
window.dailyExamTracker = {}; // NEW: ஒரு நாளுக்கு ஒரு டியூட்டி என்பதை உறுதி செய்யும் நினைவகம்

function updateStatus(msg) {
    const indicator = document.getElementById('statusIndicator');
    if (indicator) indicator.innerText = msg;
}

// --- HELPERS: LEVEL CLASSIFICATION ---
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

// --- UI EVENT LISTENERS & DYNAMIC UPDATES ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Dynamic Webpage Title & Header
    document.title = `${APP_CONFIG.shortName} - Timetable Engine`;
    const headerDisplay = document.getElementById('schoolNameDisplay');
    if(headerDisplay) headerDisplay.innerText = APP_CONFIG.fullName;

    // 2. UI Elements
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
                generatedWeeklyTimetable.forEach(slot => options.add(slot.className));
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

// --- CORE TIMETABLE GENERATOR (With Smart Session Balancing) ---
function generateAutoTimetable() {
    generatedWeeklyTimetable = []; 
    let teacherAvail = {};
    let classAvail = {};
    let dailySubjectCount = {}; 
    let teacherSessionCount = {}; // NEW: காலை மற்றும் மதிய பீரியட் கணக்கீடு

    if (!SCHOOL_CONFIG.assignments || SCHOOL_CONFIG.assignments.length === 0) return;
    const teachingPeriods = SCHOOL_CONFIG.regularTimings.filter(p => p.type === 'class');
    const firstPeriod = teachingPeriods[0];
    
    // காலை (FN) மற்றும் மதியம் (AN) எவை என்பதை வரையறுத்தல்
    const fnPeriodLabels = teachingPeriods.slice(0, 4).map(p => p.label);
    const anPeriodLabels = teachingPeriods.slice(4, 8).map(p => p.label);

    // Phase 1: Class Teachers Locked to Period 1
    SCHOOL_CONFIG.assignments.forEach(req => {
        req.assignedCount = 0; 
        if (req.isClassTeacher && firstPeriod) {
            for (let day of daysOfWeek) {
                let timeKey = `${day}-${firstPeriod.label}`;
                if (!teacherAvail[req.teacherName]?.[timeKey] && !classAvail[req.className]?.[timeKey]) {
                    generatedWeeklyTimetable.push({
                        day: day, period: firstPeriod.label, time: `${firstPeriod.start} - ${firstPeriod.end}`,
                        className: req.className, subjectName: req.subjectName, teacherName: `⭐ ${req.teacherName}`
                    });
                    if (!teacherAvail[req.teacherName]) teacherAvail[req.teacherName] = {};
                    teacherAvail[req.teacherName][timeKey] = true;
                    if (!classAvail[req.className]) classAvail[req.className] = {};
                    classAvail[req.className][timeKey] = true;
                    
                    // Session Tracker-ல் பதிவு செய்தல்
                    if (!teacherSessionCount[req.teacherName]) teacherSessionCount[req.teacherName] = {};
                    if (!teacherSessionCount[req.teacherName][day]) teacherSessionCount[req.teacherName][day] = { FN: 0, AN: 0 };
                    if (fnPeriodLabels.includes(firstPeriod.label)) teacherSessionCount[req.teacherName][day].FN++;
                    
                    req.assignedCount++;
                }
            }
        }
    });

    // Phase 2: Distribute Remaining Periods (With Smart Spread)
    SCHOOL_CONFIG.assignments.forEach(req => {
        let remainingPeriods = req.periodsPerWeek - req.assignedCount;
        for (let i = 0; i < remainingPeriods; i++) {
            let placed = false;
            let preferredDayIndex = (i + req.assignedCount) % 5; 
            
            // முதல் சுற்றில் Strict விதியையும், இடமில்லையென்றால் தளர்வு விதியையும் (Fallback) பயன்படுத்தும் லாஜிக்
            let attemptLimits = [true, false]; 
            
            for (let strictMode of attemptLimits) {
                for (let d = 0; d < 5; d++) {
                    let checkDayIndex = (preferredDayIndex + d) % 5;
                    let checkDay = daysOfWeek[checkDayIndex];
                    
                    for (let period of SCHOOL_CONFIG.regularTimings) {
                        if (period.type === 'break' || period.type === 'fixed') continue; 
                        let timeKey = `${checkDay}-${period.label}`;
                        
                        if (!teacherAvail[req.teacherName]?.[timeKey] && !classAvail[req.className]?.[timeKey]) {
                            let countToday = dailySubjectCount[req.className]?.[checkDay]?.[req.subjectName] || 0;
                            if (countToday >= 2) continue; 
                            
                            // --- SMART SESSION LIMIT LOGIC ---
                            let isFN = fnPeriodLabels.includes(period.label);
                            let isAN = anPeriodLabels.includes(period.label);
                            
                            if (!teacherSessionCount[req.teacherName]) teacherSessionCount[req.teacherName] = {};
                            if (!teacherSessionCount[req.teacherName][checkDay]) teacherSessionCount[req.teacherName][checkDay] = { FN: 0, AN: 0 };
                            
                            let counts = teacherSessionCount[req.teacherName][checkDay];
                            
                            // Strict Mode: காலையில் அதிகபட்சம் 3, மதியத்தில் அதிகபட்சம் 3
                            if (strictMode) {
                                if (isFN && counts.FN >= 3) continue; // காலையில் கட்டாயம் 1 Free Period வேண்டும்
                                if (isAN && counts.AN >= 3) continue; // மதியத்திலும் கட்டாயம் 1 Free Period வேண்டும்
                            }
                            // ----------------------------------
                            
                            generatedWeeklyTimetable.push({
                                day: checkDay, period: period.label, time: `${period.start} - ${period.end}`,
                                className: req.className, subjectName: req.subjectName, teacherName: req.teacherName
                            });
                            
                            if (!teacherAvail[req.teacherName]) teacherAvail[req.teacherName] = {};
                            teacherAvail[req.teacherName][timeKey] = true;
                            if (!classAvail[req.className]) classAvail[req.className] = {};
                            classAvail[req.className][timeKey] = true;
                            if (!dailySubjectCount[req.className]) dailySubjectCount[req.className] = {};
                            if (!dailySubjectCount[req.className][checkDay]) dailySubjectCount[req.className][checkDay] = {};
                            dailySubjectCount[req.className][checkDay][req.subjectName] = countToday + 1;
                            
                            if (isFN) counts.FN++;
                            if (isAN) counts.AN++;
                            
                            req.assignedCount++;
                            placed = true;
                            break; 
                        }
                    }
                    if (placed) break; 
                }
                if (placed) break; // இடம் கிடைத்துவிட்டால் தளர்வு விதி லூப்பை (strictMode) விட்டு வெளியேற வேண்டும்
            }
            
            if (!placed) {
                console.warn(`Warning: Could not find a free slot for ${req.subjectName} in ${req.className}.`);
            }
        }
    });
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

    let displayData = generatedWeeklyTimetable;
    if (viewType === 'class') displayData = generatedWeeklyTimetable.filter(d => d.className === filterVal);
    else if (viewType === 'teacher') displayData = generatedWeeklyTimetable.filter(d => d.teacherName.replace('⭐ ', '') === filterVal);

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

// --- RENDER 2: EXAM SCHEDULE (With One-Duty-Per-Day Logic) ---
function renderExamSchedule() {
    const pattern = document.getElementById('patternSelect').value;
    const activeGrades = SCHOOL_CONFIG.examPatterns[pattern][currentSession];
    const examData = SCHOOL_CONFIG.examSettings[currentSession];
    const mainGrid = document.getElementById('mainGrid');
    const selectedDate = getSelectedDateStr();

    // =========================================================
    // 🌟 NEW: DAILY SESSION TRACKER LOGIC
    // =========================================================
    // இந்தத் தேதிக்கு நினைவகம் இல்லையென்றால் புதிதாக உருவாக்கு
    if (!window.dailyExamTracker[selectedDate]) {
        window.dailyExamTracker[selectedDate] = { FN: [], AN: [] };
    }
    
    // Process பட்டனை மீண்டும் அழுத்தினால் கணக்கு இரட்டிப்பாகாமல் இருக்க இதை Reset செய்கிறோம்
    window.dailyExamTracker[selectedDate][currentSession] = [];

    // தற்போதைய செஷனுக்கு எதிரான செஷன் எது? (FN என்றால் AN, AN என்றால் FN)
    const oppositeSession = currentSession === 'FN' ? 'AN' : 'FN';
    
    // இன்று மாற்று செஷனில் டியூட்டி பார்த்த ஆசிரியர்களின் பட்டியல்
    const busyInOtherSession = window.dailyExamTracker[selectedDate][oppositeSession];
    // =========================================================

    const absentCheckboxes = document.querySelectorAll('.absent-chk:checked');
    const absentTeachers = Array.from(absentCheckboxes).map(cb => cb.value);

    let teacherProfiles = {};
    if (SCHOOL_CONFIG.assignments && SCHOOL_CONFIG.assignments.length > 0) {
        SCHOOL_CONFIG.assignments.forEach(req => {
            let name = req.teacherName.replace('⭐ ', '');
            if (!teacherProfiles[name]) {
                teacherProfiles[name] = { subjects: new Set() };
            }
            teacherProfiles[name].subjects.add(req.subjectName);
        });
    }

    let allTeachers = Object.keys(teacherProfiles);
    if (allTeachers.length === 0) return;

    // --- FILTER 1: விடுப்பு எடுத்தவர்கள் மற்றும் மாற்று செஷனில் டியூட்டி பார்த்தவர்களை நீக்குதல் ---
    let presentTeachers = allTeachers.filter(t => 
        !absentTeachers.includes(t) && 
        !busyInOtherSession.includes(t) // The Magic Rule!
    );

    if (presentTeachers.length === 0) {
        mainGrid.innerHTML = `<div class="text-red-500 font-bold p-4">அனைத்து ஆசிரியர்களும் விடுப்பிலோ அல்லது மாற்று செஷன் டியூட்டியிலோ உள்ளனர்!</div>`;
        return;
    }

    let html = `<div id="examContainer" class="space-y-6">
        <div class="p-4 bg-orange-50 border-l-4 border-orange-500 rounded-r-lg shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-2">
            <div>
                <h3 class="font-bold text-orange-900 text-lg">Session: ${currentSession === 'FN' ? 'Morning' : 'Afternoon'}</h3>
                <p class="text-sm text-orange-800 font-medium mt-1"><i data-lucide="calendar" class="w-4 h-4 inline-block mr-1"></i>Date: ${selectedDate}</p>
            </div>
            <div class="text-sm bg-orange-200 text-orange-900 px-3 py-1 rounded font-bold">Starts @ ${examData.writingStart}</div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;

    let tempExamTracker = { ...window.examDutyTracker };

    activeGrades.forEach((grade, index) => {
        const isJunior = grade <= 8;
        const finishTime = isJunior ? examData.juniorEnd : examData.seniorEnd;
        
        let examGradeVal = getGradeValue(grade);
        let examCategory = getTeacherCategory(examGradeVal);

        let eligibleTeachers = presentTeachers.filter(t => !teacherProfiles[t].subjects.has("English")); 
        if (eligibleTeachers.length === 0) eligibleTeachers = presentTeachers; 
        
        let levelMatchedTeachers = eligibleTeachers.filter(t => window.teacherLevels[t] === examCategory);
        if (levelMatchedTeachers.length > 0) {
            eligibleTeachers = levelMatchedTeachers; 
        }
        
        eligibleTeachers.sort((a, b) => {
            let examA = tempExamTracker[a] || 0;
            let examB = tempExamTracker[b] || 0;
            if (examA !== examB) return examA - examB; 
            let loadA = window.teacherWorkload[a] || 0;
            let loadB = window.teacherWorkload[b] || 0;
            return loadA - loadB;
        });
        
        let dutyTeacher = eligibleTeachers[0];

        // --- FILTER 2: டியூட்டி பெற்றவரை தற்போதைய செஷனில் நிரந்தரமாகப் பதிவு செய்தல் ---
        window.dailyExamTracker[selectedDate][currentSession].push(dutyTeacher);
        
        // அடுத்த ஹாலுக்கு இவர் பெயர் மீண்டும் வராமல் இருக்க presentTeachers-ல் இருந்து நீக்குதல்
        presentTeachers = presentTeachers.filter(t => t !== dutyTeacher);
        
        let teacherCat = window.teacherLevels[dutyTeacher];
        tempExamTracker[dutyTeacher] = (tempExamTracker[dutyTeacher] || 0) + 1;
        let teacherLoad = window.teacherWorkload[dutyTeacher] || 0;

        html += `
            <div class="p-5 border border-gray-200 rounded-xl bg-white shadow-sm hover:border-blue-400 transition-all relative overflow-hidden">
                <div class="absolute top-0 left-0 w-full h-1 ${isJunior ? 'bg-green-400' : 'bg-blue-500'}"></div>
                <div class="flex justify-between items-start mb-4 mt-1">
                    <div><h4 class="text-2xl font-black text-gray-800">Class ${grade}</h4><span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">${examCategory} Hall</span></div>
                    <span class="bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-md font-bold border border-gray-200">Hall ${index + 1}</span>
                </div>
                <div class="space-y-2 mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div class="flex justify-between text-sm"><span class="text-gray-500">Duration:</span><span class="font-bold text-gray-700">${isJunior ? '2.5 Hrs' : '3.0 Hrs'}</span></div>
                    <div class="flex justify-between text-sm"><span class="text-gray-500">Ends at:</span><span class="font-bold ${isJunior ? 'text-green-600' : 'text-blue-600'}">${finishTime}</span></div>
                </div>
                <div class="pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div class="flex flex-col">
                        <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Invigilator Duty</span>
                        <span class="text-base font-bold text-blue-700 flex items-center gap-1"><i data-lucide="user-check" class="w-4 h-4"></i> ${dutyTeacher} <span class="text-[10px] font-normal text-gray-400 bg-gray-100 px-1 rounded">${teacherCat}</span></span>
                    </div>
                    <div class="text-right flex flex-col">
                        <span class="text-[10px] font-bold text-gray-400 uppercase">Regular Load</span>
                        <span class="text-sm font-black text-gray-600">${teacherLoad} Per.</span>
                    </div>
                </div>
            </div>`;
    });

    html += `</div></div>`;
    mainGrid.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
    updateStatus("Exam Schedule Loaded (Strict 1-Duty-Per-Day Applied)");
}
// --- RENDER 3: SUBSTITUTION MANAGER (With Level Matching) ---
function renderSubstituteSchedule() {
    const mainGrid = document.getElementById('mainGrid');
    const day = document.getElementById('subDay').value;
    const selectedDate = getSelectedDateStr();
    
    const absentCheckboxes = document.querySelectorAll('.absent-chk:checked');
    const absentTeachers = Array.from(absentCheckboxes).map(cb => cb.value);

    if (absentTeachers.length === 0) {
        mainGrid.innerHTML = `<div class="p-6 bg-red-50 text-red-600 font-bold border rounded-lg"><i data-lucide="alert-circle" class="inline"></i> Select absent teachers.</div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    let vacantSlots = generatedWeeklyTimetable.filter(slot =>
        slot.day === day && absentTeachers.includes(slot.teacherName.replace('⭐ ', ''))
    );

    if (vacantSlots.length === 0) {
        mainGrid.innerHTML = `<div class="p-6 bg-green-50 text-green-700 font-bold border border-green-200 rounded-lg flex items-center gap-2"><i data-lucide="check-circle"></i> No classes scheduled for the selected absent teachers on ${day}.</div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    vacantSlots.sort((a,b) => a.period.localeCompare(b.period, undefined, {numeric: true}));
    let allTeachers = [...new Set(SCHOOL_CONFIG.assignments.map(a => a.teacherName.replace('⭐ ', '')))];
    let presentTeachers = allTeachers.filter(t => !absentTeachers.includes(t));

    let html = `<div class="mb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b pb-4">
                    <div>
                        <h3 class="font-black text-2xl text-red-700 uppercase tracking-tight">Substitution Register</h3>
                        <p class="text-gray-600 font-bold mt-1"><i data-lucide="calendar" class="w-4 h-4 inline-block mr-1"></i>${selectedDate} <span class="text-gray-400">(${day})</span></p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="window.print()" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm rounded shadow font-bold flex items-center gap-2"><i data-lucide="printer" class="w-4 h-4"></i> Print</button>
                        <button onclick="saveDutiesToCloud()" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm rounded shadow font-bold flex items-center gap-2"><i data-lucide="save" class="w-4 h-4"></i> Save Counts</button>
                    </div>
                </div>
                <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse bg-white shadow-sm border border-gray-200">
            <thead class="bg-red-50 text-red-900 border-b border-red-200">
                <tr><th class="p-3 border-r">Period</th><th class="p-3 border-r">Class</th><th class="p-3 border-r">Absent Teacher</th><th class="p-3">Assign Substitute (Level Matched)</th></tr>
            </thead>
            <tbody>`;

    let tempDutyTracker = { ...window.subDutyTracker };

    vacantSlots.forEach(slot => {
        let slotGradeVal = getGradeValue(slot.className);
        let slotCategory = getTeacherCategory(slotGradeVal); 

        let busyThisPeriod = generatedWeeklyTimetable
            .filter(s => s.day === day && s.period === slot.period)
            .map(s => s.teacherName.replace('⭐ ', ''));

        let freeTeachers = presentTeachers.filter(t => !busyThisPeriod.includes(t));
        
        // 3-TIER SORTING LOGIC
        freeTeachers.sort((a, b) => {
            let aMatch = window.teacherLevels[a] === slotCategory ? 0 : 1;
            let bMatch = window.teacherLevels[b] === slotCategory ? 0 : 1;
            if (aMatch !== bMatch) return aMatch - bMatch;
            
            let subA = tempDutyTracker[a] || 0;
            let subB = tempDutyTracker[b] || 0;
            if (subA !== subB) return subA - subB;
            
            let loadA = window.teacherWorkload[a] || 0;
            let loadB = window.teacherWorkload[b] || 0;
            return loadA - loadB; 
        });

        let suggestedTeacher = freeTeachers.length > 0 ? freeTeachers[0] : null;
        if (suggestedTeacher) {
            tempDutyTracker[suggestedTeacher] = (tempDutyTracker[suggestedTeacher] || 0) + 1;
        }

        let optionsHtml = freeTeachers.map(t => {
            let dutyCount = window.subDutyTracker[t] || 0;
            let regLoad = window.teacherWorkload[t] || 0;
            let teacherCat = window.teacherLevels[t];
            let catShort = teacherCat === 'Primary' ? 'PR' : (teacherCat === 'High School' ? 'HS' : 'HSS');
            let isSelected = (t === suggestedTeacher) ? 'selected' : '';
            
            return `<option value="${t}" ${isSelected}>${t} (${catShort} | Sub: ${dutyCount} | Ld: ${regLoad})</option>`;
        }).join('');

        let noFreeTeacherMsg = freeTeachers.length === 0 ? `<option value="">⚠️ No Free Teachers Available!</option>` : '';

        html += `<tr class="border-b hover:bg-gray-50">
            <td class="p-3 border-r font-bold text-gray-700">${slot.period}</td>
            <td class="p-3 border-r font-black text-blue-800">${slot.className} <span class="block text-[10px] text-gray-400 font-normal mt-1">${slotCategory}</span></td>
            <td class="p-3 border-r text-red-600 font-medium line-through">${slot.teacherName.replace('⭐ ', '')} <span class="text-xs text-gray-400">(${slot.subjectName})</span></td>
            <td class="p-3">
                <select class="w-full p-2 border ${freeTeachers.length === 0 ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-300'} rounded font-semibold text-green-700 outline-none focus:ring-2 focus:ring-green-400">
                    ${noFreeTeacherMsg} ${optionsHtml}
                </select>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    mainGrid.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
    updateStatus("Substitution Manager Loaded");
}

// --- CLOUD SYNC & HORIZONTAL PARSING ---
function populateAbsentTeachersList() {
    let allTeachers = [...new Set(SCHOOL_CONFIG.assignments.map(a => a.teacherName.replace('⭐ ', '')))].sort();
    const listDiv = document.getElementById('absentTeachersList');
    if(!listDiv) return;
    
    listDiv.innerHTML = allTeachers.map(t => 
        `<label class="flex items-center gap-1 bg-white border border-gray-200 px-2 py-1 rounded cursor-pointer hover:bg-red-50 hover:border-red-300 transition-colors">
            <input type="checkbox" class="absent-chk" value="${t}"> <span class="font-medium text-gray-700">${t}</span>
        </label>`
    ).join('');
}

// --- CLOUD SYNC & NEW DYNAMIC HORIZONTAL PARSING ---
window.syncFromCloud = async function() {
    updateStatus("Downloading Sheets...");
    try {
        const response = await fetch(SCRIPT_URL);
        const cloudData = await response.json();

        // 1. Load Sub Duty Tracker
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

        if (cloudData.assignments && cloudData.assignments.length > 1) {
            cloudData.assignments.slice(1).forEach(row => {
                let teacherName = String(row[0] || '').trim();
                if (!teacherName) return; 

                // --- BLOCK 1: முதல் வகுப்பு ஒதுக்கீடு (Columns B to F) ---
                // Index: 1=Subject, 2=Class, 3=Section, 4=Periods, 5=Is CT?
                let sub1 = String(row[1] || '').trim();
                let cls1 = String(row[2] || '').trim();
                let sec1 = String(row[3] || '').trim();
                let per1 = parseInt(row[4]);
                let isCT = String(row[5] || '').trim().toLowerCase() === 'yes';

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

                // --- BLOCKS 2 to N: அடுத்தடுத்த வகுப்புகள் (Columns G முதல்) ---
                // Index 6-ல் தொடங்கி 4, 4 ஆகத் தாவிச் செல்லும் (Subject, Class, Section, Periods)
                for (let i = 6; i < row.length; i += 4) {
                    let subN = String(row[i] || '').trim();
                    let clsN = String(row[i+1] || '').trim();
                    let secN = String(row[i+2] || '').trim();
                    let perN = parseInt(row[i+3]);

                    // Total Load காலம் வந்துவிட்டாலோ அல்லது வகுப்பு இல்லை என்றாலோ லூப்பை நிறுத்தவும்
                    if (!clsN || clsN.toLowerCase() === 'total load') break; 

                    if (!isNaN(perN) && perN > 0) {
                        SCHOOL_CONFIG.assignments.push({
                            teacherName: teacherName,
                            // ஒருவேளை Subject காலியாக விட்டிருந்தால், முதல் பாடத்தையே எடுத்துக்கொள்ளும்
                            subjectName: subN ? subN : sub1, 
                            className: clsN + "-" + secN,
                            periodsPerWeek: perN,
                            isClassTeacher: false // Class Teacher பொறுப்பு முதல் பிளாக்கில் மட்டுமே வரும்
                        });
                        
                        window.teacherWorkload[teacherName] = (window.teacherWorkload[teacherName] || 0) + perN;
                        let gValN = getGradeValue(clsN);
                        window.teacherMaxGrade[teacherName] = Math.max((window.teacherMaxGrade[teacherName] || 0), gValN);
                    }
                }
            });

            // 3. Level Classification (Primary / High / HrSec)
            window.teacherLevels = {};
            for (let t in window.teacherMaxGrade) {
                window.teacherLevels[t] = getTeacherCategory(window.teacherMaxGrade[t]);
            }
            
            updateStatus("Generating Schedule...");
            generateAutoTimetable(); 
            populateAbsentTeachersList(); 
            window.generateGrid(); 
            
        } else {
            updateStatus("No assignment data found.");
        }
    } catch (error) {
        updateStatus("Sync Failed!");
        console.error("Cloud Error:", error);
    }
};
window.saveDutiesToCloud = async function() {
    updateStatus("Saving Duty Counts to Google Sheet...");
    const selects = document.querySelectorAll('select.w-full'); 
    let finalDutyTracker = { ...window.subDutyTracker }; 
    
    selects.forEach(select => {
        let assignedTeacher = select.value;
        if (assignedTeacher) {
            finalDutyTracker[assignedTeacher] = (finalDutyTracker[assignedTeacher] || 0) + 1;
        }
    });

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "updateSubTracker", data: finalDutyTracker })
        });
        await response.text();
        updateStatus("Saved Successfully!");
        window.subDutyTracker = finalDutyTracker; 
        alert("Duty counts saved to Master Sheet!");
    } catch (error) {
        updateStatus("Save Failed!");
    }
};

// --- EXPORT PDF (With Master Visiting Card Generator & Landscape Mode) ---
window.exportPDF = function() {
    const { jsPDF } = window.jspdf;
    const mode = document.getElementById('opMode').value;
    const selectedDate = getSelectedDateStr();
    
    if (mode === 'exam') {
        const doc = new jsPDF('l', 'mm', 'a4'); 
        doc.setFontSize(14);
        doc.text(`${APP_CONFIG.shortName} Exam Invigilation Schedule`, 14, 15);
        doc.setFontSize(11);
        doc.text(`Date: ${selectedDate} | Session: ${currentSession}`, 14, 25);
        doc.text("Please use screenshot for Exam Duty Cards.", 14, 35);
        doc.save(`${APP_CONFIG.shortName}_Exam_Schedule_${selectedDate}.pdf`);
        
    } else if (mode === 'substitution') {
        const doc = new jsPDF('l', 'mm', 'a4'); 
        const day = document.getElementById('subDay').value;
        doc.setFontSize(14);
        doc.text(`${APP_CONFIG.shortName} Substitution Duty - ${selectedDate} (${day})`, 14, 15);
        doc.setFontSize(11);
        doc.text("Please use the 'Print' button on the screen.", 14, 25);
        doc.save(`${APP_CONFIG.shortName}_Sub_Schedule_${selectedDate}.pdf`);
        
    } else {
        const viewType = document.getElementById('viewType')?.value || 'all';
        const filterVal = document.getElementById('viewFilter')?.value || '';

        // ==============================================================
        // 🌟 NEW: VISITING CARD GENERATOR (All Teachers)
        // ==============================================================
        if (viewType === 'all') {
            if (generatedWeeklyTimetable.length === 0) {
                alert("No data generated. Click Sync Data first!");
                return;
            }

            const doc = new jsPDF('p', 'mm', 'a4'); // Portrait mode for cards
            let allTeachers = [...new Set(SCHOOL_CONFIG.assignments.map(a => a.teacherName.replace('⭐ ', '')))].sort();
            
            // Card Dimensions (90mm x 54mm) - Standard ID Card / Visiting Card Size
            const cW = 90; 
            const cH = 54; 
            const marginX = 10; 
            const marginY = 10; 
            const gapY = 3; // Vertical gap for scissor cutting
            
            let cardsOnPage = 0;
            const teachingPeriods = SCHOOL_CONFIG.regularTimings.filter(p => p.type === 'class');
            const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']; // Short day names

            allTeachers.forEach((teacher) => {
                if (cardsOnPage === 10) { 
                    doc.addPage(); 
                    cardsOnPage = 0; 
                }
                
                let col = cardsOnPage % 2;
                let row = Math.floor(cardsOnPage / 2);
                let x = marginX + col * (cW + 10); // 10mm horizontal gap
                let y = marginY + row * (cH + gapY);

                // 1. Draw Card Border (To guide scissors)
                doc.setDrawColor(180, 180, 180); 
                doc.setLineWidth(0.3);
                doc.rect(x, y, cW, cH);

                // 2. Teacher Name & School Name Header
                doc.setFontSize(9); 
                doc.setTextColor(0); 
                doc.setFont("helvetica", "bold");
                let displayName = teacher.length > 20 ? teacher.substring(0, 18) + "..." : teacher;
                doc.text(`${APP_CONFIG.shortName} - ${displayName}`, x + 2, y + 5);

                // 3. Build Miniature Table Data
                let head = [['Day', ...teachingPeriods.map((_, i) => i + 1)]];
                let body = [];
                
                daysOfWeek.forEach((day, dIdx) => {
                    let rowData = [dayLabels[dIdx]];
                    teachingPeriods.forEach(period => {
                        let slot = generatedWeeklyTimetable.find(d => d.day === day && d.period === period.label && d.teacherName.replace('⭐ ', '') === teacher);
                        // Show only Class Name (e.g. "10-A") to save space
                        rowData.push(slot ? slot.className : '-'); 
                    });
                    body.push(rowData);
                });

                // 4. Print Miniature Table inside the Card
                doc.autoTable({
                    head: head, 
                    body: body,
                    startY: y + 7, 
                    margin: { left: x + 2 }, 
                    tableWidth: cW - 4,
                    theme: 'grid',
                    styles: { 
                        fontSize: 6.5,       // Very small font for visiting card
                        cellPadding: 1, 
                        halign: 'center', 
                        valign: 'middle', 
                        lineColor: [150, 150, 150], 
                        lineWidth: 0.1 
                    },
                    headStyles: { fillColor: [220, 220, 220], textColor: 20, fontStyle: 'bold' },
                    columnStyles: { 0: { fontStyle: 'bold', fillColor: [245, 245, 245] } }
                });
                
                cardsOnPage++;
            });
            
            doc.save(`${APP_CONFIG.shortName}_All_Teacher_Cards.pdf`);

        } else {
            // ==============================================================
            // SINGLE TIMETABLE LOGIC (Landscape Mode)
            // ==============================================================
            const doc = new jsPDF('l', 'mm', 'a4'); // Landscape mode
            doc.setFontSize(16);
            doc.setTextColor(30, 58, 138); 
            doc.text(`${APP_CONFIG.shortName} Timetable - ${filterVal}`, 14, 18);
            
            doc.autoTable({ 
                html: '#scheduleTable', startY: 25, theme: 'grid', 
                styles: { fontSize: 10, cellPadding: 4, halign: 'center', valign: 'middle' },
                headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 11, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [245, 247, 250] }
            });
            doc.save(`${APP_CONFIG.shortName}_Schedule_${filterVal.replace(' ', '_')}.pdf`);
        }
    }
};
