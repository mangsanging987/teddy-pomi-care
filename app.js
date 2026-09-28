'use strict';
/* 🐾 폼폼케어 */

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

// 현재 시간대에 해당하는 슬롯
function currentSlotId() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'lunch';
  return 'evening';
}

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

// ---------- 클라우드 동기화 (Firebase) ----------
// firebase-config.js에 실제 설정이 들어가면 클라우드 모드, 아니면 로컬 모드
const CLOUD = { on: false, db: null, storage: null, storageOn: false, unsubs: [] };
function cloudEnabled() {
  const c = window.TPC_FIREBASE_CONFIG;
  return !!(c && c.apiKey && c.apiKey.indexOf('YOUR_') !== 0 && typeof firebase !== 'undefined');
}
// 사진까지 클라우드로 공유하는 모드인지 (Storage 버킷 필요)
function cloudPhotos() { return CLOUD.on && CLOUD.storageOn && !!CLOUD.storage; }
function dayDocRef(dateS, dogId) { return CLOUD.db.collection('days').doc(dateS + '_' + dogId); }
function medDocRef(medId) { return CLOUD.db.collection('meds').doc(medId); }
function medLogDocRef(dateS, dogId, medId) { return CLOUD.db.collection('medLog').doc(dateS + '_' + dogId + '_' + medId); }
function cloudWrite(p) {
  if (CLOUD.on && p && p.catch) p.catch(function (e) {
    console.warn('[cloud 쓰기 실패]', e);
    flashBadge('☁️ 동기화 실패');
  });
}
// 잠깐 뜨는 상태 뱃지
function flashBadge(msg) {
  let b = document.getElementById('cloudBadge');
  if (!b) {
    b = document.createElement('div');
    b.id = 'cloudBadge';
    document.body.appendChild(b);
  }
  b.textContent = msg;
  clearTimeout(flashBadge.t);
  flashBadge.t = setTimeout(function () {
    const x = document.getElementById('cloudBadge');
    if (x && x.parentNode) x.parentNode.removeChild(x);
  }, 3000);
}

// ---------- 로컬 우선 보호 ----------
// 탭한 값은 클라우드에 반영되기 전까지 스냅샷이 와도 지워지지 않게 pending에 기록.
// (쓰기 실패/지연, 부팅 중 탭 같은 경우에 입력이 리셋되던 버그 방지)
const pendingSlot = {}; // "dateS|dogId|slot|field" -> { v, ts }
const pendingNote = {}; // "dateS|dogId" -> { v, ts }
const pendingMed = {};  // "dateS|dogId|medId|time" -> { v, ts }
const PENDING_TTL = 30000;
function pendingSlotKey(dateS, dogId, slot, field) { return dateS + '|' + dogId + '|' + slot + '|' + field; }
function pendingDocKey(dateS, dogId) { return dateS + '|' + dogId; }
function normSlotVal(value) {
  return (value === undefined || value === null || value === '') ? undefined : value;
}
function hasPendingDayWrites(docKey) {
  if (pendingNote[docKey]) return true;
  const p = docKey + '|';
  return Object.keys(pendingSlot).some(function (k) { return k.indexOf(p) === 0; });
}
function hasLocalDayData(rec) {
  if (rec.note && rec.note.trim()) return true;
  if (rec.photos && rec.photos.length) return true;
  return Object.keys(rec.slots || {}).some(function (sid) {
    const s = rec.slots[sid] || {};
    return s.mood !== undefined || s.meal !== undefined || s.poop !== undefined ||
      (s.mealNote && s.mealNote.trim());
  });
}
// 스냅샷에 pending 값을 다시 입히고, 반영됐거나 만료된 pending은 정리
function reapplyPendingSlot(rec, dateS, dogId, d, acked) {
  const prefix = dateS + '|' + dogId + '|';
  const now = Date.now();
  Object.keys(pendingSlot).forEach(function (k) {
    if (k.indexOf(prefix) !== 0) return;
    const p = pendingSlot[k];
    const rest = k.slice(prefix.length).split('|');
    const slot = rest[0], field = rest[1];
    const sd = (d && d.slots && d.slots[slot] && typeof d.slots[slot] === 'object') ? d.slots[slot] : {};
    const sv = sd[field];
    const reflected = (sv === p.v) || (sv === undefined && p.v === undefined);
    if (reflected || (acked && now - p.ts > PENDING_TTL)) { delete pendingSlot[k]; return; }
    if (!rec.slots[slot] || typeof rec.slots[slot] !== 'object') rec.slots[slot] = {};
    if (p.v === undefined) delete rec.slots[slot][field];
    else rec.slots[slot][field] = p.v;
  });
}
function reapplyPendingNote(rec, docKey, d, acked) {
  const p = pendingNote[docKey];
  if (!p) return;
  const sv = d ? d.note : undefined;
  if (sv === p.v || (acked && Date.now() - p.ts > PENDING_TTL)) { delete pendingNote[docKey]; return; }
  rec.note = p.v;
}
function reapplyPendingMed(checks, dateS, dogId, acked) {
  const prefix = dateS + '|' + dogId + '|';
  const now = Date.now();
  Object.keys(pendingMed).forEach(function (k) {
    if (k.indexOf(prefix) !== 0) return;
    const p = pendingMed[k];
    const rest = k.slice(prefix.length).split('|');
    const mid = rest[0], t = rest[1];
    const on = !!(checks[mid] && checks[mid][t]);
    if (on === p.v || (acked && now - p.ts > PENDING_TTL)) { delete pendingMed[k]; return; }
    if (p.v) { if (!checks[mid]) checks[mid] = {}; checks[mid][t] = true; }
    else if (checks[mid]) delete checks[mid][t];
  });
}
// 부팅 때 CLOUD.on이 false여서 못 보낸 기록들을 뒤늦게 전송
function flushPendingWrites() {
  if (!CLOUD.on) return;
  Object.keys(pendingSlot).forEach(function (k) {
    const p = pendingSlot[k];
    const a = k.split('|');
    writeSlotField(a[0], a[1], a[2], a[3], p.v);
  });
  Object.keys(pendingNote).forEach(function (k) {
    const a = k.split('|');
    writeNoteField(a[0], a[1], pendingNote[k].v);
  });
  Object.keys(pendingMed).forEach(function (k) {
    const a = k.split('|');
    writeMedCheck(a[0], a[1], a[2], a[3], pendingMed[k].v);
  });
}
// 타임 슬롯 필드 저장 (dot 표기로 필드 단위 병합 → 여러 사람이 동시에 써도 덜 겹침)
// pending에 먼저 기록해 두었다가 스냅샷이 와도 로컬 입력이 지워지지 않게 보호
function cloudSetSlotField(dateS, dogId, slot, field, value) {
  const v = normSlotVal(value);
  pendingSlot[pendingSlotKey(dateS, dogId, slot, field)] = { v: v, ts: Date.now() };
  if (!CLOUD.on) return;
  writeSlotField(dateS, dogId, slot, field, v);
}
function writeSlotField(dateS, dogId, slot, field, v) {
  const data = { date: dateS, dogId: dogId };
  data['slots.' + slot + '.' + field] =
    (v === undefined) ? firebase.firestore.FieldValue.delete() : v;
  cloudWrite(dayDocRef(dateS, dogId).set(data, { merge: true }));
}
function cloudSetNote(dateS, dogId, note) {
  const docKey = pendingDocKey(dateS, dogId);
  pendingNote[docKey] = { v: note || '', ts: Date.now() };
  if (!CLOUD.on) return;
  writeNoteField(dateS, dogId, note);
}
function writeNoteField(dateS, dogId, note) {
  cloudWrite(dayDocRef(dateS, dogId).set({ date: dateS, dogId: dogId, note: note }, { merge: true }));
}
function cloudSetMedCheck(dateS, dogId, medId, time, taken) {
  pendingMed[dateS + '|' + dogId + '|' + medId + '|' + time] = { v: !!taken, ts: Date.now() };
  if (!CLOUD.on) return;
  writeMedCheck(dateS, dogId, medId, time, taken);
}
function writeMedCheck(dateS, dogId, medId, time, taken) {
  const op = taken
    ? firebase.firestore.FieldValue.arrayUnion(time)
    : firebase.firestore.FieldValue.arrayRemove(time);
  cloudWrite(medLogDocRef(dateS, dogId, medId).set(
    { date: dateS, dogId: dogId, medId: medId, times: op }, { merge: true }));
}
function cloudSaveMed(m) {
  if (!CLOUD.on) return;
  cloudWrite(medDocRef(m.id).set({
    id: m.id, dogId: ui.dog, name: m.name, times: m.times || [],
    memo: m.memo || '', order: m.order || 0, createdAt: m.createdAt || 0,
  }, { merge: true }));
}
function cloudDeleteMed(medId) {
  if (!CLOUD.on) return;
  cloudWrite(medDocRef(medId).delete());
}

function unsubscribeCloud() {
  CLOUD.unsubs.forEach(function (u) { try { u(); } catch (e) {} });
  CLOUD.unsubs = [];
}
// 현재 보고 있는 강아지/날짜/달에 맞춰 리스너 다시 걸기
function subscribeCloud() {
  if (!CLOUD.on) return;
  unsubscribeCloud();
  const dateS = ui.date, dogId = ui.dog;

  // 오늘(선택 날짜) 기록
  CLOUD.unsubs.push(dayDocRef(dateS, dogId).onSnapshot(function (doc) {
    const rec = dayRec(dateS, dogId);
    const prevChecks = rec.medChecks;
    const docKey = pendingDocKey(dateS, dogId);
    const d = doc.exists ? doc.data() : null;
    if (d) {
      rec.slots = d.slots || {};
      rec.note = d.note || '';
      rec.photos = d.photos || [];
    } else if (!hasLocalDayData(rec) && !hasPendingDayWrites(docKey)) {
      // 클라우드에 문서가 없고 로컬에도 기록이 없을 때만 초기화
      // (부팅 중 탭한 기록이나 아직 안 간 쓰기가 스냅샷에 지워지던 버그 방지)
      rec.slots = {}; rec.note = ''; rec.photos = [];
    }
    const acked = !doc.metadata || doc.metadata.hasPendingWrites === false;
    reapplyPendingSlot(rec, dateS, dogId, d, acked);
    reapplyPendingNote(rec, docKey, d, acked);
    SLOTS.forEach(function (s) { if (!rec.slots[s.id]) rec.slots[s.id] = {}; });
    rec.medChecks = prevChecks || {};
    saveState();
    if (ui.view === 'today' && ui.date === dateS && ui.dog === dogId) renderToday();
  }));

  // 약 목록
  CLOUD.unsubs.push(CLOUD.db.collection('meds').where('dogId', '==', dogId).onSnapshot(function (snap) {
    const arr = [];
    snap.forEach(function (doc) { arr.push(doc.data()); });
    arr.sort(function (a, b) { return (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0); });
    state.meds[dogId] = arr;
    saveState();
    if (ui.dog !== dogId) return;
    if (ui.view === 'today') renderToday();
    if (ui.view === 'meds') renderMeds();
  }));

  // 약 복용 체크
  CLOUD.unsubs.push(CLOUD.db.collection('medLog')
    .where('date', '==', dateS).where('dogId', '==', dogId).onSnapshot(function (snap) {
      const checks = {};
      snap.forEach(function (doc) {
        const d = doc.data();
        (d.times || []).forEach(function (t) {
          if (!checks[d.medId]) checks[d.medId] = {};
          checks[d.medId][t] = true;
        });
      });
      const acked = !snap.metadata || snap.metadata.hasPendingWrites === false;
      reapplyPendingMed(checks, dateS, dogId, acked);
      dayRec(dateS, dogId).medChecks = checks;
      saveState();
      if (ui.view === 'today' && ui.date === dateS && ui.dog === dogId) renderToday();
    }));

  // 달력 월간 기록
  const cur = ui.calCursor, y = cur.getFullYear(), m = cur.getMonth();
  const from = y + '-' + pad(m + 1) + '-01';
  const to = y + '-' + pad(m + 1) + '-' + pad(new Date(y, m + 1, 0).getDate());
  CLOUD.unsubs.push(CLOUD.db.collection('days')
    .where('date', '>=', from).where('date', '<=', to).onSnapshot(function (snap) {
      snap.forEach(function (doc) {
        const d = doc.data();
        if (!d.date || !d.dogId) return;
        if (!state.days[d.date]) state.days[d.date] = {};
        const prev = state.days[d.date][d.dogId];
        state.days[d.date][d.dogId] = {
          slots: d.slots || {},
          medChecks: (prev && prev.medChecks) || {},
          note: d.note || '',
          photos: d.photos || [],
        };
      });
      saveState();
      if (ui.view === 'cal') renderCal();
    }));
}

// 로컬 데이터를 클라우드로 1회 이관 (이미 클라우드에 있으면 병합만)
async function migrateLocalToCloud() {
  try {
    if (localStorage.getItem('tpc_migrated_v1')) return;
    const local = loadState();
    const dogs = ['teddy', 'pomi'];
    for (const dogId of dogs) {
      const arr = (local.meds && local.meds[dogId]) || [];
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        await medDocRef(m.id).set({
          id: m.id, dogId: dogId, name: m.name, times: m.times || [],
          memo: m.memo || '', order: i, createdAt: Date.now(),
        }, { merge: true });
      }
    }
    for (const dateS of Object.keys(local.days || {})) {
      for (const dogId of Object.keys(local.days[dateS] || {})) {
        const d = local.days[dateS][dogId];
        for (const mid of Object.keys((d.medChecks) || {})) {
          const times = Object.keys(d.medChecks[mid] || {}).filter(function (t) { return d.medChecks[mid][t]; });
          if (times.length) {
            await medLogDocRef(dateS, dogId, mid).set(
              { date: dateS, dogId: dogId, medId: mid, times: times }, { merge: true });
          }
        }
        await dayDocRef(dateS, dogId).set(
          { date: dateS, dogId: dogId, slots: d.slots || {}, note: d.note || '' }, { merge: true });
        // 사진 이관 (Storage 사용 모드일 때만)
        if (CLOUD.storageOn && CLOUD.storage) {
        for (const pid of (d.photos || [])) {
          if (typeof pid !== 'string') continue;
          try {
            const dataUrl = await photoGet(pid);
            if (!dataUrl) continue;
            const path = 'photos/' + dateS + '/' + dogId + '/' + pid + '.jpg';
            const ref = CLOUD.storage.ref(path);
            await ref.put(dataUrlToBlob(dataUrl), { contentType: 'image/jpeg' });
            const url = await ref.getDownloadURL();
            await dayDocRef(dateS, dogId).set(
              { photos: firebase.firestore.FieldValue.arrayUnion({ id: pid, url: url, path: path }) },
              { merge: true });
          } catch (e) {}
        }
        } // end if (CLOUD.storageOn)
      }
    }
    localStorage.setItem('tpc_migrated_v1', '1');
  } catch (e) { console.warn('[이관 실패]', e); }
}

async function bootCloud() {
  try {
    firebase.initializeApp(window.TPC_FIREBASE_CONFIG);
    CLOUD.db = firebase.firestore();
    try { await CLOUD.db.enablePersistence({ synchronizeTabs: true }); } catch (e) {}
    CLOUD.storageOn = !!window.TPC_FIREBASE_CONFIG.storageOn;
    if (CLOUD.storageOn) {
      try { CLOUD.storage = firebase.storage(); } catch (e) { CLOUD.storageOn = false; }
    }
    await firebase.auth().signInAnonymously();
    CLOUD.on = true;
    flushPendingWrites(); // 부팅 전에 탭한 기록이 있으면 뒤늦게 전송
    await migrateLocalToCloud();
    subscribeCloud();
  } catch (e) {
    console.warn('[클라우드 초기화 실패 → 로컬 모드]', e);
  }
}

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
// 사진 리사이즈 + 압축 → Blob (클라우드 업로드용)
function fileToBlob(file, maxSize) {
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
      c.toBlob(function (b) { b ? resolve(b) : reject(new Error('blob 실패')); }, 'image/jpeg', 0.75);
    };
    img.onerror = reject;
    img.src = url;
  });
}
function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(parts[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
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
  slotOpen: null, // { date, open: { morning, lunch, evening } }
};
function dogName(id) {
  const d = state.dogs.find(function (x) { return x.id === id; });
  return d ? d.name : id;
}

// 슬롯 펼침 상태 (날짜 바뀌면 초기화: 오늘은 현재 시간대만 펼침)
function ensureSlotOpen() {
  if (!ui.slotOpen || ui.slotOpen.date !== ui.date) {
    const open = { morning: false, lunch: false, evening: false };
    if (ui.date === dateStr(new Date())) open[currentSlotId()] = true;
    ui.slotOpen = { date: ui.date, open: open };
  }
}
// 접힌 슬롯 헤더에 보여줄 요약 이모지
function slotSummary(v) {
  const parts = [];
  const mood = MOODS.find(function (x) { return x.v === v.mood; });
  const meal = MEALS.find(function (x) { return x.v === v.meal; });
  const poop = POOPS.find(function (x) { return x.v === v.poop; });
  if (mood) parts.push(mood.e);
  if (meal) parts.push(meal.e);
  if (poop) parts.push(poop.e);
  return parts.length ? parts.join(' ') : '<span class="muted">미기록</span>';
}

// 강아지 얼굴 사진 (파일이 있을 때만 표시, 없으면 이모지)
const DOG_PHOTOS = { teddy: 'teddy.png', pomi: 'pomi.png' };
const dogPhotoOk = {};
function preloadDogPhotos() {
  Object.keys(DOG_PHOTOS).forEach(function (id) {
    const img = new Image();
    img.onload = function () { dogPhotoOk[id] = true; renderDogTabs(); };
    img.src = DOG_PHOTOS[id];
  });
}

// ---------- 렌더: 강아지 탭 ----------
function renderDogTabs() {
  const el = document.getElementById('dogTabs');
  el.innerHTML = state.dogs.map(function (d) {
    const face = dogPhotoOk[d.id]
      ? '<img class="dog-face" src="' + DOG_PHOTOS[d.id] + '" alt="' + escapeAttr(d.name) + '">'
      : d.emoji + ' ';
    return '<button data-action="select-dog" data-dog="' + d.id + '"' +
      (d.id === ui.dog ? ' class="active"' : '') + '>' + face + d.name + '</button>';
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
  ensureSlotOpen();
  document.getElementById('dateLabel').textContent = prettyDate(ui.date);
  const todayS = dateStr(new Date());
  document.getElementById('dateSub').textContent =
    ui.date === todayS ? '오늘' : (ui.date < todayS ? '지난 기록' : '미래 날짜');

  // 3타임 슬롯 (접이식) — 입력 중 포커스 유지 (동기화 리렌더 대비)
  const ae = document.activeElement;
  const mealFocus = (ae && ae.classList && ae.classList.contains('meal-note'))
    ? { slot: ae.dataset.slot, s: ae.selectionStart, e: ae.selectionEnd } : null;
  document.getElementById('slotList').innerHTML = SLOTS.map(function (s) {
    const v = rec.slots[s.id] || {};
    const isOpen = ui.slotOpen.open[s.id];
    return '<div class="card"><button class="slot-head" data-action="toggle-slot" data-slot="' + s.id + '">' +
      '<span class="slot-title">' + s.label + '</span>' +
      '<span class="slot-sum">' + slotSummary(v) + '</span>' +
      '<span class="slot-arrow">' + (isOpen ? '▾' : '▸') + '</span></button>' +
      '<div class="slot-body' + (isOpen ? '' : ' hidden') + '">' +
      '<div class="field"><div class="field-name">컨디션</div>' +
        optRow('mood', s.id, MOODS, v.mood) + '</div>' +
      '<div class="field"><div class="field-name">식사</div>' +
        optRow('meal', s.id, MEALS, v.meal) +
        '<input class="text-input meal-note" data-action="meal-note" data-slot="' + s.id + '"' +
        ' placeholder="메뉴 (예: 사료, 처방식)" value="' + escapeAttr(v.mealNote || '') + '"></div>' +
      '<div class="field"><div class="field-name">응가</div>' +
        optRow('poop', s.id, POOPS, v.poop) + '</div>' +
      '</div></div>';
  }).join('');
  if (mealFocus) {
    const inp = document.querySelector('.meal-note[data-slot="' + mealFocus.slot + '"]');
    if (inp) {
      inp.focus();
      try { inp.setSelectionRange(mealFocus.s, mealFocus.e); } catch (e) {}
    }
  }

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
  document.getElementById('photoLocalHint').classList.toggle('hidden', cloudPhotos());
}

async function renderPhotos(rec) {
  const box = document.getElementById('photoThumbs');
  box.innerHTML = '';
  const photos = rec.photos || [];
  // 클라우드 사진 모드: Storage URL을 바로 표시
  if (cloudPhotos()) {
    photos.forEach(function (p) {
      if (!p || !p.url) return;
      const wrap = document.createElement('div');
      wrap.className = 'thumb';
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = '기록 사진';
      const del = document.createElement('button');
      del.textContent = '✕';
      del.setAttribute('aria-label', '사진 삭제');
      del.addEventListener('click', function () { cloudDeletePhoto(rec, p); });
      wrap.appendChild(img);
      wrap.appendChild(del);
      box.appendChild(wrap);
    });
    return;
  }
  // 로컬 모드: IndexedDB
  for (const pid of photos) {
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

// 클라우드 사진 삭제
async function cloudDeletePhoto(rec, p) {
  rec.photos = (rec.photos || []).filter(function (x) { return x.id !== p.id; });
  saveState();
  renderPhotos(rec);
  try { if (p.path) await CLOUD.storage.ref(p.path).delete(); } catch (e) {}
  cloudWrite(dayDocRef(ui.date, ui.dog).set(
    { photos: firebase.firestore.FieldValue.arrayRemove(p) }, { merge: true }));
}

// 클라우드 사진 추가
async function cloudAddPhotos(rec, files) {
  const dateS = ui.date, dogId = ui.dog;
  for (const f of files) {
    try {
      const blob = await fileToBlob(f);
      const pid = uid();
      const path = 'photos/' + dateS + '/' + dogId + '/' + pid + '.jpg';
      const ref = CLOUD.storage.ref(path);
      await ref.put(blob, { contentType: 'image/jpeg' });
      const url = await ref.getDownloadURL();
      const entry = { id: pid, url: url, path: path };
      rec.photos.push(entry);
      saveState();
      cloudWrite(dayDocRef(dateS, dogId).set({
        date: dateS, dogId: dogId,
        photos: firebase.firestore.FieldValue.arrayUnion(entry),
      }, { merge: true }));
    } catch (e) {}
  }
  renderPhotos(rec);
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
  subscribeCloud();
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
    subscribeCloud();
    if (ui.view === 'today') renderToday();
    if (ui.view === 'cal') renderCal();
    if (ui.view === 'meds') { ui.editingMedId = null; resetMedForm(); renderMeds(); }
  }
  else if (a === 'goto-view') { switchView(el.dataset.view); }
  else if (a === 'prev-day') {
    const d = parseDate(ui.date); d.setDate(d.getDate() - 1);
    ui.date = dateStr(d); renderToday(); subscribeCloud();
  }
  else if (a === 'next-day') {
    const d = parseDate(ui.date); d.setDate(d.getDate() + 1);
    ui.date = dateStr(d); renderToday(); subscribeCloud();
  }
  else if (a === 'set-slot') {
    const rec = dayRec(ui.date, ui.dog);
    const slot = rec.slots[el.dataset.slot];
    const field = el.dataset.field;
    let val = el.dataset.value;
    if (field === 'mood') val = Number(val);
    slot[field] = val; // 같은 값을 다시 탭해도 유지 (실수로 풀리던 문제 수정)
    saveState();
    cloudSetSlotField(ui.date, ui.dog, el.dataset.slot, field, slot[field]);
    renderToday();
  }
  else if (a === 'toggle-slot') {
    ensureSlotOpen();
    const sid = el.dataset.slot;
    ui.slotOpen.open[sid] = !ui.slotOpen.open[sid];
    renderToday();
  }
  else if (a === 'toggle-med') {
    const rec = dayRec(ui.date, ui.dog);
    const mid = el.dataset.med, t = el.dataset.time;
    if (!rec.medChecks[mid]) rec.medChecks[mid] = {};
    const on = !rec.medChecks[mid][t];
    if (on) rec.medChecks[mid][t] = true; else delete rec.medChecks[mid][t];
    saveState();
    cloudSetMedCheck(ui.date, ui.dog, mid, t, on);
    renderToday();
  }
  else if (a === 'cal-prev') {
    ui.calCursor = new Date(ui.calCursor.getFullYear(), ui.calCursor.getMonth() - 1, 1);
    renderCal(); subscribeCloud();
  }
  else if (a === 'cal-next') {
    ui.calCursor = new Date(ui.calCursor.getFullYear(), ui.calCursor.getMonth() + 1, 1);
    renderCal(); subscribeCloud();
  }
  else if (a === 'cal-day') {
    ui.date = el.dataset.date;
    renderCalDetail(el.dataset.date);
    subscribeCloud();
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
    cloudDeleteMed(el.dataset.med);
    renderMeds();
  }
});

// 텍스트 입력 → 클라우드 쓰기 디바운스 (타이핑 중 과다 쓰기 방지)
let cloudTextTimer = null;
function cloudTextLater(fn) {
  if (!CLOUD.on) return;
  clearTimeout(cloudTextTimer);
  cloudTextTimer = setTimeout(fn, 800);
}

document.addEventListener('input', function (e) {
  const el = e.target;
  if (el.id === 'noteInput') {
    const rec = dayRec(ui.date, ui.dog);
    rec.note = el.value;
    saveState();
    cloudTextLater(function () { cloudSetNote(ui.date, ui.dog, el.value); });
  } else if (el.dataset && el.dataset.action === 'meal-note') {
    const rec = dayRec(ui.date, ui.dog);
    rec.slots[el.dataset.slot].mealNote = el.value;
    saveState();
    cloudTextLater(function () { cloudSetSlotField(ui.date, ui.dog, el.dataset.slot, 'mealNote', el.value); });
  }
});

document.getElementById('photoInput').addEventListener('change', async function (e) {
  const rec = dayRec(ui.date, ui.dog);
  const files = Array.from(e.target.files || []).slice(0, 5);
  e.target.value = '';
  if (cloudPhotos()) { await cloudAddPhotos(rec, files); return; }
  for (const f of files) {
    try {
      const dataUrl = await fileToDataUrl(f);
      const pid = uid();
      await photoPut(pid, dataUrl);
      rec.photos.push(pid);
    } catch (err) {}
  }
  saveState();
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
    if (m) { m.name = name; m.times = times; m.memo = memo; cloudSaveMed(m); }
  } else {
    const m = { id: uid(), name: name, times: times, memo: memo, order: Date.now(), createdAt: Date.now() };
    state.meds[ui.dog].push(m);
    cloudSaveMed(m);
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
preloadDogPhotos();
renderDogTabs();
switchView('today');
if (cloudEnabled()) {
  const badge = document.createElement('div');
  badge.id = 'cloudBadge';
  badge.textContent = '☁️ 동기화 연결 중…';
  document.body.appendChild(badge);
  bootCloud().then(function () {
    const b = document.getElementById('cloudBadge');
    if (b) b.textContent = CLOUD.on ? '☁️ 가족 공유 연결됨' : '📱 로컬 모드';
    setTimeout(function () { const x = document.getElementById('cloudBadge'); if (x) x.remove(); }, 2500);
  });
}
