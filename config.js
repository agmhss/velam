/**
 * config.js - Global Configuration for AGMHSS Timetable Engine
 */

const SCHOOL_CONFIG = {
    // 1. Regular Timetable Settings (பள்ளியின் தினசரி நேர அமைப்பு)
    regularTimings: [
        { label: '1', start: '09:30 AM', end: '10:10 AM', type: 'class' },
        { label: '2', start: '10:10 AM', end: '10:50 AM', type: 'class' },
        { label: 'Break', start: '10:50 AM', end: '11:00 AM', type: 'break' },
        { label: '3', start: '11:00 AM', end: '11:40 AM', type: 'class' },
        { label: '4', start: '11:40 AM', end: '12:20 PM', type: 'class' },
        { label: 'Lunch', start: '12:20 PM', end: '01:00 PM', type: 'break' },
        { label: '5', start: '01:00 PM', end: '01:40 PM', type: 'class' },
        { label: '6', start: '01:40 PM', end: '02:20 PM', type: 'class' },
        { label: 'Break', start: '02:20 PM', end: '02:30 PM', type: 'break' },
        { label: '7', start: '02:30 PM', end: '03:10 PM', type: 'class' },
        { label: '8', start: '03:10 PM', end: '03:50 PM', type: 'class' }
    ],

    // 2. Exam Duty Settings (தேர்வு நேர அமைப்புகள்)
    examSettings: {
        'FN': {
            coolOffStart: '09:45 AM',
            writingStart: '10:00 AM',
            juniorEnd: '12:30 PM', // 1 to 10th Standard (2.5 Hours)
            seniorEnd: '01:00 PM'  // 11 & 12th Standard (3.0 Hours)
        },
        'AN': {
            coolOffStart: '01:15 PM',
            writingStart: '01:30 PM',
            juniorEnd: '04:00 PM', // 1 to 10th Standard (2.5 Hours)
            seniorEnd: '04:30 PM'  // 11 & 12th Standard (3.0 Hours)
        }
    },

    // 3. Exam Patterns (முழுமையாக 1 முதல் 12 வரை சேர்க்கப்பட்டுள்ளது)
    examPatterns: {
        'Full School (1 to 12)': {
            'FN': ['12', '10', '8', '6', '4', '2', 'LKG'],
            'AN': ['11', '9', '7', '5', '3', '1', 'UKG']
        },
        'High & Hr.Sec Only (6 to 12)': {
            'FN': ['12', '10', '8', '6'],
            'AN': ['11', '9', '7']
        },
        'Primary Only (LKG to 5)': {
            'FN': ['5', '3', '1', 'LKG'],
            'AN': ['4', '2', 'UKG']
        }
    },

    // 4. Assignments (இது காலியாகவே இருக்கட்டும், Google Sheet இதை நிரப்பிவிடும்)
    assignments: [] 
};
