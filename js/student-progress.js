(function () {
    'use strict';

    const STUDENTS_KEY = 'mathSkillsStudents';
    const CURRENT_KEY = 'mathSkillsCurrentStudent';
    const skillLabels = {
        counting: 'Counting', 'counting-2s': 'Counting in 2s', 'counting-5s': 'Counting in 5s', 'counting-10s': 'Counting in 10s',
        doubles: 'Doubles', halves: 'Halves', 'even-odd': 'Even & Odd', money: 'Money', 'shapes-2d': '2D Shapes', 'shapes-3d': '3D Shapes',
        'shapes-sound': 'Shapes by Sound', 'colors-sound': 'Colours by Sound', compare: 'Larger or Smaller', 'number-explorer': 'Number Explorer',
        'make-number': 'Make a Number', 'number-name': 'Number Name', 'ordinal-numbers': 'Ordinal Numbers', 'pattern-missing': 'Find the Missing Item',
        'pattern-build': 'Build the Pattern', addition: 'Addition', subtraction: 'Subtraction', multiplication: 'Multiplication', colours: 'Naming Colours'
    };

    const read = (key, fallback) => {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
    };
    const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} };
    const getStudents = () => read(STUDENTS_KEY, {});
    const getCurrentName = () => { try { return localStorage.getItem(CURRENT_KEY) || ''; } catch (e) { return ''; } };
    const getCurrent = () => {
        const name = getCurrentName();
        const students = getStudents();
        return name && students[name] ? students[name] : null;
    };
    const safeName = (value) => value.trim().replace(/\s+/g, ' ').slice(0, 32);
    const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));

    function ensureMarkup() {
        if (document.getElementById('studentAuthOverlay')) return;
        const auth = document.createElement('div');
        auth.id = 'studentAuthOverlay';
        auth.className = 'student-overlay';
        auth.setAttribute('aria-hidden', 'true');
        auth.innerHTML = `
            <div class="student-panel student-auth-panel" role="dialog" aria-modal="true" aria-labelledby="studentAuthTitle">
                <div class="student-brand"><span class="student-brand-mark">✦</span><span>Math Skills</span></div>
                <h2 id="studentAuthTitle">Student login</h2>
                <p class="student-muted">Create a simple profile to save progress on this device. No email or internet is needed.</p>
                <form id="studentAuthForm" class="student-form">
                    <label for="studentNameInput">Student name</label>
                    <input id="studentNameInput" name="name" autocomplete="name" maxlength="32" required placeholder="e.g. Sam">
                    <label for="studentPinInput">4-digit PIN</label>
                    <input id="studentPinInput" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" minlength="4" required placeholder="••••">
                    <button class="student-primary-btn" type="submit">Log in / Create profile</button>
                    <p id="studentAuthMessage" class="student-form-message" role="status"></p>
                </form>
                <p class="student-footnote">Free offline mode · Progress stays in this browser</p>
            </div>`;
        document.body.appendChild(auth);

        const progress = document.createElement('div');
        progress.id = 'studentProgressOverlay';
        progress.className = 'student-overlay';
        progress.setAttribute('aria-hidden', 'true');
        progress.innerHTML = `
            <div class="student-panel student-progress-panel" role="dialog" aria-modal="true" aria-labelledby="progressTitle">
                <div class="student-modal-head"><div><p class="student-eyebrow">Student dashboard</p><h2 id="progressTitle">Your progress</h2></div><button type="button" class="student-close-btn" id="studentProgressClose" aria-label="Close progress">×</button></div>
                <div id="studentProgressContent"></div>
            </div>`;
        document.body.appendChild(progress);

        const intro = document.querySelector('.menu-intro');
        if (intro) {
            const header = document.createElement('div');
            header.className = 'student-menu-bar';
            header.innerHTML = `<div class="student-welcome"><span class="student-avatar" id="studentAvatar">?</span><div><span class="student-eyebrow">Learning profile</span><strong id="studentWelcomeName">Student</strong></div></div><button type="button" class="student-progress-btn" id="studentProgressOpen">View progress</button>`;
            intro.prepend(header);
        }
    }

    function showOverlay(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('is-open');
        el.setAttribute('aria-hidden', 'false');
    }
    function hideOverlay(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('is-open');
        el.setAttribute('aria-hidden', 'true');
    }
    function updateHeader() {
        const student = getCurrent();
        const name = student ? student.name : 'Student';
        const nameEl = document.getElementById('studentWelcomeName');
        const avatar = document.getElementById('studentAvatar');
        if (nameEl) nameEl.textContent = name;
        if (avatar) avatar.textContent = name.charAt(0).toUpperCase() || '?';
    }
    function stats(student) {
        const values = Object.values(student.progress || {});
        const answered = values.reduce((sum, item) => sum + (item.answered || 0), 0);
        const correct = values.reduce((sum, item) => sum + (item.correct || 0), 0);
        return { answered, correct, accuracy: answered ? Math.round(correct / answered * 100) : 0, skills: values.filter(item => item.answered > 0).length };
    }
    function renderProgress() {
        const target = document.getElementById('studentProgressContent');
        const student = getCurrent();
        if (!target || !student) return;
        const overall = stats(student);
        const rows = Object.keys(skillLabels).map(mode => {
            const item = (student.progress || {})[mode] || { answered: 0, correct: 0 };
            const percent = item.answered ? Math.round(item.correct / item.answered * 100) : 0;
            return `<div class="student-skill-row"><div class="student-skill-name"><span>${escapeHtml(skillLabels[mode])}</span><small>${item.answered ? `${item.correct}/${item.answered} correct` : 'Not started'}</small></div><div class="student-skill-bar"><span style="width:${percent}%"></span></div><strong>${item.answered ? percent + '%' : '—'}</strong></div>`;
        }).join('');
        target.innerHTML = `<div class="student-summary"><div><strong>${overall.answered}</strong><span>questions</span></div><div><strong>${overall.accuracy}%</strong><span>accuracy</span></div><div><strong>${overall.skills}</strong><span>skills tried</span></div></div><p class="student-progress-tip">Keep practising a little each day. Your strongest progress comes from explaining how you know.</p><div class="student-skill-list">${rows}</div><div class="student-progress-actions"><button type="button" class="student-secondary-btn" id="studentSwitchBtn">Switch student</button><button type="button" class="student-text-btn" id="studentResetBtn">Reset this profile</button></div>`;
        document.getElementById('studentSwitchBtn').addEventListener('click', () => { hideOverlay('studentProgressOverlay'); showOverlay('studentAuthOverlay'); document.getElementById('studentNameInput').focus(); });
        document.getElementById('studentResetBtn').addEventListener('click', () => {
            if (!window.confirm('Reset this student\'s saved progress on this device?')) return;
            student.progress = {}; student.lastActive = Date.now();
            const students = getStudents(); students[student.name] = student; write(STUDENTS_KEY, students); renderProgress();
        });
    }
    function handleLogin(event) {
        event.preventDefault();
        const name = safeName(document.getElementById('studentNameInput').value);
        const pin = document.getElementById('studentPinInput').value;
        const message = document.getElementById('studentAuthMessage');
        if (!name || !/^\d{4}$/.test(pin)) { message.textContent = 'Use a name and exactly 4 numbers for the PIN.'; return; }
        const students = getStudents();
        if (students[name] && students[name].pin !== pin) { message.textContent = 'That profile already exists. Check the PIN and try again.'; return; }
        const student = students[name] || { name, pin, createdAt: Date.now(), progress: {} };
        student.lastActive = Date.now(); students[name] = student;
        write(STUDENTS_KEY, students);
        try { localStorage.setItem(CURRENT_KEY, name); } catch (e) {}
        message.textContent = '';
        updateHeader();
        hideOverlay('studentAuthOverlay');
    }

    window.studentProgressRecord = function (mode, isCorrect) {
        const student = getCurrent();
        if (!student || !mode) return;
        student.progress = student.progress || {};
        const item = student.progress[mode] || { answered: 0, correct: 0 };
        item.answered += 1;
        if (isCorrect) item.correct += 1;
        item.lastPlayed = Date.now();
        student.progress[mode] = item;
        student.lastActive = Date.now();
        const students = getStudents(); students[student.name] = student; write(STUDENTS_KEY, students);
    };

    function init() {
        ensureMarkup();
        const form = document.getElementById('studentAuthForm');
        form.addEventListener('submit', handleLogin);
        document.getElementById('studentProgressOpen').addEventListener('click', () => { renderProgress(); showOverlay('studentProgressOverlay'); });
        document.getElementById('studentProgressClose').addEventListener('click', () => hideOverlay('studentProgressOverlay'));
        document.getElementById('studentProgressOverlay').addEventListener('click', e => { if (e.target.id === 'studentProgressOverlay') hideOverlay('studentProgressOverlay'); });
        updateHeader();
        if (!getCurrent()) showOverlay('studentAuthOverlay');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
