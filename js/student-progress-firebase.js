import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFirestore, initializeFirestore, deleteDoc, persistentLocalCache, persistentMultipleTabManager, increment, doc, getDoc, setDoc, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

(function () {
    'use strict';

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    let db;
    try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
    catch (e) { db = getFirestore(app); }
    window.firebaseAuth = auth;
    window.firebaseDb = db;

    const skillLabels = {
        counting: 'Counting', 'counting-2s': 'Counting in 2s', 'counting-5s': 'Counting in 5s', 'counting-10s': 'Counting in 10s',
        doubles: 'Doubles', halves: 'Halves', 'even-odd': 'Even & Odd', money: 'Money', 'shapes-2d': '2D Shapes', 'shapes-3d': '3D Shapes',
        'shapes-sound': 'Shapes by Sound', 'colors-sound': 'Colours by Sound', compare: 'Larger or Smaller', 'number-explorer': 'Number Explorer',
        'make-number': 'Make a Number', 'number-name': 'Number Name', 'ordinal-numbers': 'Ordinal Numbers', 'pattern-missing': 'Find the Missing Item',
        'pattern-build': 'Build the Pattern', addition: 'Addition', subtraction: 'Subtraction', multiplication: 'Multiplication', colours: 'Naming Colours'
    };
    // Edit this list to match the unit menu in index.html. Skills not listed here still appear under "More skills".
    const UNITS = [
        { title: 'Unit 1', modes: ['counting', 'number-name', 'compare', 'make-number', 'pattern-missing', 'pattern-build', 'counting-2s'] },
        { title: 'Unit 2', modes: ['number-explorer', 'ordinal-numbers', 'counting-5s', 'counting-10s'] },
        { title: 'Unit 4', modes: ['addition'] },
        { title: 'Unit 5', modes: ['subtraction'] },
        { title: 'Unit 6', modes: ['doubles', 'halves', 'even-odd'] },
        { title: 'Unit 7', modes: ['money'] },
        { title: 'Unit 8', modes: ['shapes-2d', 'shapes-3d', 'shapes-sound'] },
        { title: 'Unit 11', modes: ['colors-sound', 'colours', 'multiplication'] }
    ];
    // false = students can only log in with accounts the teacher created (recommended). true = shows "I'm new — create my profile".
    const ALLOW_SELF_SIGNUP = false;
    const RECENT_MAX = 20;
    let currentStudent = null;
    let currentProfile = null;
    let saveTimer = null;
    let authMode = 'student';
    let createRequested = false;
    let busy = false;
    let pending = { modes: {}, days: {} };
    let failCount = 0;
    let inFlight = 0;
    const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
    const show = id => document.getElementById(id)?.classList.add('is-open');
    const hide = id => document.getElementById(id)?.classList.remove('is-open');
    const setMessage = text => { const el = document.getElementById('studentAuthMessage'); if (el) el.textContent = text || ''; };
    const slugName = name => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
    // Old self-made accounts: name + code are both in the email. Teacher-made accounts: username only, the code is the real password.
    const emailForStudent = (name, code) => `${slugName(name)}.${code}@students.math-skills-app.firebaseapp.com`;
    const emailForUsername = name => `${slugName(name)}@students.math-skills-app.firebaseapp.com`;
    const randomCode = () => { try { return String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000); } catch (e) { return String(Math.floor(Math.random() * 900000) + 100000); } };
    let teacherStudents = [];
    let teacherFilter = { search: '', sort: 'name', cls: '' };
    let rosterCreated = [];
    let rosterApp = null;

    function injectStyles() {
        if (document.getElementById('studentExtraStyles')) return;
        const style = document.createElement('style');
        style.id = 'studentExtraStyles';
        style.textContent = '.student-unit-title{margin:16px 0 6px;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase;opacity:.7}' +
            '.teacher-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}' +
            '.teacher-toolbar input,.teacher-toolbar select{flex:1 1 140px;min-width:0;padding:8px 10px;border-radius:10px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;font:inherit}' +
            '.teacher-student-card[data-id]{cursor:pointer}' +
            '.teacher-student-card[data-id]:focus-visible{outline:2px solid currentColor;outline-offset:2px}' +
            '#teacherAddForm[hidden]{display:none}' +
            '.teacher-created{margin:10px 0;font-size:.9rem}.teacher-created li{margin:4px 0}' +
            '.student-link-btn{border:0;background:none;color:var(--accent-color,#0d6efd);font:inherit;font-size:.82rem;font-weight:700;cursor:pointer;padding:.35rem .5rem;border-radius:8px}.student-link-btn:hover{text-decoration:underline}.student-link-btn:disabled{opacity:.5;cursor:default}' +
            '#pinToggleBtn{justify-self:end;padding:.1rem .3rem}#studentSyncStatus{display:block;color:var(--text-muted,#6c757d);font-size:.7rem;font-weight:600}' +
            '#rosterBulk{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid rgba(128,128,128,.4);background:transparent;color:inherit;font:inherit}' +
            '#loginCardsPrint{display:none}' +
            '@media print{body{background:#fff !important}body > *:not(#loginCardsPrint){display:none !important}' +
            '#loginCardsPrint{display:grid !important;grid-template-columns:repeat(2,1fr);gap:8mm;padding:8mm;color:#000;background:#fff;font-family:system-ui,Arial,sans-serif}' +
            '.login-card{border:1.5px dashed #444;border-radius:8px;padding:10px 12px;break-inside:avoid;page-break-inside:avoid}' +
            '.login-card-brand{font-size:11pt;font-weight:700;margin-bottom:4px}.login-card-name{font-size:14pt;font-weight:700}.login-card-class{font-size:10pt;margin-bottom:6px}' +
            '.login-card-row{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid #ccc;padding:5px 0;font-size:10pt}' +
            '.login-card-row strong{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14pt;letter-spacing:.08em}' +
            '.login-card-note{font-size:8pt;color:#444;margin-top:4px}}';
        document.head.appendChild(style);
    }

    const appError = (code, message) => Object.assign(new Error(message), { code });
    const toggle = (id, visible) => { const el = document.getElementById(id); if (el) { el.hidden = !visible; el.style.display = visible ? '' : 'none'; } };
    const setSync = text => { const el = document.getElementById('studentSyncStatus'); if (el) el.textContent = text || ''; };
    function friendlyError(error) {
        switch (error?.code) {
            case 'auth/invalid-credential': case 'auth/invalid-login-credentials': case 'auth/wrong-password': case 'auth/user-not-found':
                return authMode === 'teacher' ? 'The email or password is not correct.' : (ALLOW_SELF_SIGNUP ? 'We couldn’t find that name and code. Check them, or tap “I’m new” to make a profile.' : 'We couldn’t find that username and code. Check them, or ask your teacher.');
            case 'auth/email-already-in-use': return 'That name and code are already used. Choose a different 6-digit code.';
            case 'auth/network-request-failed': return 'No internet connection. Check the Wi-Fi and try again.';
            case 'auth/too-many-requests': return 'Too many tries. Wait a minute and try again.';
            case 'auth/invalid-email': return 'Enter a valid email address.';
            case 'auth/user-disabled': return 'This account has been disabled.';
            case 'app/validation': case 'app/not-teacher': return error.message;
            case 'permission-denied': return 'This account is not allowed to do that.';
        }
        return 'Could not sign in. Please try again.';
    }
    async function teacherStatus(user) {
        try { return (await getDoc(doc(db, 'teachers', user.uid))).exists(); }
        catch (e) { return null; }
    }
    function activeText(profile) {
        if (!profile?.lastActive) return ' · never active';
        const days = Math.floor((Date.now() - profile.lastActive) / 86400000);
        return ' · active ' + (days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago');
    }

    function markup() {
        if (document.getElementById('studentAuthOverlay')) return;
        injectStyles();
        document.body.insertAdjacentHTML('beforeend', `
        <div id="studentAuthOverlay" class="student-overlay" aria-hidden="true">
          <div class="student-panel student-auth-panel" role="dialog" aria-modal="true" aria-labelledby="studentAuthTitle">
            <div class="student-brand"><span class="student-brand-mark">✦</span><span>Math Skills</span></div>
            <div class="student-auth-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" class="student-auth-tab active" id="studentModeBtn">Student</button><button type="button" role="tab" aria-selected="false" class="student-auth-tab" id="teacherModeBtn">Teacher</button></div>
            <h2 id="studentAuthTitle">Student login</h2>
            <p id="studentAuthHelp" class="student-muted">Use your name and 6-digit access code. Your progress syncs to the cloud.</p>
            <form id="studentAuthForm" class="student-form">
              <label for="studentNameInput">Student name</label><input id="studentNameInput" maxlength="32" autocomplete="off" required placeholder="e.g. Sam">
              <label for="teacherEmailInput" id="teacherEmailLabel" hidden>Email</label><input id="teacherEmailInput" type="email" autocomplete="username" hidden placeholder="teacher@example.com">
              <label for="studentPinInput" id="studentPinLabel">6-digit access code</label><input id="studentPinInput" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" minlength="6" required autocomplete="off" placeholder="••••••"> <button type="button" class="student-link-btn" id="pinToggleBtn" aria-controls="studentPinInput" aria-pressed="false">Show</button>
              <button class="student-primary-btn" type="submit" id="studentAuthSubmit">Log in</button>
              <button type="button" class="student-link-btn" id="studentNewBtn">I’m new — create my profile</button>
              <button type="button" class="student-link-btn" id="teacherResetBtn" hidden>Forgot password?</button>
              <p id="studentAuthMessage" class="student-form-message" role="status"></p>
            </form>
            <p class="student-footnote">Cloud sync enabled · Use the same details on another device</p>
          </div>
        </div>
        <div id="studentProgressOverlay" class="student-overlay" aria-hidden="true">
          <div class="student-panel student-progress-panel" role="dialog" aria-modal="true" aria-labelledby="progressTitle">
            <div class="student-modal-head"><div><p class="student-eyebrow" id="dashboardEyebrow">Student dashboard</p><h2 id="progressTitle">Your progress</h2></div><button type="button" class="student-close-btn" id="studentProgressClose">×</button></div>
            <div id="studentProgressContent"></div>
          </div>
        </div>`);
        const intro = document.querySelector('.menu-intro');
        if (intro) intro.insertAdjacentHTML('afterbegin', `<div class="student-menu-bar"><div class="student-welcome"><span class="student-avatar" id="studentAvatar">?</span><div><span class="student-eyebrow">Learning profile</span><strong id="studentWelcomeName">Sign in</strong><small id="studentSyncStatus" role="status"></small></div></div><button type="button" class="student-progress-btn" id="studentProgressOpen">View progress</button></div>`);
        document.getElementById('studentModeBtn').onclick = () => setAuthMode('student');
        document.getElementById('teacherModeBtn').onclick = () => setAuthMode('teacher');
        document.getElementById('studentAuthForm').addEventListener('submit', handleAuth);
        document.getElementById('pinToggleBtn').onclick = () => {
            const input = document.getElementById('studentPinInput');
            const showing = input.type === 'text';
            input.type = showing ? 'password' : 'text';
            document.getElementById('pinToggleBtn').textContent = showing ? 'Show' : 'Hide';
            document.getElementById('pinToggleBtn').setAttribute('aria-pressed', String(!showing));
        };
        document.getElementById('studentNewBtn').onclick = () => { createRequested = true; document.getElementById('studentAuthForm').requestSubmit(); };
        document.getElementById('teacherResetBtn').onclick = handlePasswordReset;
        document.getElementById('studentProgressOpen').onclick = async () => { if (currentProfile?.role === 'teacher') await renderTeacherDashboard(); else await renderStudentProgress(); show('studentProgressOverlay'); };
        document.getElementById('studentProgressClose').onclick = () => hide('studentProgressOverlay');
        document.getElementById('studentProgressOverlay').addEventListener('click', e => { if (e.target.id === 'studentProgressOverlay') hide('studentProgressOverlay'); });
    }

    function setAuthMode(mode) {
        authMode = mode;
        const student = mode === 'student';
        document.getElementById('studentModeBtn').classList.toggle('active', student);
        document.getElementById('teacherModeBtn').classList.toggle('active', !student);
        document.getElementById('studentModeBtn').setAttribute('aria-selected', String(student));
        document.getElementById('teacherModeBtn').setAttribute('aria-selected', String(!student));
        document.getElementById('studentAuthTitle').textContent = student ? 'Student login' : 'Teacher login';
        document.getElementById('studentAuthHelp').textContent = student ? 'Type your username and 6-digit access code. Forgot it? Ask your teacher.' : 'Sign in with the teacher account.';
        document.querySelector('label[for="studentNameInput"]').textContent = 'Your name or username';
        document.getElementById('studentNameInput').hidden = !student;
        document.querySelector('label[for="studentNameInput"]').hidden = !student;
        document.getElementById('studentNameInput').required = student;
        const pin = document.getElementById('studentPinInput');
        pin.type = 'password';
        pin.value = '';
        pin.autocomplete = student ? 'off' : 'current-password';
        document.getElementById('pinToggleBtn').textContent = 'Show';
        document.getElementById('pinToggleBtn').setAttribute('aria-pressed', 'false');
        document.getElementById('studentPinLabel').textContent = student ? '6-digit access code' : 'Password';
        pin.pattern = student ? '[0-9]{6}' : '.{6,}';
        pin.minLength = 6;
        pin.maxLength = student ? 6 : 128;
        pin.inputMode = student ? 'numeric' : 'text';
        document.getElementById('teacherEmailInput').hidden = student;
        document.getElementById('teacherEmailLabel').hidden = student;
        document.getElementById('teacherEmailInput').required = !student;
        document.getElementById('studentAuthSubmit').textContent = student ? 'Log in' : 'Sign in as teacher';
        toggle('studentNewBtn', student && ALLOW_SELF_SIGNUP);
        toggle('teacherResetBtn', !student);
        setMessage('');
    }

    function setBusy(value) {
        busy = value;
        ['studentAuthSubmit', 'studentNewBtn', 'teacherResetBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = value; });
    }

    async function handlePasswordReset() {
        const email = document.getElementById('teacherEmailInput').value.trim();
        if (!email) { setMessage('Type the teacher email first, then tap “Forgot password?”.'); return; }
        try { await sendPasswordResetEmail(auth, email); setMessage('If that email is registered, a reset link has been sent.'); }
        catch (error) { setMessage(friendlyError(error)); }
    }

    async function signInStudent(name, code) {
        const notFound = ['auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/user-not-found', 'auth/wrong-password'];
        try { return await signInWithEmailAndPassword(auth, emailForUsername(name), code); }
        catch (error) {
            if (!notFound.includes(error.code)) throw error;
            return await signInWithEmailAndPassword(auth, emailForStudent(name, code), code);
        }
    }

    async function handleAuth(event) {
        event.preventDefault();
        const creating = createRequested;
        createRequested = false;
        if (busy) return;
        setBusy(true);
        setMessage('Connecting…');
        try {
            let credential;
            if (authMode === 'teacher') {
                const email = document.getElementById('teacherEmailInput').value.trim();
                const password = document.getElementById('studentPinInput').value;
                credential = await signInWithEmailAndPassword(auth, email, password);
                if (await teacherStatus(credential.user) === false) {
                    await signOut(auth);
                    throw appError('app/not-teacher', 'This account is not set up as a teacher.');
                }
                currentStudent = null;
                currentProfile = { name: 'Teacher', role: 'teacher', progress: {} };
            } else {
                const name = document.getElementById('studentNameInput').value.trim().replace(/\s+/g, ' ').slice(0, 32);
                const code = document.getElementById('studentPinInput').value;
                if (!name || !/^\d{6}$/.test(code)) throw appError('app/validation', 'Enter a name and exactly 6 numbers for the access code.');
                if (!slugName(name)) throw appError('app/validation', 'Use letters or numbers in the name.');
                if (creating && !ALLOW_SELF_SIGNUP) throw appError('app/validation', 'Ask your teacher to create your account.');
                credential = creating ? await createUserWithEmailAndPassword(auth, emailForStudent(name, code), code) : await signInStudent(name, code);
                currentStudent = credential.user;
                const email = credential.user.email;
                const ref = doc(db, 'students', currentStudent.uid);
                const existing = await getDoc(ref);
                if (existing.exists()) {
                    currentProfile = existing.data();
                    await setDoc(ref, { lastActive: Date.now(), ...(currentProfile.name ? {} : { name }) }, { merge: true });
                    if (!currentProfile.name) currentProfile.name = name;
                } else {
                    currentProfile = { name, role: 'student', progress: {}, createdAt: Date.now() };
                    await setDoc(ref, { ...currentProfile, emailAlias: email, lastActive: Date.now() });
                }
            }
            setMessage('');
            updateHeader(); hide('studentAuthOverlay');
        } catch (error) {
            setMessage(friendlyError(error));
        } finally {
            setBusy(false);
        }
    }

    function updateHeader() {
        const name = currentProfile?.name || (currentStudent ? 'Student' : 'Sign in');
        const nameEl = document.getElementById('studentWelcomeName');
        const avatar = document.getElementById('studentAvatar');
        const progressButton = document.getElementById('studentProgressOpen');
        if (nameEl) nameEl.textContent = name;
        if (avatar) avatar.textContent = name.charAt(0).toUpperCase() || '?';
        if (progressButton) {
            const teacher = currentProfile?.role === 'teacher';
            progressButton.textContent = teacher ? 'View all student progress' : 'View progress';
            progressButton.classList.toggle('teacher-dashboard-trigger', teacher);
        }
    }
    const labelFor = mode => skillLabels[mode] || (mode.charAt(0).toUpperCase() + mode.slice(1).replace(/-/g, ' '));
    function stats(profile) {
        const values = Object.values(profile?.progress || {});
        const answered = values.reduce((sum, item) => sum + (item.answered || 0), 0);
        const correct = values.reduce((sum, item) => sum + (item.correct || 0), 0);
        return { answered, correct, accuracy: answered ? Math.round(correct / answered * 100) : 0, skills: values.filter(item => item.answered > 0).length };
    }
    // Accuracy over the last 20 answers. Older saved data has no history yet, so fall back to the lifetime figures.
    function recentStats(item) {
        const history = item?.recent || '';
        if (history.length) { const right = (history.match(/1/g) || []).length; return { n: history.length, accuracy: Math.round(right / history.length * 100) }; }
        const answered = item?.answered || 0;
        return { n: Math.min(answered, RECENT_MAX), accuracy: answered ? Math.round((item.correct || 0) / answered * 100) : 0 };
    }
    function skillStatus(item) {
        if (!item?.answered) return { label: 'Not started', level: 0 };
        const recent = recentStats(item);
        if (recent.n >= 10 && recent.accuracy >= 80) return { label: 'Secure', level: 3 };
        if (recent.n >= 10 && recent.accuracy < 60) return { label: 'Needs help', level: 1 };
        return { label: 'Practising', level: 2 };
    }
    const weakSkills = profile => Object.keys(profile?.progress || {}).filter(mode => skillStatus(profile.progress[mode]).level === 1).map(labelFor);
    function modeGroups(extraModes = []) {
        const known = new Set(UNITS.flatMap(unit => unit.modes));
        const groups = UNITS.map(unit => ({ title: unit.title, modes: unit.modes.filter(mode => skillLabels[mode] || extraModes.includes(mode)) })).filter(group => group.modes.length);
        const loose = [...Object.keys(skillLabels), ...extraModes].filter((mode, i, all) => !known.has(mode) && all.indexOf(mode) === i);
        if (loose.length) groups.push({ title: 'More skills', modes: loose });
        return groups;
    }
    function skillRows(profile) {
        const extra = Object.keys(profile?.progress || {}).filter(mode => !skillLabels[mode]);
        return modeGroups(extra).map(group => `<h4 class="student-unit-title">${esc(group.title)}</h4>` + group.modes.map(mode => {
            const item = profile?.progress?.[mode] || { answered: 0, correct: 0 };
            const status = skillStatus(item);
            const percent = item.answered ? recentStats(item).accuracy : 0;
            return `<div class="student-skill-row"><div class="student-skill-name"><span>${esc(labelFor(mode))}</span><small>${item.answered ? `${item.correct || 0}/${item.answered} correct · ${status.label}` : 'Not started'}</small></div><div class="student-skill-bar"><span style="width:${percent}%"></span></div><strong>${item.answered ? percent + '%' : '—'}</strong></div>`;
        }).join('')).join('');
    }
    function lastDays(count = 14) {
        const days = [];
        for (let i = count - 1; i >= 0; i--) { const date = new Date(); date.setDate(date.getDate() - i); days.push(dateKey(date)); }
        return days;
    }
    function trendChart(daily, count = 14, caption = 'Questions answered per day') {
        const values = lastDays(count).map(key => ({ key, answered: daily?.[key]?.answered || 0, correct: daily?.[key]?.correct || 0 }));
        if (!values.some(item => item.answered)) return '<p class="student-muted">No practice in the last 14 days yet.</p>';
        const max = Math.max(...values.map(item => item.answered), 1);
        const W = 28, H = 90, top = 16;
        const bars = values.map((item, i) => {
            const h = Math.max(2, Math.round(item.answered / max * H));
            const accuracy = item.answered ? Math.round(item.correct / item.answered * 100) : 0;
            const color = accuracy >= 80 ? '#22c55e' : accuracy >= 60 ? '#f59e0b' : '#ef4444';
            const x = i * W + 4, mid = x + (W - 8) / 2;
            const bar = item.answered
                ? `<rect x="${x}" y="${top + H - h}" width="${W - 8}" height="${h}" rx="3" fill="${color}"/><text x="${mid}" y="${top + H - h - 3}" text-anchor="middle" font-size="9" fill="currentColor">${item.answered}</text>`
                : `<rect x="${x}" y="${top + H - 1}" width="${W - 8}" height="1" fill="currentColor" opacity=".3"/>`;
            return `<g><title>${item.key}: ${item.answered} questions, ${accuracy}% correct</title>${bar}<text x="${mid}" y="${top + H + 12}" text-anchor="middle" font-size="9" fill="currentColor" opacity=".7">${Number(item.key.slice(8))}</text></g>`;
        }).join('');
        return `<svg viewBox="0 0 ${count * W} ${top + H + 18}" role="img" aria-label="${esc(caption)} over the last ${count} days" style="width:100%;max-width:560px;height:auto;display:block">${bars}</svg><p class="student-muted" style="font-size:.8rem">${esc(caption)}, last ${count} days (day of the month under each bar). Green: 80%+ correct · amber: 60–79% · red: under 60%.</p>`;
    }
    const classOf = student => String(student?.class || '').trim();
    const activeThisWeek = student => {
        const week = lastDays(7);
        if (student?.daily && Object.keys(student.daily).length) return week.some(key => student.daily[key]?.answered);
        return !!student?.lastActive && Date.now() - student.lastActive < 7 * 86400000;
    };

    async function renderStudentProgress() {
        const target = document.getElementById('studentProgressContent');
        const overall = stats(currentProfile);
        target.innerHTML = `<div class="student-summary"><div><strong>${overall.answered}</strong><span>questions</span></div><div><strong>${overall.accuracy}%</strong><span>accuracy</span></div><div><strong>${overall.skills}</strong><span>skills tried</span></div></div><p class="student-progress-tip">Your progress is synced and can be opened on another device. The bar shows your last 20 answers.</p><h4 class="student-unit-title">My last 14 days</h4>${trendChart(currentProfile?.daily)}<div class="student-skill-list">${skillRows(currentProfile)}</div><div class="student-progress-actions"><button type="button" class="student-secondary-btn" id="studentSignOutBtn">Sign out</button></div>`;
        document.getElementById('studentSignOutBtn').onclick = async () => { await signOutSafely(); hide('studentProgressOverlay'); show('studentAuthOverlay'); };
    }
    const csvCell = value => { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text; };
    function downloadCsv(filename, rows) {
        const blob = new Blob(['\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = filename;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const dayText = ts => ts ? new Date(ts).toISOString().slice(0, 10) : '';
    function teacherCsvRows() {
        const extra = [...new Set(teacherStudents.flatMap(student => Object.keys(student.progress || {})).filter(mode => !skillLabels[mode]))];
        const modes = modeGroups(extra).flatMap(group => group.modes);
        const header = ['Name', 'Username', 'Class', 'Questions', 'Accuracy %', 'Skills tried', 'Last active', 'Needs help with', ...modes.map(mode => `${labelFor(mode)} % (last ${RECENT_MAX})`)];
        const rows = sortedVisible().map(student => {
            const overall = stats(student);
            return [student.name || '', student.username || '', classOf(student), overall.answered, overall.accuracy, overall.skills, dayText(student.lastActive), weakSkills(student).join('; '),
                ...modes.map(mode => { const item = student.progress?.[mode]; return item?.answered ? recentStats(item).accuracy : ''; })];
        });
        return [header, ...rows];
    }

    async function renderTeacherDashboard() {
        const target = document.getElementById('studentProgressContent');
        document.getElementById('dashboardEyebrow').textContent = 'Teacher dashboard';
        document.getElementById('progressTitle').textContent = 'Student progress';
        target.innerHTML = '<p class="student-muted">Loading students…</p>';
        try {
            const snapshot = await getDocs(query(collection(db, 'students'), orderBy('name')));
            teacherStudents = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
            drawTeacherDashboard();
        } catch (error) {
            target.innerHTML = `<p class="student-form-message">Could not load students. Check that the teacher UID is added to Firestore collection <code>teachers</code> and that your rules are published.</p>`;
        }
    }

    function visibleStudents() {
        const needle = teacherFilter.search.trim().toLowerCase();
        return teacherStudents.filter(student => {
            const cls = classOf(student);
            if (teacherFilter.cls === '__none' && cls) return false;
            if (teacherFilter.cls && teacherFilter.cls !== '__none' && cls !== teacherFilter.cls) return false;
            return !needle || (student.name || '').toLowerCase().includes(needle) || (student.username || '').toLowerCase().includes(needle);
        });
    }
    function sortedVisible() {
        const students = visibleStudents();
        if (teacherFilter.sort === 'active') students.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
        else if (teacherFilter.sort === 'help') students.sort((a, b) => weakSkills(b).length - weakSkills(a).length || (a.name || '').localeCompare(b.name || ''));
        else students.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        return students;
    }
    const classNames = () => [...new Set(teacherStudents.map(classOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    function drawClassOptions() {
        const select = document.getElementById('teacherClass');
        const names = classNames();
        if (select) {
            const hasNone = teacherStudents.some(student => !classOf(student)) && names.length > 0;
            select.innerHTML = '<option value="">All classes</option>' + names.map(name => `<option value="${esc(name)}"${teacherFilter.cls === name ? ' selected' : ''}>${esc(name)}</option>`).join('') + (hasNone ? `<option value="__none"${teacherFilter.cls === '__none' ? ' selected' : ''}>No class</option>` : '');
        }
        const list = document.getElementById('rosterClassList');
        if (list) list.innerHTML = names.map(name => `<option value="${esc(name)}"></option>`).join('');
    }

    function drawTeacherDashboard() {
        const target = document.getElementById('studentProgressContent');
        const sorts = [['name', 'Sort: name'], ['active', 'Sort: last active'], ['help', 'Sort: needs help first']];
        target.innerHTML = `<p class="student-progress-tip" id="teacherCount"></p>
            <div class="teacher-toolbar">
              <input id="teacherSearch" type="search" placeholder="Search students" aria-label="Search students" value="${esc(teacherFilter.search)}">
              <select id="teacherClass" aria-label="Filter by class"></select>
              <select id="teacherSort" aria-label="Sort students">${sorts.map(([value, label]) => `<option value="${value}"${teacherFilter.sort === value ? ' selected' : ''}>${label}</option>`).join('')}</select>
              <button type="button" class="student-secondary-btn" id="teacherAddBtn">Add students</button>
              <button type="button" class="student-secondary-btn" id="teacherCsvBtn">Download CSV</button>
            </div>
            <form id="teacherAddForm" class="student-form" hidden>
              <label for="rosterClass">Class (optional)</label><input id="rosterClass" list="rosterClassList" maxlength="24" autocomplete="off" placeholder="e.g. 3A"><datalist id="rosterClassList"></datalist>
              <label for="rosterName">Student name</label><input id="rosterName" maxlength="32" autocomplete="off" placeholder="e.g. Sam Ali">
              <label for="rosterUser">Username (what the student types)</label><input id="rosterUser" maxlength="24" autocomplete="off" placeholder="e.g. sam-ali">
              <label for="rosterCode">6-digit access code</label><input id="rosterCode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off">
              <label for="rosterBulk">Or paste a whole class: one name per line (usernames and codes are made for you)</label>
              <textarea id="rosterBulk" rows="4" placeholder="Sam Ali&#10;Lina Omar&#10;Omar Khaled"></textarea>
              <button class="student-primary-btn" type="submit" id="rosterSubmit">Create student accounts</button>
              <p id="rosterMessage" class="student-form-message" role="status"></p>
            </form>
            <div id="rosterCreated"></div>
            <div id="teacherActivity"></div>
            <div class="teacher-student-list" id="teacherList"></div>
            <div class="student-progress-actions"><button type="button" class="student-secondary-btn" id="studentSignOutBtn">Sign out</button></div>`;
        let userEdited = false;
        drawClassOptions();
        document.getElementById('teacherSearch').oninput = event => { teacherFilter.search = event.target.value; drawTeacherList(); };
        document.getElementById('teacherClass').onchange = event => { teacherFilter.cls = event.target.value; drawTeacherList(); };
        document.getElementById('teacherSort').onchange = event => { teacherFilter.sort = event.target.value; drawTeacherList(); };
        document.getElementById('teacherCsvBtn').onclick = () => {
            const label = teacherFilter.cls && teacherFilter.cls !== '__none' ? slugName(teacherFilter.cls) : 'all';
            downloadCsv(`student-progress-${label}-${dateKey(new Date())}.csv`, teacherCsvRows());
        };
        document.getElementById('teacherAddBtn').onclick = () => {
            const form = document.getElementById('teacherAddForm');
            form.hidden = !form.hidden;
            if (!form.hidden) { document.getElementById('rosterCode').value = randomCode(); document.getElementById('rosterClass').focus(); }
        };
        document.getElementById('rosterName').oninput = event => { if (!userEdited) document.getElementById('rosterUser').value = slugName(event.target.value); };
        document.getElementById('rosterUser').oninput = () => { userEdited = true; };
        document.getElementById('teacherAddForm').addEventListener('submit', event => { handleRosterSubmit(event); userEdited = false; });
        document.getElementById('studentSignOutBtn').onclick = async () => { await signOutSafely(); hide('studentProgressOverlay'); show('studentAuthOverlay'); };
        drawTeacherList();
        drawRosterCreated();
    }

    function drawTeacherActivity(students) {
        const box = document.getElementById('teacherActivity');
        if (!box) return;
        if (!students.length) { box.innerHTML = ''; return; }
        const combined = {};
        students.forEach(student => Object.entries(student.daily || {}).forEach(([key, value]) => {
            const total = combined[key] || (combined[key] = { answered: 0, correct: 0 });
            total.answered += value.answered || 0; total.correct += value.correct || 0;
        }));
        const inactive = students.filter(student => !activeThisWeek(student));
        const names = inactive.slice(0, 8).map(student => esc(student.name || 'Unnamed')).join(', ') + (inactive.length > 8 ? ` and ${inactive.length - 8} more` : '');
        const title = teacherFilter.cls && teacherFilter.cls !== '__none' ? esc(teacherFilter.cls) + ' · ' : '';
        box.innerHTML = `<h4 class="student-unit-title">${title}Last 14 days</h4><p class="student-progress-tip">${students.length - inactive.length} of ${students.length} student${students.length === 1 ? '' : 's'} practised in the last 7 days.${inactive.length ? ` Not this week: ${names}.` : ''}</p>${trendChart(combined, 14, 'Questions answered by this group per day')}`;
    }

    function drawTeacherList() {
        const list = document.getElementById('teacherList');
        if (!list) return;
        const students = sortedVisible();
        const total = teacherStudents.length;
        document.getElementById('teacherCount').textContent = `${students.length === total ? total : students.length + ' of ' + total} student${total === 1 ? '' : 's'} connected to this Firebase project.`;
        drawTeacherActivity(students);
        list.innerHTML = students.length ? students.map(student => {
            const overall = stats(student);
            const weak = weakSkills(student);
            const cls = classOf(student);
            const activeSkills = Object.keys(student.progress || {}).filter(mode => student.progress[mode]?.answered).slice(0, 5).map(mode => `${esc(labelFor(mode))} ${recentStats(student.progress[mode]).accuracy}%`).join(' · ');
            return `<div class="teacher-student-card" data-id="${esc(student.id)}" role="button" tabindex="0"><div><strong>${esc(student.name || 'Unnamed student')}</strong><small>${cls ? esc(cls) + ' · ' : ''}${overall.answered} questions · ${overall.accuracy}% accuracy · ${overall.skills} skills tried${activeText(student)}${weak.length ? ' · ⚠ needs help: ' + esc(weak.slice(0, 2).join(', ')) : ''}</small>${activeSkills ? `<em>${activeSkills}</em>` : '<em>Not started yet</em>'}</div></div>`;
        }).join('') : `<p class="student-muted">${total ? 'No students match your filters.' : 'No student accounts yet. Add students above, or students will appear after their first login.'}</p>`;
        list.querySelectorAll('.teacher-student-card[data-id]').forEach(card => {
            const open = () => { const student = teacherStudents.find(item => item.id === card.dataset.id); if (student) renderTeacherStudent(student); };
            card.onclick = open;
            card.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } };
        });
    }

    function printLoginCards(items) {
        document.getElementById('loginCardsPrint')?.remove();
        const box = document.createElement('div');
        box.id = 'loginCardsPrint';
        box.innerHTML = items.map(item => `<div class="login-card"><div class="login-card-brand">✦ Math Skills</div><div class="login-card-name">${esc(item.name)}</div><div class="login-card-class">${item.className ? esc(item.className) : '&nbsp;'}</div><div class="login-card-row"><span>Username</span><strong>${esc(item.username)}</strong></div><div class="login-card-row"><span>Access code</span><strong>${esc(item.code)}</strong></div><div class="login-card-note">Open Math Skills, tap Student, then type your username and access code.</div></div>`).join('');
        document.body.appendChild(box);
        const cleanup = () => { box.remove(); window.removeEventListener('afterprint', cleanup); };
        window.addEventListener('afterprint', cleanup);
        window.print();
    }

    function drawRosterCreated() {
        const box = document.getElementById('rosterCreated');
        if (!box) return;
        if (!rosterCreated.length) { box.innerHTML = ''; return; }
        box.innerHTML = `<div class="teacher-created"><p class="student-progress-tip">Created in this session. Print or save the codes now: they cannot be shown again.</p><ul>${rosterCreated.map(item => `<li>${esc(item.name)}${item.className ? ' (' + esc(item.className) + ')' : ''} · username <code>${esc(item.username)}</code> · code <code>${esc(item.code)}</code></li>`).join('')}</ul><div class="student-progress-actions"><button type="button" class="student-secondary-btn" id="rosterPrintBtn">Print login cards</button><button type="button" class="student-link-btn" id="rosterCsvBtn">Download login list (CSV)</button><button type="button" class="student-link-btn" id="rosterClearBtn">Clear list</button></div></div>`;
        document.getElementById('rosterPrintBtn').onclick = () => printLoginCards(rosterCreated);
        document.getElementById('rosterCsvBtn').onclick = () => downloadCsv('student-logins.csv', [['Name', 'Class', 'Username', 'Access code'], ...rosterCreated.map(item => [item.name, item.className || '', item.username, item.code])]);
        document.getElementById('rosterClearBtn').onclick = () => { rosterCreated = []; drawRosterCreated(); };
    }

    function rosterError(error) {
        switch (error?.code) {
            case 'auth/email-already-in-use': return 'That username is already taken. Try another one.';
            case 'auth/network-request-failed': return 'No internet connection. Try again.';
            case 'permission-denied': return 'The Firestore rules do not let teachers create students yet. Publish the updated firestore.rules.';
        }
        return 'Could not create the student. Please try again.';
    }

    // A second Firebase app instance is used so creating the student does not sign the teacher out.
    async function createRosterStudent(displayName, username, code, className) {
        rosterApp = rosterApp || initializeApp(firebaseConfig, 'roster');
        const rosterAuth = getAuth(rosterApp);
        const email = emailForUsername(username);
        const credential = await createUserWithEmailAndPassword(rosterAuth, email, code);
        try {
            const profile = { name: displayName, username, role: 'student', progress: {}, createdAt: Date.now(), emailAlias: email, createdBy: auth.currentUser?.uid || '' };
            if (className) profile.class = className;
            await setDoc(doc(db, 'students', credential.user.uid), profile);
            return { id: credential.user.uid, ...profile };
        } finally {
            await signOut(rosterAuth);
        }
    }

    async function handleRosterSubmit(event) {
        event.preventDefault();
        const message = document.getElementById('rosterMessage');
        const submit = document.getElementById('rosterSubmit');
        const className = document.getElementById('rosterClass').value.trim().replace(/\s+/g, ' ').slice(0, 24);
        const cleanName = value => value.trim().replace(/\s+/g, ' ').slice(0, 32);
        const bulk = [...new Set(document.getElementById('rosterBulk').value.split(/\r?\n/).map(cleanName).filter(Boolean))].slice(0, 60);
        let jobs;
        if (bulk.length) {
            jobs = bulk.map(name => ({ name, username: slugName(name), code: randomCode(), auto: true }));
        } else {
            const name = cleanName(document.getElementById('rosterName').value);
            const username = slugName(document.getElementById('rosterUser').value || name);
            const code = document.getElementById('rosterCode').value;
            if (!name || !username) { message.textContent = 'Enter a name and a username using letters or numbers, or paste a list of names.'; return; }
            if (!/^\d{6}$/.test(code)) { message.textContent = 'Use exactly 6 numbers for the access code.'; return; }
            jobs = [{ name, username, code, auto: false }];
        }
        if (jobs.some(job => !job.username)) { message.textContent = 'Every name needs some letters or numbers.'; return; }
        submit.disabled = true;
        let done = 0;
        try {
            for (const job of jobs) {
                message.textContent = jobs.length > 1 ? `Creating ${done + 1} of ${jobs.length}…` : 'Creating…';
                let created = null;
                for (let attempt = 1; attempt <= 9 && !created; attempt++) {
                    const username = attempt === 1 ? job.username : `${job.username.slice(0, 22)}-${attempt}`;
                    try { created = await createRosterStudent(job.name, username, job.code, className); }
                    catch (error) { if (error?.code !== 'auth/email-already-in-use' || !job.auto) throw error; }
                }
                if (!created) throw Object.assign(new Error('taken'), { code: 'auth/email-already-in-use' });
                teacherStudents.push(created);
                rosterCreated.push({ name: job.name, username: created.username, code: job.code, className });
                done += 1;
            }
            document.getElementById('rosterName').value = '';
            document.getElementById('rosterUser').value = '';
            document.getElementById('rosterBulk').value = '';
            document.getElementById('rosterCode').value = randomCode();
            message.textContent = done === 1 ? `Created ${jobs[0].name}.` : `Created ${done} students.`;
        } catch (error) {
            message.textContent = (done ? `Created ${done} of ${jobs.length}, then stopped. ` : '') + rosterError(error);
        } finally {
            submit.disabled = false;
            drawClassOptions();
            drawTeacherList();
            drawRosterCreated();
        }
    }

    // Firebase cannot change another user's password from the browser. So the account is re-created with a new code
    // and the saved progress is moved to it. If the old login still exists, it must be deleted in the console first.
    async function resetAccessCode(student) {
        rosterApp = rosterApp || initializeApp(firebaseConfig, 'roster');
        const rosterAuth = getAuth(rosterApp);
        const legacy = !student.username;
        const base = slugName(legacy ? student.name : student.username);
        if (!base) throw appError('app/validation', 'This student needs a name or username first.');
        const code = randomCode();
        let username = base, credential = null;
        for (let attempt = 1; attempt <= (legacy ? 9 : 1) && !credential; attempt++) {
            username = attempt === 1 ? base : `${base.slice(0, 22)}-${attempt}`;
            try { credential = await createUserWithEmailAndPassword(rosterAuth, emailForUsername(username), code); }
            catch (error) { if (error?.code !== 'auth/email-already-in-use' || !legacy) { error.email = emailForUsername(username); throw error; } }
        }
        if (!credential) throw Object.assign(new Error('taken'), { code: 'auth/email-already-in-use', email: emailForUsername(base) });
        try {
            const { id, ...data } = student;
            const profile = { ...data, username, emailAlias: emailForUsername(username), resetAt: Date.now() };
            await setDoc(doc(db, 'students', credential.user.uid), profile);
            await deleteDoc(doc(db, 'students', id));
            Object.assign(student, profile, { id: credential.user.uid });
            return { code, username };
        } finally {
            await signOut(rosterAuth);
        }
    }

    function renderTeacherStudent(student) {
        const target = document.getElementById('studentProgressContent');
        const overall = stats(student);
        const weak = weakSkills(student);
        target.innerHTML = `<button type="button" class="student-link-btn" id="teacherBackBtn">← All students</button><h3 class="teacher-student-title">${esc(student.name || 'Student')}</h3><p class="student-muted">${student.username ? 'Username: ' + esc(student.username) + ' · ' : ''}${esc(activeText(student).replace(/^ · /, ''))}</p>
            <div class="student-form" style="margin:8px 0"><label for="teacherStudentClass">Class</label><input id="teacherStudentClass" list="rosterClassList" maxlength="24" autocomplete="off" value="${esc(classOf(student))}" placeholder="e.g. 3A"><datalist id="rosterClassList">${classNames().map(name => `<option value="${esc(name)}"></option>`).join('')}</datalist><button type="button" class="student-secondary-btn" id="teacherSaveClass">Save class</button><p id="teacherClassMsg" class="student-form-message" role="status"></p></div>
            <div class="student-summary"><div><strong>${overall.answered}</strong><span>questions</span></div><div><strong>${overall.accuracy}%</strong><span>accuracy</span></div><div><strong>${overall.skills}</strong><span>skills tried</span></div></div>${weak.length ? `<p class="student-progress-tip">Needs help with: ${esc(weak.join(', '))}</p>` : ''}
            <div class="student-form" style="margin:8px 0"><label>Forgot the access code?</label><button type="button" class="student-secondary-btn" id="teacherResetCode">Reset access code</button><p id="teacherResetMsg" class="student-form-message" role="status"></p><button type="button" class="student-link-btn" id="teacherResetPrint" hidden>Print login card</button></div>
            <h4 class="student-unit-title">Last 14 days</h4>${trendChart(student.daily)}<div class="student-skill-list">${skillRows(student)}</div>`;
        document.getElementById('teacherBackBtn').onclick = drawTeacherDashboard;
        document.getElementById('teacherResetCode').onclick = async () => {
            const message = document.getElementById('teacherResetMsg');
            const printBtn = document.getElementById('teacherResetPrint');
            if (!window.confirm(`Make a new access code for ${student.name || 'this student'}? Their progress is kept. The old code stops working.`)) return;
            const button = document.getElementById('teacherResetCode');
            button.disabled = true; printBtn.hidden = true;
            message.style.color = ''; message.textContent = 'Resetting…';
            try {
                const result = await resetAccessCode(student);
                const card = { name: student.name || 'Student', username: result.username, code: result.code, className: classOf(student) };
                rosterCreated.push(card);
                message.style.color = 'inherit';
                message.textContent = `New access code for ${card.name}: ${result.code} (username: ${result.username}). Write it down now: it cannot be shown again.`;
                printBtn.hidden = false;
                printBtn.onclick = () => printLoginCards([card]);
            } catch (error) {
                message.textContent = error?.code === 'auth/email-already-in-use'
                    ? `The old login still exists. In the Firebase console open Authentication → Users, delete ${error.email}, then tap Reset again. Progress is kept.`
                    : error?.code === 'app/validation' ? error.message : rosterError(error);
            } finally { button.disabled = false; }
        };
        document.getElementById('teacherSaveClass').onclick = async () => {
            const message = document.getElementById('teacherClassMsg');
            const value = document.getElementById('teacherStudentClass').value.trim().replace(/\s+/g, ' ').slice(0, 24);
            message.textContent = 'Saving…';
            try { await setDoc(doc(db, 'students', student.id), { class: value }, { merge: true }); student.class = value; message.textContent = value ? `Saved. ${student.name || 'Student'} is in ${value}.` : 'Saved. No class.'; }
            catch (error) { message.textContent = 'Could not save the class. Check the Firestore rules.'; }
        };
    }

    const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const todayKey = () => dateKey(new Date());

    function flushProgress() {
        clearTimeout(saveTimer); saveTimer = null;
        if (!currentStudent || (!Object.keys(pending.modes).length && !Object.keys(pending.days).length)) return Promise.resolve();
        const batch = pending;
        pending = { modes: {}, days: {} };
        const now = Date.now();
        const progress = {}, daily = {};
        Object.entries(batch.modes).forEach(([mode, n]) => {
            progress[mode] = { answered: increment(n.answered), correct: increment(n.correct), lastPlayed: now };
            const recent = currentProfile?.progress?.[mode]?.recent;
            if (recent) progress[mode].recent = recent;
        });
        Object.entries(batch.days).forEach(([day, n]) => { daily[day] = { answered: increment(n.answered), correct: increment(n.correct) }; });
        inFlight += 1;
        setSync(navigator.onLine ? 'Saving…' : 'Offline — saved on this device');
        return setDoc(doc(db, 'students', currentStudent.uid), { progress, daily, lastActive: now }, { merge: true }).then(() => {
            failCount = 0;
            inFlight -= 1;
            if (!inFlight) setSync('Saved');
        }).catch(() => {
            inFlight -= 1;
            failCount += 1;
            const merge = (target, source) => Object.entries(source).forEach(([key, n]) => { const t = target[key] || (target[key] = { answered: 0, correct: 0 }); t.answered += n.answered; t.correct += n.correct; });
            merge(pending.modes, batch.modes); merge(pending.days, batch.days);
            if (failCount < 5) { setSync('Not saved yet — will retry'); saveTimer = setTimeout(flushProgress, 15000); }
            else setSync('Could not save progress');
        });
    }

    async function signOutSafely() {
        await Promise.race([flushProgress(), new Promise(resolve => setTimeout(resolve, 3000))]);
        pending = { modes: {}, days: {} };
        rosterCreated = []; teacherStudents = [];
        await signOut(auth);
        currentStudent = null; currentProfile = null;
        setSync('');
    }

    window.studentProgressRecord = function (mode, isCorrect) {
        if (!currentStudent || currentProfile?.role !== 'student' || !mode) return;
        currentProfile.progress = currentProfile.progress || {};
        const item = currentProfile.progress[mode] || { answered: 0, correct: 0 };
        item.answered += 1; if (isCorrect) item.correct += 1;
        item.recent = ((item.recent || '') + (isCorrect ? '1' : '0')).slice(-RECENT_MAX);
        item.lastPlayed = Date.now(); currentProfile.progress[mode] = item; currentProfile.lastActive = Date.now();
        currentProfile.daily = currentProfile.daily || {};
        const today = currentProfile.daily[todayKey()] || (currentProfile.daily[todayKey()] = { answered: 0, correct: 0 });
        today.answered += 1; if (isCorrect) today.correct += 1;
        const m = pending.modes[mode] || (pending.modes[mode] = { answered: 0, correct: 0 });
        const d = pending.days[todayKey()] || (pending.days[todayKey()] = { answered: 0, correct: 0 });
        m.answered += 1; d.answered += 1;
        if (isCorrect) { m.correct += 1; d.correct += 1; }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flushProgress, 1200);
    };

    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushProgress(); });
    window.addEventListener('pagehide', flushProgress);
    window.addEventListener('online', flushProgress);

    markup();
    setAuthMode('student');
    onAuthStateChanged(auth, async user => {
        if (!user) { currentStudent = null; currentProfile = null; updateHeader(); show('studentAuthOverlay'); return; }
        if (user.email?.endsWith('@students.math-skills-app.firebaseapp.com')) {
            currentStudent = user;
            try {
                const snapshot = await getDoc(doc(db, 'students', user.uid));
                currentProfile = snapshot.exists() ? snapshot.data() : { name: 'Student', role: 'student', progress: {} };
            } catch (e) {
                currentProfile = { name: 'Student', role: 'student', progress: {} };
                setSync('Could not load saved progress');
            }
            updateHeader(); hide('studentAuthOverlay');
            return;
        }
        if (await teacherStatus(user) === false) { await signOut(auth); return; }
        currentStudent = null;
        currentProfile = { name: 'Teacher', role: 'teacher', progress: {} };
        updateHeader(); hide('studentAuthOverlay');
    });
})();
