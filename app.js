/* PaperReady – study planner, spaced revision and AI MCQs.
   Plain JavaScript, no build step. Data is saved on the phone (localStorage). */
(function () {
  'use strict';

  var CFG = window.PAPERREADY_CONFIG || {};
  var STORE_KEY = 'paperready_v1';
  var INTERVALS = [1, 3, 7, 14, 30]; // spaced revision, in days
  var EXAMS = ['Matric', 'FSc / ICS', 'MDCAT', 'ECAT', 'O/A Level', 'University', 'Other'];
  var STYLE_FOR_EXAM = { 'Matric': 'Board', 'FSc / ICS': 'Board', 'MDCAT': 'MDCAT', 'ECAT': 'ECAT', 'O/A Level': 'Board', 'University': 'University', 'Other': 'General' };
  var DEFAULT_SUBJECTS = {
    'Matric': ['Biology', 'Chemistry', 'Physics', 'Maths', 'English', 'Urdu', 'Computer'],
    'FSc / ICS': ['Biology', 'Chemistry', 'Physics', 'Maths', 'English', 'Urdu', 'Computer'],
    'MDCAT': ['Biology', 'Chemistry', 'Physics', 'English', 'Logical Reasoning'],
    'ECAT': ['Maths', 'Physics', 'Chemistry', 'English'],
    'O/A Level': ['Biology', 'Chemistry', 'Physics', 'Maths', 'English'],
    'University': [],
    'Other': []
  };

  // ---------- helpers ----------
  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function today() { return dateKey(new Date()); }
  function dateKey(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function addDays(key, n) { var d = new Date(key + 'T00:00:00'); d.setDate(d.getDate() + n); return dateKey(d); }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function svg(path, size) {
    size = size || 22;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  var I = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    plan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    prep: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 14l2 2 4-4"/>',
    progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    fire: '<path d="M12 3c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3-1-5 0-7z"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    tick: '<path d="M5 12l5 5 9-10"/>',
    topic: '<path d="M4 6h16M4 12h10M4 18h7"/>',
    pdf: '<path d="M6 3h9l4 4v14H6z"/><path d="M12 11v6M9 14l3-3 3 3"/>',
    mistakes: '<path d="M5 4h11l3 3v13H5z"/><path d="M9 10l6 6M15 10l-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    back: '<path d="M15 18l-6-6 6-6"/>'
  };
  var LOGO_SVG = '<svg viewBox="0 0 512 512" width="56" height="56" aria-hidden="true"><rect x="4" y="4" width="504" height="504" rx="110" fill="#FFFDF7" stroke="#D4D4D8" stroke-width="8"/><line x1="40" y1="180" x2="472" y2="180" stroke="#BFD3F2" stroke-width="10"/><line x1="40" y1="260" x2="472" y2="260" stroke="#BFD3F2" stroke-width="10"/><line x1="40" y1="340" x2="472" y2="340" stroke="#BFD3F2" stroke-width="10"/><line x1="40" y1="420" x2="472" y2="420" stroke="#BFD3F2" stroke-width="10"/><line x1="128" y1="40" x2="128" y2="472" stroke="#E25D5D" stroke-width="10"/><path d="M178 278l78 78 142-170" fill="none" stroke="#1E3A8A" stroke-width="46" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // ---------- state ----------
  function freshState() {
    return {
      profile: null, // {name, exam, examDate, subjects:[]}
      topics: [],    // {id, subject, title, stage, nextReview, studiedOn, lastScore}
      tasks: [],     // {id, title, mins, done, date}
      mistakes: [],  // {id, q, options, answer, explanation, topic, subtopic}
      history: [],   // {date, topic, score, total, secs, mode}
      study: {},     // {date: minutes}
      streak: { count: 0, last: null },
      quota: { date: null, used: 0 }
    };
  }
  var S;
  try { S = JSON.parse(localStorage.getItem(STORE_KEY)) || freshState(); } catch (e) { S = freshState(); }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast('Could not save. Phone storage may be full.'); } }

  // UI-only state (not saved)
  var UI = {
    view: S.profile ? 'home' : 'onboard',
    onboard: { exam: 'FSc / ICS', subjects: null },
    setup: { source: 'topic', topic: '', subject: '', style: null, difficulty: 'Medium', count: 10, mode: 'Practice', language: 'English', pdf: null, pdfName: '', pdfFrom: 1, pdfTo: 1, pdfPages: 0 },
    quiz: null,
    timer: null,
    planSubject: null
  };

  function markActive() {
    var t = today();
    if (S.streak.last === t) return;
    if (S.streak.last === addDays(t, -1)) S.streak.count += 1; else S.streak.count = 1;
    S.streak.last = t;
  }
  function streakNow() {
    if (!S.streak.last) return 0;
    var gap = daysBetween(S.streak.last, today());
    return gap <= 1 ? S.streak.count : 0;
  }
  function quotaLeft() {
    var max = CFG.FREE_QUIZZES_PER_DAY || 5;
    if (S.quota.date !== today()) return max;
    return Math.max(0, max - S.quota.used);
  }
  function useQuota() {
    if (S.quota.date !== today()) S.quota = { date: today(), used: 0 };
    S.quota.used += 1;
  }
  function dueTopics() {
    var t = today();
    return S.topics.filter(function (x) { return x.nextReview && x.nextReview <= t; })
      .sort(function (a, b) { return a.nextReview < b.nextReview ? -1 : 1; });
  }
  function scheduleAfterStudy(topic) {
    topic.stage = 0; topic.studiedOn = today(); topic.nextReview = addDays(today(), INTERVALS[0]);
  }
  function scheduleAfterReview(topic, pct) {
    if (pct == null || pct >= 60) {
      topic.stage = Math.min((topic.stage || 0) + 1, INTERVALS.length - 1);
      topic.nextReview = addDays(today(), INTERVALS[topic.stage]);
    } else {
      topic.stage = 0; topic.nextReview = addDays(today(), 1);
    }
    if (pct != null) topic.lastScore = pct;
  }
  function weekMinutes() {
    var total = 0;
    for (var i = 0; i < 7; i++) total += S.study[addDays(today(), -i)] || 0;
    return total;
  }

  // ---------- rendering ----------
  function render() {
    var v = UI.view, html = '';
    if (v === 'onboard') html = viewOnboard();
    else if (v === 'home') html = viewHome();
    else if (v === 'plan') html = viewPlan();
    else if (v === 'prep') html = viewPrep();
    else if (v === 'loading') html = viewLoading();
    else if (v === 'quiz') html = viewQuiz();
    else if (v === 'results') html = viewResults();
    else if (v === 'progress') html = viewProgress();
    else if (v === 'timer') html = viewTimer();
    else if (v === 'mistakes') html = viewMistakes();
    else if (v === 'premium') html = viewPremium();
    $('#app').innerHTML = html + (['home', 'plan', 'prep', 'progress', 'mistakes', 'premium'].indexOf(v) >= 0 ? navBar(v) : '');
    window.scrollTo(0, 0);
  }
  function navBar(active) {
    var items = [['home', 'Home', I.home], ['plan', 'Plan', I.plan], ['prep', 'Prep', I.prep], ['progress', 'Progress', I.progress]];
    if (active === 'mistakes') active = 'prep';
    if (active === 'premium') active = 'progress';
    return '<nav class="tabs" aria-label="Main"><div class="inner">' + items.map(function (it) {
      return '<button data-act="go" data-to="' + it[0] + '" class="' + (it[0] === active ? 'on' : '') + '"' + (it[0] === active ? ' aria-current="page"' : '') + '>' + svg(it[2]) + '<span>' + it[1] + '</span></button>';
    }).join('') + '</div></nav>';
  }
  function chips(group, options, current) {
    return '<div class="chips" role="group">' + options.map(function (o) {
      var on = String(o) === String(current);
      return '<button class="chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-act="chip" data-group="' + group + '" data-val="' + esc(o) + '">' + esc(o) + '</button>';
    }).join('') + '</div>';
  }

  // Onboarding
  function viewOnboard() {
    var o = UI.onboard;
    var subs = o.subjects || DEFAULT_SUBJECTS[o.exam].slice();
    o.subjects = subs;
    var all = DEFAULT_SUBJECTS[o.exam].concat(subs.filter(function (s) { return DEFAULT_SUBJECTS[o.exam].indexOf(s) < 0; }));
    return '<main class="screen">' +
      '<div class="logo">' + LOGO_SVG + '<div class="word"><b>Paper</b><b>Ready</b></div></div>' +
      '<p class="hand">Parho. Dohrao. PaperReady.</p>' +
      '<h1>Let\'s set up your plan</h1>' +
      '<div class="col"><label class="label" for="ob-name">Your name</label><input id="ob-name" type="text" maxlength="30" placeholder="e.g. Sara" autocomplete="given-name"></div>' +
      '<div class="col"><span class="label">Exam</span>' + chips('exam', EXAMS, o.exam) + '</div>' +
      '<div class="col"><label class="label" for="ob-date">Exam date</label><input id="ob-date" type="date" min="' + today() + '"></div>' +
      '<div class="col"><span class="label">Subjects</span><div class="chips" role="group">' + all.map(function (s) {
        var on = subs.indexOf(s) >= 0;
        return '<button class="chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-act="ob-sub" data-val="' + esc(s) + '">' + esc(s) + '</button>';
      }).join('') + '</div>' +
      '<div class="row"><label class="sr" for="ob-newsub">Add a subject</label><input id="ob-newsub" type="text" maxlength="40" placeholder="Add another subject"><button class="icon-btn" data-act="ob-addsub" aria-label="Add subject">' + svg(I.plus) + '</button></div></div>' +
      '<button class="btn red block" data-act="ob-done">Start studying</button>' +
      '<p class="muted small center">Your plan is saved on this phone.</p>' +
      '</main>';
  }

  // Home
  function viewHome() {
    var p = S.profile, due = dueTopics(), t = today();
    var todays = S.tasks.filter(function (x) { return x.date === t; });
    var doneCount = todays.filter(function (x) { return x.done; }).length;
    var daysLeft = p.examDate ? daysBetween(t, p.examDate) : null;
    var studied = S.topics.filter(function (x) { return x.studiedOn; }).length;
    var pct = S.topics.length ? Math.round(studied / S.topics.length * 100) : 0;
    var st = streakNow();
    var hero = '<section class="hero" aria-label="Exam countdown"><div class="col" style="gap:2px">' +
      '<span class="lbl">' + esc(p.exam) + ' exam</span>' +
      '<span class="big">' + (daysLeft == null ? 'Set your exam date' : daysLeft > 0 ? daysLeft + ' days left' : daysLeft === 0 ? 'Exam day. Good luck!' : 'Exam done') + '</span>' +
      '<span class="lbl">' + (S.topics.length ? 'Syllabus ' + pct + '% studied' : 'Add your chapters in Plan') + '</span></div>' +
      '<div class="ring" style="background:conic-gradient(var(--red) 0 ' + pct + '%, #3B5BB5 ' + pct + '% 100%)"><div>' + pct + '%</div></div></section>';
    var revise = '<section class="card accent"><div class="between"><h2>Revise today</h2><span class="tag red">' + due.length + ' topic' + (due.length === 1 ? '' : 's') + '</span></div>' +
      (due.length ? due.slice(0, 5).map(function (x) {
        var label = 'Day ' + INTERVALS[x.stage || 0];
        return '<div class="between"><span style="font-weight:700">' + esc(x.subject) + ': ' + esc(x.title) + '</span><span class="tag">' + label + '</span></div>';
      }).join('') + '<button class="btn red block" data-act="revise-quiz">Start revision quiz</button>'
        : '<p class="empty">Nothing due. Mark chapters as studied in Plan and they\'ll come back here on day 1, 3, 7, 14 and 30.</p>') + '</section>';
    var tasks = '<section class="card"><div class="between"><h2>Study tasks</h2><span class="muted small">' + doneCount + ' of ' + todays.length + ' done</span></div>' +
      (todays.length ? todays.map(function (x) {
        return '<div class="row"><button class="check" data-act="task-toggle" data-id="' + x.id + '" aria-pressed="' + !!x.done + '"><span class="box' + (x.done ? ' done' : '') + '">' + (x.done ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="3" aria-hidden="true">' + I.tick + '</svg>' : '') + '</span><span class="' + (x.done ? 'done-text' : '') + '" style="flex:1">' + esc(x.title) + '</span>' + (x.mins ? '<span class="muted small">' + x.mins + ' min</span>' : '') + '</button>' +
          '<button class="icon-btn" style="border:none;width:36px" data-act="task-del" data-id="' + x.id + '" aria-label="Delete task">' + svg(I.trash, 18) + '</button></div>';
      }).join('') : '<p class="empty">No tasks yet for today.</p>') +
      '<div class="row"><label class="sr" for="new-task">New task</label><input id="new-task" type="text" maxlength="80" placeholder="Add a task, e.g. Maths Ex 4.2"><button class="icon-btn" data-act="task-add" aria-label="Add task">' + svg(I.plus) + '</button></div></section>';
    return '<main class="screen"><header class="between"><div class="col" style="gap:0"><span class="hand">Salaam, ' + esc(p.name || 'friend') + '!</span><h1>Today\'s plan</h1></div>' +
      '<span class="pill red">' + svg(I.fire, 18) + st + '-day streak</span></header>' +
      hero + revise + tasks +
      '<button class="btn ghost block" data-act="timer-open">' + svg(I.timer) + 'Start focus timer</button></main>';
  }

  // Plan
  function viewPlan() {
    var subs = S.profile.subjects;
    var cur = UI.planSubject || subs[0] || '';
    UI.planSubject = cur;
    var list = S.topics.filter(function (x) { return x.subject === cur; });
    return '<main class="screen"><header class="col" style="gap:0"><span class="hand">Your syllabus</span><h1>Plan</h1></header>' +
      (subs.length ? chips('plansub', subs, cur) : '<p class="empty">Add subjects in Progress → Settings.</p>') +
      '<section class="card"><div class="between"><h2>' + esc(cur) + ' chapters</h2><span class="muted small">' + list.filter(function (x) { return x.studiedOn; }).length + '/' + list.length + ' studied</span></div>' +
      (list.length ? list.map(function (x) {
        var status = !x.studiedOn ? '<button class="chip" data-act="topic-studied" data-id="' + x.id + '">Mark studied</button>'
          : '<span class="tag">' + (x.nextReview <= today() ? 'Revise today' : 'Next: ' + x.nextReview.slice(5)) + '</span>';
        return '<div class="between" style="min-height:44px"><span style="font-weight:700;flex:1">' + esc(x.title) + (x.lastScore != null ? ' <span class="muted small">(' + x.lastScore + '%)</span>' : '') + '</span>' + status +
          '<button class="icon-btn" style="border:none;width:36px" data-act="topic-del" data-id="' + x.id + '" aria-label="Delete chapter">' + svg(I.trash, 18) + '</button></div>';
      }).join('') : '<p class="empty">No chapters yet. Add the chapters of your syllabus below.</p>') +
      '<div class="row"><label class="sr" for="new-topic">New chapter</label><input id="new-topic" type="text" maxlength="80" placeholder="e.g. Ch 5: Enzymes"><button class="icon-btn" data-act="topic-add" aria-label="Add chapter">' + svg(I.plus) + '</button></div>' +
      '<p class="muted small">Tip: add several at once, separated by commas.</p></section>' +
      '<p class="muted small">When you mark a chapter studied, PaperReady brings it back for revision after 1, 3, 7, 14 and 30 days. A low quiz score brings it back sooner.</p></main>';
  }

  // Prep (quiz setup)
  function viewPrep() {
    var s = UI.setup, left = quotaLeft();
    var style = s.style || STYLE_FOR_EXAM[S.profile.exam] || 'General';
    var demo = !CFG.QUIZ_FUNCTION_URL;
    var src = function (key, icon, title, sub) {
      return '<button class="source' + (s.source === key ? ' on' : '') + '" aria-pressed="' + (s.source === key) + '" data-act="source" data-val="' + key + '">' + svg(icon) + '<b>' + title + '</b><span>' + sub + '</span></button>';
    };
    var body = '';
    if (s.source === 'topic') {
      body = '<div class="col"><span class="label">Subject</span>' + chips('subject', S.profile.subjects.length ? S.profile.subjects : ['General'], s.subject || S.profile.subjects[0] || 'General') + '</div>' +
        '<div class="col"><label class="label" for="q-topic">Topic</label><input id="q-topic" type="text" maxlength="150" placeholder="e.g. Enzymes, Newton\'s laws, Tenses" value="' + esc(s.topic) + '"></div>';
    } else if (s.source === 'pdf') {
      body = '<div class="col"><label class="label" for="q-pdf">PDF notes or chapter</label><input id="q-pdf" type="file" accept="application/pdf" style="min-height:48px">' +
        (s.pdfName ? '<p class="muted small">' + esc(s.pdfName) + ' · ' + s.pdfPages + ' pages</p>' +
          '<div class="row"><div class="col" style="flex:1;gap:4px"><label class="label" for="q-from">From page</label><input id="q-from" type="number" min="1" max="' + s.pdfPages + '" value="' + s.pdfFrom + '"></div>' +
          '<div class="col" style="flex:1;gap:4px"><label class="label" for="q-to">To page</label><input id="q-to" type="number" min="1" max="' + s.pdfPages + '" value="' + s.pdfTo + '"></div></div>' +
          '<p class="muted small">Free plan: up to ' + (CFG.FREE_PDF_PAGES || 20) + ' pages per quiz.</p>' : '<p class="muted small">Text PDFs work best. Scanned photos of pages are not supported yet.</p>') + '</div>';
    } else {
      body = '<section class="card accent"><h2>Mistake Book</h2><p class="muted">' + S.mistakes.length + ' saved question' + (S.mistakes.length === 1 ? '' : 's') + '. Practise them again (no AI quota used).</p>' +
        '<button class="btn plain" data-act="go" data-to="mistakes">View all mistakes</button></section>';
    }
    var settings = s.source === 'mistakes' ? '<div class="col"><span class="label">Mode</span>' + chips('mode', ['Practice', 'Timed exam', 'Flashcards'], s.mode) + '</div>'
      : '<div class="col"><span class="label">Exam style</span>' + chips('style', ['Board', 'MDCAT', 'ECAT', 'University', 'General'], style) + '</div>' +
        '<div class="col"><span class="label">Difficulty</span>' + chips('difficulty', ['Easy', 'Medium', 'Hard', 'Mixed'], s.difficulty) + '</div>' +
        '<div class="col"><span class="label">Questions</span>' + chips('count', [10, 20, 30], s.count) + '</div>' +
        '<div class="col"><span class="label">Language</span>' + chips('language', ['English', 'Urdu', 'Both'], s.language) + '</div>' +
        '<div class="col"><span class="label">Mode</span>' + chips('mode', ['Practice', 'Timed exam', 'Flashcards'], s.mode) + '</div>';
    var btn = s.source === 'mistakes'
      ? '<button class="btn red block" data-act="generate"' + (S.mistakes.length ? '' : ' disabled') + '>Practise my mistakes</button>'
      : '<button class="btn red block" data-act="generate"' + (left ? '' : ' disabled') + '>Generate ' + s.count + ' MCQs</button>' +
        '<p class="muted small center">' + (left ? left + ' of ' + (CFG.FREE_QUIZZES_PER_DAY || 5) + ' free AI quizzes left today' : 'You\'ve used today\'s ' + (CFG.FREE_QUIZZES_PER_DAY || 5) + ' free quizzes. Come back tomorrow, practise your mistakes, or go Premium.') + '</p>' +
        (left ? '' : '<button class="btn ghost block" data-act="go" data-to="premium">Unlimited quizzes with Premium · ' + esc(CFG.PREMIUM_PRICE || '$2 / month') + '</button>');
    return '<main class="screen"><header class="col" style="gap:0"><span class="hand">Let\'s get you paper ready</span><h1>New quiz</h1></header>' +
      (demo && s.source !== 'mistakes' ? '<p class="notice">Demo mode: AI is not connected yet, so you\'ll get sample questions.</p>' : '') +
      '<div class="sources">' + src('topic', I.topic, 'Topic', 'Type or pick') + src('pdf', I.pdf, 'PDF', 'Upload notes') + src('mistakes', I.mistakes, 'Mistakes', 'Retry wrong') + '</div>' +
      body + settings + btn + '</main>';
  }

  function viewLoading() {
    return '<main class="screen center" style="justify-content:center;gap:18px"><div class="spinner" role="progressbar" aria-label="Generating"></div>' +
      '<h1>Writing your questions…</h1><p class="muted">' + esc(UI.loadingMsg || 'This usually takes 10–30 seconds.') + '</p>' +
      '<button class="btn plain" data-act="cancel-gen">Cancel</button></main>';
  }

  // Quiz
  function viewQuiz() {
    var q = UI.quiz, item = q.items[q.i], total = q.items.length;
    var correct = q.answers.filter(function (a, idx) { return a === q.items[idx].answer; }).length;
    var head = '<header class="col"><div class="between"><button class="icon-btn" data-act="quiz-quit" aria-label="Close quiz">' + svg(I.close) + '</button>' +
      '<span class="muted" style="font-weight:800">Question ' + (q.i + 1) + ' of ' + total + '</span>' +
      (q.mode === 'Timed exam' ? '<span class="pill" id="qtimer" style="color:var(--navy)">' + fmtTime(q.secsLeft) + '</span>' : '<span class="pill" style="color:var(--navy)">' + correct + ' correct</span>') + '</div>' +
      '<div class="progress"><div style="width:' + Math.round((q.i) / total * 100) + '%"></div></div></header>';
    var meta = '<span class="label" style="color:var(--red)">' + esc([q.subject, item.subtopic, item.difficulty].filter(Boolean).join(' · ')) + '</span>';
    if (q.mode === 'Flashcards') {
      return '<main class="screen">' + head + meta +
        '<button class="flash" data-act="flip" aria-label="Flip card">' + (q.flipped ? '<span><span style="color:var(--navy)">' + esc(item.options[item.answer]) + '</span><br><span class="muted" style="font-size:15px">' + esc(item.explanation || '') + '</span></span>' : esc(item.q)) + '</button>' +
        '<p class="muted small center">Tap the card to ' + (q.flipped ? 'see the question' : 'see the answer') + '</p>' +
        '<div class="row"><button class="btn ghost" style="flex:1" data-act="flash-mark" data-val="0">Still learning</button><button class="btn navy" style="flex:1" data-act="flash-mark" data-val="1">I knew it</button></div></main>';
    }
    var picked = q.answers[q.i], reveal = q.mode === 'Practice' && picked != null;
    var opts = item.options.map(function (o, idx) {
      var cls = 'option';
      if (reveal) { if (idx === item.answer) cls += ' right'; else if (idx === picked) cls += ' wrong'; }
      else if (picked === idx) cls += ' picked';
      return '<button class="' + cls + '" data-act="pick" data-val="' + idx + '"' + (reveal ? ' disabled' : '') + '><span class="letter">' + 'ABCD'[idx] + '</span><span style="flex:1">' + esc(o) + '</span></button>';
    }).join('');
    var fb = '';
    if (reveal) {
      var ok = picked === item.answer;
      fb = '<section class="card ' + (ok ? 'accent-navy' : 'accent') + '"><span class="hand" style="color:' + (ok ? 'var(--navy)' : 'var(--red)') + ';font-size:24px">' + (ok ? 'Shabash! Correct.' : 'Not quite. Correct answer: ' + 'ABCD'[item.answer]) + '</span>' +
        '<p style="font-weight:600;font-size:14px;line-height:1.45">' + esc(item.explanation || '') + (item.page ? ' <span class="muted small">(page ' + esc(item.page) + ')</span>' : '') + '</p></section>' +
        '<button class="btn plain" data-act="report">Report this question</button>';
    }
    var last = q.i === total - 1;
    var nextBtn = q.mode === 'Practice'
      ? (reveal ? '<button class="btn navy block" data-act="next">' + (last ? 'See results' : 'Next question') + '</button>' : '')
      : '<div class="row">' + (q.i > 0 ? '<button class="btn ghost" style="flex:1" data-act="prev">Back</button>' : '') + '<button class="btn navy" style="flex:2" data-act="next"' + (picked == null ? ' disabled' : '') + '>' + (last ? 'Submit' : 'Next') + '</button></div>';
    return '<main class="screen">' + head + meta + '<h1 style="font-size:21px;line-height:1.35">' + esc(item.q) + '</h1>' +
      '<div class="col">' + opts + '</div>' + fb + nextBtn + '</main>';
  }
  function fmtTime(s) { s = Math.max(0, s | 0); var m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }

  function viewResults() {
    var r = UI.result;
    var pct = r.total ? Math.round(r.score / r.total * 100) : 0;
    var subs = Object.keys(r.bySub).map(function (k) { var b = r.bySub[k]; return { name: k, pct: Math.round(b.c / b.t * 100) }; })
      .sort(function (a, b) { return a.pct - b.pct; });
    var praise = pct >= 80 ? 'Well done, ' : pct >= 60 ? 'Good effort, ' : 'Keep going, ';
    return '<main class="screen center">' +
      '<span class="hand" style="color:var(--red);font-size:30px">' + praise + esc(S.profile.name || 'friend') + '!</span>' +
      '<div class="ring" style="width:132px;height:132px;background:conic-gradient(var(--navy) 0 ' + pct + '%, var(--line) ' + pct + '% 100%)"><div style="width:108px;height:108px;background:var(--cream);color:var(--navy);flex-direction:column;display:flex"><span style="font-size:30px">' + r.score + '/' + r.total + '</span><span class="muted small">' + pct + '%</span></div></div>' +
      '<p class="muted">' + esc(r.title) + ' · ' + Math.max(1, Math.round(r.secs / 60)) + ' min</p>' +
      (subs.length > 1 ? '<section class="card" style="width:100%;text-align:left"><h2>By sub-topic</h2>' + subs.map(function (s) {
        return '<div class="col" style="gap:4px"><div class="between" style="font-size:14px;font-weight:700"><span>' + esc(s.name) + '</span><span style="font-weight:900;color:' + (s.pct < 60 ? 'var(--red)' : 'var(--navy)') + '">' + s.pct + '%</span></div><div class="progress' + (s.pct < 60 ? ' red' : '') + '"><div style="width:' + s.pct + '%"></div></div></div>';
      }).join('') + '</section>' : '') +
      (r.wrong.length ? '<section class="card accent" style="width:100%;text-align:left"><h2>' + r.wrong.length + ' mistake' + (r.wrong.length === 1 ? '' : 's') + ' saved to your Mistake Book</h2><p class="muted">You can practise them any time from Prep → Mistakes.</p></section>' : '') +
      '<div class="row" style="width:100%">' + (r.wrong.length ? '<button class="btn ghost" style="flex:1" data-act="retry-wrong">Retry wrong only</button>' : '') +
      (r.canMore ? '<button class="btn red" style="flex:1" data-act="more-like">10 more like these</button>' : '') + '</div>' +
      '<button class="btn plain" data-act="go" data-to="home">Back to home</button></main>';
  }

  function viewProgress() {
    var h = S.history, avg = h.length ? Math.round(h.reduce(function (a, x) { return a + x.score / x.total * 100; }, 0) / h.length) : 0;
    var weak = S.topics.filter(function (x) { return x.lastScore != null && x.lastScore < 60; });
    var days = [];
    for (var i = 6; i >= 0; i--) { var k = addDays(today(), -i); days.push({ k: k, m: S.study[k] || 0 }); }
    var max = Math.max(30, Math.max.apply(null, days.map(function (d) { return d.m; })));
    var p = S.profile;
    return '<main class="screen"><header class="col" style="gap:0"><span class="hand">How you\'re doing</span><h1>Progress</h1></header>' +
      '<div class="row" style="gap:10px">' +
      stat(streakNow() + ' days', 'Streak') + stat(weekMinutes() + ' min', 'Studied this week') + stat(h.length ? avg + '%' : '–', 'Average score') + '</div>' +
      '<section class="card"><h2>Focus minutes, last 7 days</h2><div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;align-items:end;height:110px" role="img" aria-label="Study minutes per day for the last 7 days">' +
      days.map(function (d) { return '<div class="col" style="gap:4px;align-items:center;justify-content:flex-end;height:100%"><div style="width:100%;border-radius:6px;background:' + (d.m ? 'var(--navy)' : 'var(--line)') + ';height:' + Math.max(4, Math.round(d.m / max * 80)) + 'px"></div><span class="muted" style="font-size:11px">' + ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(d.k + 'T00:00:00').getDay()] + '</span></div>'; }).join('') + '</div></section>' +
      '<section class="card accent"><h2>Weak chapters</h2>' + (weak.length ? weak.map(function (x) { return '<div class="between"><span style="font-weight:700">' + esc(x.subject) + ': ' + esc(x.title) + '</span><span class="tag red">' + x.lastScore + '%</span></div>'; }).join('') : '<p class="empty">None yet. Chapters scoring under 60% will show here.</p>') + '</section>' +
      '<section class="card"><h2>Recent quizzes</h2>' + (h.length ? h.slice(-5).reverse().map(function (x) { return '<div class="between"><span style="font-weight:700">' + esc(x.topic) + '</span><span class="muted small">' + x.score + '/' + x.total + ' · ' + x.date.slice(5) + '</span></div>'; }).join('') : '<p class="empty">No quizzes yet.</p>') + '</section>' +
      '<section class="card accent-navy"><div class="between"><h2>PaperReady Premium</h2><span class="tag">' + esc(CFG.PREMIUM_PRICE || '$2 / month') + '</span></div><p class="muted">Unlimited AI quizzes and bigger PDFs.</p><button class="btn ghost block" data-act="go" data-to="premium">See Premium</button></section>' +
      '<section class="card"><h2>Settings</h2>' +
      '<div class="col"><label class="label" for="set-name">Name</label><input id="set-name" type="text" maxlength="30" value="' + esc(p.name) + '"></div>' +
      '<div class="col"><label class="label" for="set-date">Exam date</label><input id="set-date" type="date" value="' + esc(p.examDate || '') + '"></div>' +
      '<div class="col"><span class="label">Exam</span>' + chips('set-exam', EXAMS, p.exam) + '</div>' +
      '<div class="col"><span class="label">Subjects</span><div class="chips">' + p.subjects.map(function (s) { return '<button class="chip on" data-act="sub-remove" data-val="' + esc(s) + '" aria-label="Remove ' + esc(s) + '">' + esc(s) + ' ×</button>'; }).join('') + '</div>' +
      '<div class="row"><label class="sr" for="set-newsub">Add subject</label><input id="set-newsub" type="text" maxlength="40" placeholder="Add a subject"><button class="icon-btn" data-act="sub-add" aria-label="Add subject">' + svg(I.plus) + '</button></div></div>' +
      '<button class="btn navy block" data-act="settings-save">Save settings</button>' +
      '<p class="muted small">Phone-time study reminders will come in the Android version.</p>' +
      '<button class="btn plain" data-act="reset" style="color:var(--red-dark)">Delete all my data</button></section></main>';
  }
  function stat(v, l) { return '<div class="card" style="flex:1;padding:12px;gap:2px;text-align:center"><span style="font-size:20px;font-weight:900;color:var(--navy)">' + v + '</span><span class="muted" style="font-size:12px">' + l + '</span></div>'; }

  function viewMistakes() {
    return '<main class="screen"><header class="row"><button class="icon-btn" data-act="go" data-to="prep" aria-label="Back">' + svg(I.back) + '</button><h1>Mistake Book</h1></header>' +
      (S.mistakes.length ? S.mistakes.slice().reverse().map(function (m) {
        return '<section class="card accent"><span class="label">' + esc(m.topic) + '</span><p style="font-weight:800">' + esc(m.q) + '</p><p class="muted">Answer: <b style="color:var(--navy)">' + esc(m.options[m.answer]) + '</b></p>' +
          (m.explanation ? '<p class="muted small">' + esc(m.explanation) + '</p>' : '') +
          '<button class="btn plain" data-act="mistake-del" data-id="' + m.id + '">Remove, I know this now</button></section>';
      }).join('') : '<p class="empty">No mistakes saved yet. Wrong answers from your quizzes will appear here.</p>') + '</main>';
  }

  function viewPremium() {
    var price = esc(CFG.PREMIUM_PRICE || '$2 / month'), free = CFG.FREE_QUIZZES_PER_DAY || 5;
    var row = function (label, f, p) {
      return '<tr><th scope="row" style="text-align:left;font-weight:700;padding:10px 0;border-top:1px solid var(--line)">' + label + '</th><td style="text-align:center;padding:10px 4px;border-top:1px solid var(--line);color:var(--muted);font-weight:700">' + f + '</td><td style="text-align:center;padding:10px 4px;border-top:1px solid var(--line);color:var(--navy);font-weight:900">' + p + '</td></tr>';
    };
    return '<main class="screen"><header class="row"><button class="icon-btn" data-act="go" data-to="progress" aria-label="Back">' + svg(I.back) + '</button><div class="col" style="gap:0"><span class="hand">Study without limits</span><h1>PaperReady Premium</h1></div></header>' +
      '<section class="hero"><div class="col" style="gap:2px"><span class="lbl">Premium plan</span><span class="big">' + price + '</span><span class="lbl">Cancel any time</span></div>' + LOGO_SVG.replace('width="56" height="56"', 'width="64" height="64"') + '</section>' +
      '<section class="card"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr><th style="text-align:left;padding-bottom:6px" class="label">Feature</th><th class="label" style="padding-bottom:6px">Free</th><th class="label" style="padding-bottom:6px;color:var(--navy)">Premium</th></tr></thead><tbody>' +
      row('AI quizzes per day', free, 'Unlimited*') +
      row('PDF pages per quiz', CFG.FREE_PDF_PAGES || 20, CFG.PREMIUM_PDF_PAGES || 100) +
      row('Study plan, revision, timer', 'Yes', 'Yes') +
      row('Mistake Book', 'Yes', 'Yes') +
      row('Timed exams and flashcards', 'Yes', 'Yes') +
      '</tbody></table><p class="muted small">*Fair use: up to 50 AI quizzes a day.</p></section>' +
      (CFG.PAYMENTS_LIVE
        ? '<button class="btn red block" data-act="buy-premium">Get Premium · ' + price + '</button>'
        : '<button class="btn red block" disabled>Get Premium · ' + price + '</button><p class="muted small center">Payments open when PaperReady launches on Google Play. Until then, enjoy ' + free + ' free quizzes every day.</p>') +
      '</main>';
  }

  function viewTimer() {
    var t = UI.timer;
    return '<main class="screen center" style="justify-content:center;gap:20px"><span class="hand">' + (t.running ? 'Phone down, focus on.' : 'Ready when you are') + '</span>' +
      '<div class="timer-face" id="tface" role="timer" aria-live="off">' + fmtTime(t.left) + '</div>' +
      chips('tmins', [15, 25, 45, 60], t.mins) +
      '<div class="row" style="width:100%">' + (t.running ? '<button class="btn ghost" style="flex:1" data-act="timer-pause">Pause</button>' : '<button class="btn red" style="flex:1" data-act="timer-start">' + (t.left < t.mins * 60 ? 'Resume' : 'Start') + '</button>') +
      '<button class="btn plain" style="flex:1" data-act="timer-stop">Finish</button></div>' +
      '<p class="muted small">Study minutes are added to your progress when you finish.</p></main>';
  }

  // ---------- quiz generation ----------
  var DEMO_BANK = [
    { q: 'Which enzyme breaks down starch into maltose?', options: ['Pepsin', 'Amylase', 'Lipase', 'Trypsin'], answer: 1, explanation: 'Amylase (in saliva and pancreatic juice) digests starch into maltose. Pepsin acts on proteins and lipase on fats.', subtopic: 'Digestive enzymes' },
    { q: 'An enzyme loses its activity at very high temperature mainly because it:', options: ['Gains extra substrate', 'Becomes denatured', 'Turns into a coenzyme', 'Speeds up too much'], answer: 1, explanation: 'High heat breaks the bonds holding the active site\'s shape, so the enzyme is denatured.', subtopic: 'Factors affecting enzymes' },
    { q: 'The SI unit of force is:', options: ['Joule', 'Watt', 'Newton', 'Pascal'], answer: 2, explanation: 'Force is measured in newtons (N); 1 N = 1 kg·m/s².', subtopic: 'Units' },
    { q: 'Which quantity is a vector?', options: ['Speed', 'Mass', 'Displacement', 'Time'], answer: 2, explanation: 'Displacement has both magnitude and direction, so it is a vector.', subtopic: 'Scalars and vectors' },
    { q: 'One mole of any substance contains about how many particles?', options: ['6.02 × 10^23', '3.0 × 10^8', '1.6 × 10^-19', '9.8 × 10^1'], answer: 0, explanation: 'Avogadro\'s number is about 6.02 × 10^23 particles per mole.', subtopic: 'Mole concept' },
    { q: 'Which is the correct passive voice of "She writes a letter"?', options: ['A letter is written by her.', 'A letter was written by her.', 'A letter has been written by her.', 'A letter writes her.'], answer: 0, explanation: 'Present simple active becomes "is/are + past participle" in the passive.', subtopic: 'Voice' },
    { q: 'Competitive inhibitors work by:', options: ['Destroying the enzyme', 'Binding to the active site', 'Changing the pH', 'Adding more substrate'], answer: 1, explanation: 'A competitive inhibitor resembles the substrate and occupies the active site.', subtopic: 'Enzyme inhibition' },
    { q: 'What is the derivative of x²?', options: ['x', '2x', 'x³/3', '2'], answer: 1, explanation: 'Using the power rule, d/dx (xⁿ) = n·xⁿ⁻¹, so d/dx (x²) = 2x.', subtopic: 'Differentiation' },
    { q: 'Which organelle is the site of aerobic respiration?', options: ['Ribosome', 'Golgi body', 'Mitochondrion', 'Nucleus'], answer: 2, explanation: 'Mitochondria carry out aerobic respiration and produce most of the cell\'s ATP.', subtopic: 'Cell organelles' },
    { q: 'pH of a neutral solution at 25 °C is:', options: ['0', '7', '14', '1'], answer: 1, explanation: 'At 25 °C pure water has [H⁺] = 10⁻⁷ M, so pH = 7.', subtopic: 'Acids and bases' }
  ];

  var genAbort = null;
  function generate() {
    var s = UI.setup;
    if (s.source === 'mistakes') {
      var items = shuffle(S.mistakes).slice(0, 20).map(function (m) { return { q: m.q, options: m.options, answer: m.answer, explanation: m.explanation, subtopic: m.subtopic || m.topic, mistakeId: m.id }; });
      return startQuiz(items, 'Mistake Book', 'Mixed', false);
    }
    var subject = s.subject || S.profile.subjects[0] || 'General';
    var topicEl = $('#q-topic'); if (topicEl) s.topic = topicEl.value.trim();
    if (s.source === 'topic' && !s.topic) { toast('Type a topic first'); if (topicEl) topicEl.focus(); return; }
    if (s.source === 'pdf' && !s.pdf) { toast('Choose a PDF first'); return; }
    if (!quotaLeft()) { toast('Daily free quizzes used'); return; }
    var title = s.source === 'pdf' ? s.pdfName : subject + ': ' + s.topic;
    var payload = {
      examStyle: s.style || STYLE_FOR_EXAM[S.profile.exam] || 'General', examLevel: S.profile.exam, subject: subject,
      topic: s.source === 'topic' ? s.topic : '', difficulty: s.difficulty, count: s.count, language: s.language
    };
    UI.view = 'loading'; UI.loadingMsg = s.source === 'pdf' ? 'Reading your PDF…' : 'This usually takes 10–30 seconds.'; render();
    var textPromise = s.source === 'pdf' ? extractPdfText(s.pdf, s.pdfFrom, s.pdfTo) : Promise.resolve(null);
    textPromise.then(function (txt) {
      if (s.source === 'pdf') {
        if (!txt || txt.replace(/\s/g, '').length < 300) throw new Error('This PDF has too little text. It may be scanned photos, which aren\'t supported yet.');
        payload.pdfText = txt.slice(0, 60000); payload.pdfPages = s.pdfFrom + '-' + s.pdfTo;
        UI.loadingMsg = 'Writing questions from your pages…'; if (UI.view === 'loading') render();
      }
      return callAI(payload);
    }).then(function (items) {
      if (UI.view !== 'loading') return;
      if (!items.length) throw new Error('No questions came back. Please try again.');
      useQuota(); save();
      startQuiz(items, title, subject, true);
    }).catch(function (err) {
      UI.pendingReview = null;
      if (UI.view !== 'loading') return;
      UI.view = 'prep'; render(); toast(err && err.message ? err.message : 'Something went wrong. Check your internet and try again.');
    });
  }
  function callAI(payload) {
    if (!CFG.QUIZ_FUNCTION_URL) {
      return new Promise(function (res) { setTimeout(function () {
        var pool = shuffle(DEMO_BANK), out = [];
        for (var i = 0; i < payload.count; i++) out.push(Object.assign({}, pool[i % pool.length]));
        res(out);
      }, 1200); });
    }
    genAbort = typeof AbortController !== 'undefined' ? new AbortController() : null;
    return fetch(CFG.QUIZ_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CFG.SUPABASE_ANON_KEY, 'apikey': CFG.SUPABASE_ANON_KEY },
      body: JSON.stringify(payload),
      signal: genAbort ? genAbort.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || 'The quiz server had a problem (' + r.status + ').');
        return (data.questions || []).filter(validQ);
      });
    });
  }
  function validQ(q) {
    return q && typeof q.q === 'string' && Array.isArray(q.options) && q.options.length === 4 && q.answer >= 0 && q.answer <= 3;
  }

  var pdfjsPromise = null;
  function loadPdfJs() {
    if (!pdfjsPromise) {
      var base = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/';
      pdfjsPromise = import(base + 'pdf.min.mjs').then(function (lib) {
        lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
        return lib;
      });
    }
    return pdfjsPromise;
  }
  function openPdf(file) {
    return loadPdfJs().then(function (lib) { return file.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; }); });
  }
  function extractPdfText(file, from, to) {
    return openPdf(file).then(function (doc) {
      var pages = [], jobs = [];
      for (var p = from; p <= to; p++) {
        (function (n) {
          jobs.push(doc.getPage(n).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
            pages[n - from] = '[Page ' + n + ']\n' + tc.items.map(function (it) { return it.str; }).join(' ');
          }));
        })(p);
      }
      return Promise.all(jobs).then(function () { return pages.join('\n\n'); });
    });
  }

  function startQuiz(items, title, subject, canMore) {
    var mode = UI.setup.mode;
    var pr = UI.pendingReview; UI.pendingReview = null;
    UI.quiz = { items: items, i: 0, answers: [], mode: mode, title: pr ? pr.title : title, subject: subject, start: Date.now(), canMore: canMore, flipped: false, known: [], reviewIds: pr ? pr.ids : null };
    if (mode === 'Timed exam') {
      UI.quiz.secsLeft = items.length * 60;
      UI.quiz.tick = setInterval(function () {
        if (!UI.quiz || UI.view !== 'quiz') return;
        UI.quiz.secsLeft -= 1;
        var el = $('#qtimer'); if (el) el.textContent = fmtTime(UI.quiz.secsLeft);
        if (UI.quiz.secsLeft <= 0) { toast('Time\'s up!'); finishQuiz(); }
      }, 1000);
    }
    UI.view = 'quiz'; render();
  }
  function finishQuiz() {
    var q = UI.quiz; if (!q) return;
    clearInterval(q.tick);
    var score = 0, bySub = {}, wrong = [];
    q.items.forEach(function (it, idx) {
      var ok = q.mode === 'Flashcards' ? q.known[idx] === 1 : q.answers[idx] === it.answer;
      if (ok) score++; else wrong.push(it);
      var k = it.subtopic || 'General'; bySub[k] = bySub[k] || { c: 0, t: 0 }; bySub[k].t++; if (ok) bySub[k].c++;
      if (ok && it.mistakeId) S.mistakes = S.mistakes.filter(function (m) { return m.id !== it.mistakeId; });
    });
    wrong.forEach(function (it) {
      if (it.mistakeId) return;
      S.mistakes.push({ id: uid(), q: it.q, options: it.options, answer: it.answer, explanation: it.explanation || '', topic: q.title, subtopic: it.subtopic || '' });
    });
    if (S.mistakes.length > 300) S.mistakes = S.mistakes.slice(-300);
    var secs = Math.round((Date.now() - q.start) / 1000);
    var pct = Math.round(score / q.items.length * 100);
    S.history.push({ date: today(), topic: q.title, score: score, total: q.items.length, secs: secs, mode: q.mode });
    if (S.history.length > 200) S.history = S.history.slice(-200);
    S.study[today()] = (S.study[today()] || 0) + Math.round(secs / 60);
    // Update matching chapters in the plan
    (q.reviewIds || []).forEach(function (id) { var t = S.topics.find(function (x) { return x.id === id; }); if (t) scheduleAfterReview(t, pct); });
    if (!q.reviewIds) {
      var match = S.topics.find(function (x) { return x.studiedOn && q.title.toLowerCase().indexOf(x.title.toLowerCase()) >= 0; });
      if (match) scheduleAfterReview(match, pct);
    }
    markActive(); save();
    UI.result = { score: score, total: q.items.length, bySub: bySub, wrong: wrong, title: q.title, secs: secs, canMore: q.canMore && quotaLeft() > 0 };
    UI.view = 'results'; render();
  }

  // ---------- timer ----------
  function timerTick() {
    var t = UI.timer; if (!t || !t.running) return;
    t.left = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
    var el = $('#tface'); if (el) el.textContent = fmtTime(t.left);
    document.title = fmtTime(t.left) + ' · PaperReady';
    if (t.left <= 0) { stopTimer(true); }
  }
  function stopTimer(completed) {
    var t = UI.timer; if (!t) return;
    clearInterval(t.iv);
    var used = t.mins * 60 - t.left;
    var mins = Math.round(used / 60);
    if (mins > 0) { S.study[today()] = (S.study[today()] || 0) + mins; markActive(); save(); }
    document.title = 'PaperReady – Study Plan & MCQs';
    UI.timer = null; UI.view = 'home'; render();
    toast(completed ? 'Session done! ' + mins + ' minutes added. Take a 5-minute break.' : (mins > 0 ? mins + ' minutes added to today.' : 'Timer stopped.'));
    if (completed && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'), val = b.getAttribute('data-val'), id = b.getAttribute('data-id');
    var s = UI.setup;
    switch (act) {
      case 'go': UI.view = b.getAttribute('data-to'); render(); break;
      case 'chip': {
        var g = b.getAttribute('data-group');
        if (g === 'exam') { UI.onboard.exam = val; UI.onboard.subjects = null; keepOnboardInputs(render); }
        else if (g === 'plansub') { UI.planSubject = val; render(); }
        else if (g === 'set-exam') { S.profile.exam = val; save(); render(); }
        else if (g === 'tmins') { if (!UI.timer.running) { UI.timer.mins = +val; UI.timer.left = +val * 60; render(); } }
        else { keepSetupInputs(); s[g] = g === 'count' ? +val : val; render(); }
        break;
      }
      case 'ob-sub': {
        var subs = UI.onboard.subjects, i = subs.indexOf(val);
        if (i >= 0) subs.splice(i, 1); else subs.push(val);
        keepOnboardInputs(render); break;
      }
      case 'ob-addsub': {
        var v = $('#ob-newsub').value.trim();
        if (v && UI.onboard.subjects.indexOf(v) < 0) UI.onboard.subjects.push(v);
        keepOnboardInputs(render); break;
      }
      case 'ob-done': {
        var name = $('#ob-name').value.trim(), date = $('#ob-date').value;
        if (!name) { toast('Please enter your name'); $('#ob-name').focus(); return; }
        if (!UI.onboard.subjects.length) { toast('Pick at least one subject'); return; }
        S.profile = { name: name, exam: UI.onboard.exam, examDate: date || '', subjects: UI.onboard.subjects.slice() };
        save(); UI.view = 'home'; render(); toast('Your plan is ready. Add your chapters in Plan.'); break;
      }
      case 'task-add': addTask(); break;
      case 'task-toggle': {
        var t = S.tasks.find(function (x) { return x.id === id; });
        if (t) { t.done = !t.done; if (t.done) { markActive(); toast('Shabash! Task done.'); } save(); render(); }
        break;
      }
      case 'task-del': S.tasks = S.tasks.filter(function (x) { return x.id !== id; }); save(); render(); break;
      case 'topic-add': addTopics(); break;
      case 'topic-studied': {
        var tp = S.topics.find(function (x) { return x.id === id; });
        if (tp) { scheduleAfterStudy(tp); markActive(); save(); render(); toast('First revision tomorrow'); }
        break;
      }
      case 'topic-del': if (confirmLite(b)) { S.topics = S.topics.filter(function (x) { return x.id !== id; }); save(); render(); } break;
      case 'revise-quiz': {
        var due = dueTopics().slice(0, 3);
        UI.setup.source = 'topic'; UI.setup.subject = due[0].subject;
        UI.setup.topic = due.map(function (x) { return x.subject + ' ' + x.title; }).join('; ');
        UI.setup.count = 10; UI.setup.mode = 'Practice';
        if (!quotaLeft()) { due.forEach(function (x) { scheduleAfterReview(x, null); }); save(); render(); toast('Daily AI quizzes used. Marked as revised.'); return; }
        UI.pendingReview = { ids: due.map(function (x) { return x.id; }), title: 'Revision: ' + due.map(function (x) { return x.title; }).join(', ') };
        generate(); break;
      }
      case 'source': keepSetupInputs(); s.source = val; render(); break;
      case 'generate': keepSetupInputs(); generate(); break;
      case 'cancel-gen': if (genAbort) genAbort.abort(); UI.view = 'prep'; render(); break;
      case 'pick': {
        var q = UI.quiz; q.answers[q.i] = +val; render();
        if (q.mode === 'Practice' && navigator.vibrate) navigator.vibrate(+val === q.items[q.i].answer ? 30 : [60, 40, 60]);
        break;
      }
      case 'next': {
        var qq = UI.quiz;
        if (qq.i < qq.items.length - 1) { qq.i++; qq.flipped = false; render(); } else finishQuiz();
        break;
      }
      case 'prev': UI.quiz.i = Math.max(0, UI.quiz.i - 1); render(); break;
      case 'flip': UI.quiz.flipped = !UI.quiz.flipped; render(); break;
      case 'flash-mark': {
        var fq = UI.quiz; fq.known[fq.i] = +val; fq.answers[fq.i] = +val ? fq.items[fq.i].answer : -1;
        if (fq.i < fq.items.length - 1) { fq.i++; fq.flipped = false; render(); } else finishQuiz();
        break;
      }
      case 'quiz-quit': if (confirmLite(b, 'Tap X again to leave. Answers won\'t be saved.')) { clearInterval(UI.quiz.tick); UI.quiz = null; UI.view = 'prep'; render(); } break;
      case 'report': {
        var it = UI.quiz.items[UI.quiz.i];
        try { var rep = JSON.parse(localStorage.getItem('paperready_reports') || '[]'); rep.push({ q: it.q, date: today() }); localStorage.setItem('paperready_reports', JSON.stringify(rep.slice(-100))); } catch (er) {}
        toast('Thanks! This question has been reported.'); break;
      }
      case 'retry-wrong': {
        var items = UI.result.wrong.map(function (w) { return Object.assign({}, w); });
        UI.setup.mode = 'Practice'; startQuiz(shuffle(items), 'Retry: ' + UI.result.title, '', false); break;
      }
      case 'more-like': UI.setup.count = 10; UI.view = 'prep'; generate(); break;
      case 'mistake-del': S.mistakes = S.mistakes.filter(function (m) { return m.id !== id; }); save(); render(); break;
      case 'timer-open': UI.timer = UI.timer || { mins: 25, left: 25 * 60, running: false }; UI.view = 'timer'; render(); break;
      case 'timer-start': {
        var tm = UI.timer; tm.running = true; tm.endAt = Date.now() + tm.left * 1000;
        tm.iv = setInterval(timerTick, 500); render(); break;
      }
      case 'timer-pause': clearInterval(UI.timer.iv); UI.timer.running = false; render(); break;
      case 'timer-stop': stopTimer(false); break;
      case 'sub-remove': {
        if (S.profile.subjects.length <= 1) { toast('Keep at least one subject'); return; }
        S.profile.subjects = S.profile.subjects.filter(function (x) { return x !== val; }); save(); render(); break;
      }
      case 'sub-add': {
        var ns = $('#set-newsub').value.trim();
        if (ns && S.profile.subjects.indexOf(ns) < 0) { S.profile.subjects.push(ns); save(); render(); }
        break;
      }
      case 'settings-save': {
        var nn = $('#set-name').value.trim(); if (nn) S.profile.name = nn;
        S.profile.examDate = $('#set-date').value || ''; save(); render(); toast('Saved'); break;
      }
      case 'reset': {
        if (confirmLite(b, 'Tap again to delete everything. This cannot be undone.')) {
          localStorage.removeItem(STORE_KEY); S = freshState(); UI.view = 'onboard'; render();
        }
        break;
      }
    }
  });
  function confirmLite(b, msg) {
    if (b.getAttribute('data-armed')) return true;
    b.setAttribute('data-armed', '1'); b.style.color = 'var(--red)'; toast(msg || 'Tap again to delete');
    setTimeout(function () { b.removeAttribute('data-armed'); b.style.color = ''; }, 3000);
    return false;
  }
  function keepOnboardInputs(cb) {
    var n = $('#ob-name'), d = $('#ob-date');
    var nv = n ? n.value : '', dv = d ? d.value : '';
    cb(); var n2 = $('#ob-name'), d2 = $('#ob-date'); if (n2) n2.value = nv; if (d2) d2.value = dv;
  }
  function keepSetupInputs() {
    var t = $('#q-topic'); if (t) UI.setup.topic = t.value;
    var f = $('#q-from'), to = $('#q-to');
    if (f && to) {
      var max = UI.setup.pdfPages, lim = CFG.FREE_PDF_PAGES || 20;
      var a = Math.min(Math.max(1, +f.value || 1), max), z = Math.min(Math.max(a, +to.value || a), max);
      if (z - a + 1 > lim) z = a + lim - 1;
      UI.setup.pdfFrom = a; UI.setup.pdfTo = z;
    }
  }
  function addTask() {
    var el = $('#new-task'), v = el.value.trim(); if (!v) { el.focus(); return; }
    var m = v.match(/(\d+)\s*min/i);
    S.tasks.push({ id: uid(), title: v, mins: m ? +m[1] : 0, done: false, date: today() });
    S.tasks = S.tasks.filter(function (x) { return daysBetween(x.date, today()) <= 14; });
    save(); render(); var n = $('#new-task'); if (n) n.focus();
  }
  function addTopics() {
    var el = $('#new-topic'), v = el.value.trim(); if (!v) { el.focus(); return; }
    v.split(',').map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (title) {
      S.topics.push({ id: uid(), subject: UI.planSubject, title: title.slice(0, 80), stage: 0, nextReview: null, studiedOn: null, lastScore: null });
    });
    save(); render(); var n = $('#new-topic'); if (n) n.focus();
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var id = e.target && e.target.id;
    if (id === 'new-task') addTask();
    else if (id === 'new-topic') addTopics();
    else if (id === 'ob-newsub') $('[data-act="ob-addsub"]').click();
    else if (id === 'set-newsub') $('[data-act="sub-add"]').click();
    else if (id === 'q-topic') { keepSetupInputs(); generate(); }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'q-pdf') {
      var file = e.target.files && e.target.files[0]; if (!file) return;
      if (file.size > 25 * 1024 * 1024) { toast('PDF is too big (max 25 MB)'); return; }
      toast('Opening PDF…');
      openPdf(file).then(function (doc) {
        UI.setup.pdf = file; UI.setup.pdfName = file.name; UI.setup.pdfPages = doc.numPages;
        UI.setup.pdfFrom = 1; UI.setup.pdfTo = Math.min(doc.numPages, CFG.FREE_PDF_PAGES || 20); render();
      }).catch(function () { toast('Could not open this PDF. If it has a password, remove it first.'); });
    } else if (e.target.id === 'q-from' || e.target.id === 'q-to') { keepSetupInputs(); render(); }
  });

  document.addEventListener('visibilitychange', function () { if (!document.hidden) timerTick(); });

  render();
})();
