'use strict';
/* 🐾 테디·포미 데일리 케어 */

// ---------- 상수 ----------
const MOODS = [
  { v: 5, e: '😄', label: '아주 좋음' },
  { v: 4, e: '🙂', label: '좋음' },
  { v: 3, e: '😐', label: '보통' },
  { v: 2, e: '😟', label: '안 좋음' },
  { v: 1, e: '😢', label: '많이 안 좋음' },
];
const MEALS = [
  { v: 'full', e: '😋', label: '다 먹음' },
  { v: 'half', e: '🙂', label: '절반' },
  { v: 'little', e: '😐', label: '조금' },
  { v: 'none', e: '😟', label: '안 먹음' },
];
const POOPS = [
  { v: 'good', e: '💩', label: '정상' },
  { v: 'soft', e: '💩💧', label: '무름' },
  { v: 'watery', e: '💩💦', label: '설사' },
  { v: 'bloody', e: '🩸', label: '혈변' },
  { v: 'none', e: '➖', label: '안 봄' },
];
const SLOTS = [
  { id: 'morning', label: '🌅 아침' },
  { id: 'lunch', label: '☀️ 점심' },
  { id: 'evening', label: '🌙 저녁' },
];
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

// ---------- 날짜 유틸 ----------
function pad(n) { return String(n).padStart(2, '0'); }
function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function parseDate(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function prettyDate(s) {
  const d = parseDate(s);
  return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + WEEKDAY[d.getDay()] + '요일';
}
function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ---------- 저장소 (localStorage) ----------
const LS_KEY = 'pomCare.v1';
function freshState() {
  return {
    dogs: [
      { id: 'teddy', name: '테디', emoji: '🤍' },
      { id: 'pomi', name: '포미', emoji: '🤎' },
    ],
    meds: { teddy: [], pomi: [] },
    days: {},
  };
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.dogs && s.meds && s.days) return s;
    }
  } catch (e) { /* 무시하고 새로 시작 */ }
  return freshState();
}
function saveState() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
}
let state = loadState();

// 하루 기록 구조 보장
function dayRec(dateS, dogId) {
  if (!state.days[dateS]) state.days[dateS] = {};
  if (!state.days[dateS][dogId]) {
    state.days[dateS][dogId] = { slots: {}, medChecks: {}, note: '', photos: [] };
  }
  const rec = state.days[dateS][dogId];
  SLOTS.forEach(function (s) {
    if (!rec.slots[s.id]) rec.slots[s.id] = {};
  });
  return rec;
}

// ---------- 사진 저장소 (IndexedDB) ----------
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise(function (resolve, reject) {
      const req = indexedDB.open('pomCare', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('photos'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  return dbPromise;
}
async function photoPut(id, dataUrl) {
  const d = await db();
  return new Promise(function (res, rej) {
    const tx = d.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(dataUrl, id);
    tx.oncomplete = function () { res(); };
    tx.onerror = function () { rej(tx.error); };
  });
}
async function photoGet(id) {
  const d = await db();
  return new Promise(function (res, rej) {
    const tx = d.transaction('photos', 'readonly');
    const rq = tx.objectStore('photos').get(id);
    rq.onsuccess = function () { res(rq.result); };
    rq.onerror = function () { rej(rq.error); };
  });
}
async function photoDel(id) {
  const d = await db();
  return new Promise(function (res, rej) {
    const tx = d.transaction('photos', 'readwrite');
    tx.objectStore('photos').delete(id);
    tx.oncomplete = function () { res(); };
    tx.onerror = function () { rej(tx.error); };
  });
}
// 사진 리사이즈 + 압축
function fileToDataUrl(file, maxSize) {
  maxSize = maxSize || 1024;
  return new Promise(function (resolve, reject) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = function () {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ---------- UI 상태 ----------
const ui = {
  dog: 'teddy',
  date: dateStr(new Date()),
  view: 'today',
  calCursor: (function () { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
  editingMedId: null,
};
function dogName(id) {
  const d = state.dogs.find(function (x) { return x.id === id; });
  return d ? d.name : id;
}

// ---------- 렌더: 강아지 탭 ----------
function renderDogTabs() {
  const el = document.getElementById('dogTabs');
  el.innerHTML = state.dogs.map(function (d) {
    return '<button data-action="select-dog" data-dog="' + d.id + '"' +
      (d.id === ui.dog ? ' class="active"' : '') + '>' + d.emoji + ' ' + d.name + '</button>';
  }).join('');
}

// ---------- 렌더: 오늘 기록 ----------
function optRow(field, slotId, options, current) {
  return '<div class="opt-row">' + options.map(function (o) {
    return '<button class="opt' + (current === o.v || current === o.e ? ' selected' : '') + '"' +
      ' data-action="set-slot" data-slot="' + slotId + '" data-field="' + field + '" data-value="' + o.v + '">' +
      o.e + '<small>' + o.label + '</small></button>';
  }).join('') + '</div>';
}

function renderToday() {
  const rec = dayRec(ui.date, ui.dog);
  document.getElementById('dateLabel').textContent = prettyDate(ui.date);
  const todayS = dateStr(new Date());
  document.getElementById('dateSub').textContent =
    ui.date === todayS ? '오늘' : (ui.date < todayS ? '지난 기록' : '미래 날짜');

  // 3타임 슬롯
  document.getElementById('slotList').innerHTML = SLOTS.map(function (s) {
    const v = rec.slots[s.id] || {};
    return '<div class="card"><div class="slot-title">' + s.label + '</div>' +
      '<div class="field"><div class="field-name">컨디션</div>' +
        optRow('mood', s.id, MOODS, v.mood) + '</div>' +
      '<div class="field"><div class="field-name">식사</div>' +
        optRow('meal', s.id, MEALS, v.meal) +
        '<input class="text-input meal-note" data-action="meal-note" data-slot="' + s.id + '"' +
        ' placeholder="메뉴 (예: 사료, 처방식)" value="' + escapeAttr(v.mealNote || '') + '"></div>' +
      '<div class="field"><div class="field-name">응가</div>' +
        optRow('poop', s.id, POOPS, v.poop) + '</div>' +
      '</div>';
  }).join('');

  // 약 체크리스트 (시간 순)
  const meds = state.meds[ui.dog] || [];
  const checks = rec.medChecks || {};
  const rows = [];
  meds.forEach(function (m) {
    (m.times || []).forEach(function (t) {
      rows.push({ med: m, time: t, done: !!(checks[m.id] && checks[m.id][t]) });
    });
  });
  rows.sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  document.getElementById('medCheckList').innerHTML = rows.length ? rows.map(function (r) {
    return '<div class="med-row' + (r.done ? ' done' : '') + '">' +
      '<button class="med-check' + (r.done ? ' done' : '') + '" data-action="toggle-med"' +
      ' data-med="' + r.med.id + '" data-time="' + r.time + '">' + (r.done ? '✓' : '') + '</button>' +
      '<div class="med-time">' + r.time + '</div>' +
      '<div><div class="med-name">' + escapeHtml(r.med.name) + '</div>' +
      (r.med.memo ? '<div class="med-memo">' + escapeHtml(r.med.memo) + '</div>' : '') + '</div></div>';
  }).join('') : '<div class="empty-hint">등록된 약이 없어요.<br>아래 버튼에서 약을 추가해 보세요 🐾</div>';

  // 특이사항
  const noteEl = document.getElementById('noteInput');
  if (document.activeElement !== noteEl) noteEl.value = rec.note || '';

  renderPhotos(rec);
}

async function renderPhotos(rec) {
  const box = document.getElementById('photoThumbs');
  box.innerHTML = '';
  for (const pid of (rec.photos || [])) {
    try {
      const url = await photoGet(pid);
      if (!url) continue;
      const wrap = document.createElement('div');
      wrap.className = 'thumb';
      const img = document.createElement('img');
      img.src = url;
      img.alt = '기록 사진';
      const del = document.createElement('button');
      del.textContent = '✕';
      del.setAttribute('aria-label', '사진 삭제');
      del.addEventListener('click', async function () {
        rec.photos = rec.photos.filter(function (x) { return x !== pid; });
        saveState();
        try { await photoDel(pid); } catch (e) {}
        renderPhotos(rec);
      });
      wrap.appendChild(img);
      wrap.appendChild(del);
      box.appendChild(wrap);
    } catch (e) {}
  }
}

// ---------- 렌더: 달력 ----------
function daySummary(dateS, dogId) {
  const dayObj = state.days[dateS];
  if (!dayObj || !dayObj[dogId]) return null;
  const rec = dayObj[dogId];
  const moods = SLOTS.map(function (s) { return rec.slots[s.id] && rec.slots[s.id].mood; })
    .filter(function (v) { return typeof v === 'number'; });
  let moodEmoji = null;
  if (moods.length) {
    const avg = moods.reduce(function (a, b) { return a + b; }, 0) / moods.length;
    const nearest = MOODS.reduce(function (best, m) {
      return Math.abs(m.v - avg) < Math.abs(best.v - avg) ? m : best;
    });
    moodEmoji = nearest.e;
  }
  const hasAny = moods.length > 0 || Object.keys(rec.medChecks || {}).length > 0 ||
    (rec.note && rec.note.trim()) || (rec.photos && rec.photos.length);
  return { moodEmoji: moodEmoji, hasAny: hasAny };
}

function renderCal() {
  const cur = ui.calCursor;
  const y = cur.getFullYear(), m = cur.getMonth();
  document.getElementById('calLabel').textContent = y + '년 ' + (m + 1) + '월';
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayS = dateStr(new Date());
  let html = '';
  for (let i = 0; i < firstDow; i++) html += '<div class="cal-day blank"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = y + '-' + pad(m + 1) + '-' + pad(d);
    const sum = daySummary(ds, ui.dog);
    const cls = 'cal-day' + (ds === todayS ? ' today' : '') + (sum && sum.hasAny ? ' has-data' : '');
    const mark = sum && sum.moodEmoji ? '<div class="m">' + sum.moodEmoji + '</div>'
      : (sum && sum.hasAny ? '<div class="dot">●</div>' : '<div class="m">&nbsp;</div>');
    html += '<button class="' + cls + '" data-action="cal-day" data-date="' + ds + '">' +
      '<div class="d">' + d + '</div>' + mark + '</button>';
  }
  document.getElementById('calGrid').innerHTML = html;
  document.getElementById('calDetail').classList.add('hidden');
}

function renderCalDetail(dateS) {
  const box = document.getElementById('calDetail');
  const dayObj = state.days[dateS];
  const rec = dayObj && dayObj[ui.dog];
  if (!rec) {
    box.innerHTML = '<h3>' + prettyDate(dateS) + ' · ' + dogName(ui.dog) + '</h3>' +
      '<div class="empty-hint">기록이 없어요</div>';
  } else {
    let html = '<h3>' + prettyDate(dateS) + ' · ' + dogName(ui.dog) + '</h3>';
    SLOTS.forEach(function (s) {
      const v = rec.slots[s.id] || {};
      const mood = MOODS.find(function (x) { return x.v === v.mood; });
      const meal = MEALS.find(function (x) { return x.v === v.meal; });
      const poop = POOPS.find(function (x) { return x.v === v.poop; });
      html += '<div class="detail-line"><b>' + s.label + '</b> ' +
        (mood ? mood.e + ' ' : '') + (meal ? meal.e + ' ' : '') + (poop ? poop.e : '') +
        (v.mealNote ? ' <span class="muted">(' + escapeHtml(v.mealNote) + ')</span>' : '') + '</div>';
    });
    const meds = state.meds[ui.dog] || [];
    const taken = [];
    meds.forEach(function (md) {
      (md.times || []).forEach(function (t) {
        if (rec.medChecks[md.id] && rec.medChecks[md.id][t]) taken.push(t + ' ' + md.name);
      });
    });
    if (taken.length) html += '<div class="detail-line">💊 ' + taken.map(escapeHtml).join(', ') + '</div>';
    if (rec.note && rec.note.trim()) html += '<div class="detail-line">📝 ' + escapeHtml(rec.note) + '</div>';
    if (rec.photos && rec.photos.length) html += '<div class="detail-line">📷 사진 ' + rec.photos.length + '장</div>';
    box.innerHTML = html;
  }
  box.classList.remove('hidden');
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- 렌더: 약 관리 ----------
function parseTimes(str) {
  return str.split(/[,\s]+/).map(function (t) { return t.trim(); })
    .filter(function (t) { return /^([01]?\d|2[0-3]):[0-5]\d$/.test(t); })
    .map(function (t) {
      const p = t.split(':');
      return pad(Number(p[0])) + ':' + p[1];
    })
    .filter(function (t, i, a) { return a.indexOf(t) === i; })
    .sort();
}

function renderMeds() {
  const meds = state.meds[ui.dog] || [];
  document.getElementById('medManageList').innerHTML =
    '<div class="card"><h2>💊 ' + dogName(ui.dog) + '의 약</h2>' +
    (meds.length ? meds.map(function (m) {
      return '<div class="med-manage-row"><div class="med-info">' +
        '<div class="med-name">' + escapeHtml(m.name) + '</div>' +
        '<div class="med-times">' + (m.times || []).map(function (t) {
          return '<span class="time-chip">' + t + '</span>';
        }).join('') + '</div>' +
        (m.memo ? '<div class="med-memo">' + escapeHtml(m.memo) + '</div>' : '') +
        '</div>' +
        '<button class="icon-btn" data-action="med-edit" data-med="' + m.id + '" aria-label="수정">✏️</button>' +
        '<button class="icon-btn" data-action="med-del" data-med="' + m.id + '" aria-label="삭제">🗑️</button></div>';
    }).join('') : '<div class="empty-hint">등록된 약이 없어요 🐾</div>') + '</div>';

  // 폼 초기화 (수정 모드 아닐 때)
  if (!ui.editingMedId) {
    document.getElementById('medFormTitle').textContent = '➕ 약 추가';
    document.getElementById('saveMedBtn').textContent = '추가하기';
    document.getElementById('cancelEditBtn').classList.add('hidden');
  }
}

// ---------- 뷰 전환 ----------
function switchView(v) {
  ui.view = v;
  document.querySelectorAll('.view').forEach(function (el) { el.classList.add('hidden'); });
  document.getElementById('view-' + v).classList.remove('hidden');
  document.querySelectorAll('.tabbar button').forEach(function (b) {
    b.classList.toggle('active', b.dataset.view === v);
  });
  if (v === 'today') renderToday();
  if (v === 'cal') renderCal();
  if (v === 'meds') renderMeds();
  window.scrollTo(0, 0);
}

// ---------- 이스케이프 ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function escapeAttr(s) { return escapeHtml(s).replace(/\n/g, ' '); }

// ---------- 이벤트 ----------
document.addEventListener('click', function (e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;

  if (a === 'select-dog') {
    ui.dog = el.dataset.dog;
    renderDogTabs();
    if (ui.view === 'today') renderToday();
    if (ui.view === 'cal') renderCal();
    if (ui.view === 'meds') { ui.editingMedId = null; resetMedForm(); renderMeds(); }
  }
  else if (a === 'goto-view') { switchView(el.dataset.view); }
  else if (a === 'prev-day') {
    const d = parseDate(ui.date); d.setDate(d.getDate() - 1);
    ui.date = dateStr(d); renderToday();
  }
  else if (a === 'next-day') {
    const d = parseDate(ui.date); d.setDate(d.getDate() + 1);
    ui.date = dateStr(d); renderToday();
  }
  else if (a === 'set-slot') {
    const rec = dayRec(ui.date, ui.dog);
    const slot = rec.slots[el.dataset.slot];
    const field = el.dataset.field;
    let val = el.dataset.value;
    if (field === 'mood') val = Number(val);
    slot[field] = (slot[field] === val) ? undefined : val; // 다시 탭하면 취소
    saveState();
    renderToday();
  }
  else if (a === 'toggle-med') {
    const rec = dayRec(ui.date, ui.dog);
    const mid = el.dataset.med, t = el.dataset.time;
    if (!rec.medChecks[mid]) rec.medChecks[mid] = {};
    rec.medChecks[mid][t] = !rec.medChecks[mid][t];
    saveState();
    renderToday();
  }
  else if (a === 'cal-prev') {
    ui.calCursor = new Date(ui.calCursor.getFullYear(), ui.calCursor.getMonth() - 1, 1);
    renderCal();
  }
  else if (a === 'cal-next') {
    ui.calCursor = new Date(ui.calCursor.getFullYear(), ui.calCursor.getMonth() + 1, 1);
    renderCal();
  }
  else if (a === 'cal-day') {
    ui.date = el.dataset.date;
    renderCalDetail(el.dataset.date);
  }
  else if (a === 'med-edit') {
    const m = (state.meds[ui.dog] || []).find(function (x) { return x.id === el.dataset.med; });
    if (!m) return;
    ui.editingMedId = m.id;
    document.getElementById('medFormTitle').textContent = '✏️ 약 수정';
    document.getElementById('newMedName').value = m.name;
    document.getElementById('newMedTimes').value = (m.times || []).join(', ');
    document.getElementById('newMedMemo').value = m.memo || '';
    document.getElementById('saveMedBtn').textContent = '수정하기';
    document.getElementById('cancelEditBtn').classList.remove('hidden');
    document.getElementById('newMedName').focus();
  }
  else if (a === 'med-del') {
    if (!confirm('이 약을 삭제할까요?')) return;
    state.meds[ui.dog] = (state.meds[ui.dog] || []).filter(function (x) { return x.id !== el.dataset.med; });
    saveState();
    renderMeds();
  }
});

document.addEventListener('input', function (e) {
  const el = e.target;
  if (el.id === 'noteInput') {
    const rec = dayRec(ui.date, ui.dog);
    rec.note = el.value;
    saveState();
  } else if (el.dataset && el.dataset.action === 'meal-note') {
    const rec = dayRec(ui.date, ui.dog);
    rec.slots[el.dataset.slot].mealNote = el.value;
    saveState();
  }
});

document.getElementById('photoInput').addEventListener('change', async function (e) {
  const rec = dayRec(ui.date, ui.dog);
  const files = Array.from(e.target.files || []).slice(0, 5);
  for (const f of files) {
    try {
      const dataUrl = await fileToDataUrl(f);
      const pid = uid();
      await photoPut(pid, dataUrl);
      rec.photos.push(pid);
    } catch (err) {}
  }
  saveState();
  e.target.value = '';
  renderPhotos(rec);
});

function resetMedForm() {
  ui.editingMedId = null;
  document.getElementById('medFormTitle').textContent = '➕ 약 추가';
  document.getElementById('newMedName').value = '';
  document.getElementById('newMedTimes').value = '';
  document.getElementById('newMedMemo').value = '';
  document.getElementById('saveMedBtn').textContent = '추가하기';
  document.getElementById('cancelEditBtn').classList.add('hidden');
}
document.getElementById('saveMedBtn').addEventListener('click', function () {
  const name = document.getElementById('newMedName').value.trim();
  const times = parseTimes(document.getElementById('newMedTimes').value);
  const memo = document.getElementById('newMedMemo').value.trim();
  if (!name) { alert('약 이름을 입력해 주세요 🐾'); return; }
  if (!times.length) { alert('먹는 시간을 입력해 주세요 (예: 08:00, 20:00)'); return; }
  if (ui.editingMedId) {
    const m = (state.meds[ui.dog] || []).find(function (x) { return x.id === ui.editingMedId; });
    if (m) { m.name = name; m.times = times; m.memo = memo; }
  } else {
    state.meds[ui.dog].push({ id: uid(), name: name, times: times, memo: memo });
  }
  saveState();
  resetMedForm();
  renderMeds();
});
document.getElementById('cancelEditBtn').addEventListener('click', resetMedForm);

// ---------- 서비스 워커 ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  });
}

// ---------- 시작 ----------
renderDogTabs();
switchView('today');
