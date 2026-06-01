(() => {
  'use strict';

  const STORAGE_KEY = 'habits-app-v1';
  const DEFAULT_EMOJI = '✦';
  const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

  const $ = (id) => document.getElementById(id);

  const els = {
    date: $('date'),
    habits: $('habits'),
    empty: $('empty'),
    progressCount: $('progressCount'),
    progressTotal: $('progressTotal'),
    progressFill: $('progressFill'),
    fabAdd: $('fabAdd'),
    sheet: $('sheet'),
    sheetBackdrop: $('sheetBackdrop'),
    sheetHandle: $('sheetHandle'),
    habitInput: $('habitInput'),
    addBtn: $('addBtn'),
    cancelBtn: $('cancelBtn'),
    emojiPicker: $('emojiPicker'),
    confirm: $('confirm'),
    confirmBackdrop: $('confirmBackdrop'),
    confirmCancel: $('confirmCancel'),
    confirmOk: $('confirmOk'),
  };

  let state = { habits: [], completions: {} };
  let selectedEmoji = DEFAULT_EMOJI;
  let pendingDeleteId = null;

  // ---------- Date helpers ----------
  const toKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const today = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const addDays = (d, n) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };

  const formatHeaderDate = (d) => {
    const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
      d.getDate()
    ).padStart(2, '0')} ${wd}`;
  };

  // ---------- State ----------
  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.habits) && parsed.completions) {
          state = parsed;
        }
      }
    } catch {
      // ignore corrupted storage
    }
  };

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  const isDone = (habitId, dateKey) => {
    return !!(state.completions[habitId] && state.completions[habitId][dateKey]);
  };

  const toggleDone = (habitId, dateKey) => {
    if (!state.completions[habitId]) state.completions[habitId] = {};
    if (state.completions[habitId][dateKey]) {
      delete state.completions[habitId][dateKey];
    } else {
      state.completions[habitId][dateKey] = true;
    }
    save();
  };

  const getStreak = (habitId) => {
    const t = today();
    const todayKey = toKey(t);
    let cursor;
    if (isDone(habitId, todayKey)) {
      cursor = t;
    } else {
      cursor = addDays(t, -1);
      if (!isDone(habitId, toKey(cursor))) return 0;
    }
    let count = 0;
    while (isDone(habitId, toKey(cursor))) {
      count += 1;
      cursor = addDays(cursor, -1);
    }
    return count;
  };

  const lastSevenDays = () => {
    const t = today();
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = addDays(t, -i);
      days.push({ date: d, key: toKey(d), label: WEEK_LABELS[d.getDay()], isToday: i === 0 });
    }
    return days;
  };

  // ---------- Render ----------
  const render = () => {
    els.date.textContent = formatHeaderDate(new Date());

    const todayKey = toKey(today());
    const total = state.habits.length;
    const done = state.habits.reduce(
      (acc, h) => acc + (isDone(h.id, todayKey) ? 1 : 0),
      0
    );

    els.progressCount.textContent = done;
    els.progressTotal.textContent = total;
    els.progressFill.style.width = total ? `${(done / total) * 100}%` : '0%';

    if (total === 0) {
      els.habits.hidden = true;
      els.empty.hidden = false;
      els.habits.innerHTML = '';
      return;
    }
    els.habits.hidden = false;
    els.empty.hidden = true;

    const week = lastSevenDays();

    els.habits.innerHTML = state.habits
      .map((h, idx) => {
        const completed = isDone(h.id, todayKey);
        const streak = getStreak(h.id);
        const streakHtml =
          streak > 0
            ? `<span class="streak-flame">●</span><span class="streak-count">${streak}日連続</span>`
            : `<span class="streak-zero">記録なし</span>`;
        const weekHtml = week
          .map((d) => {
            const cls = [
              'week-dot',
              isDone(h.id, d.key) ? 'done' : '',
              d.isToday ? 'today' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return `<div class="week-cell"><span class="week-label">${d.label}</span><div class="${cls}"></div></div>`;
          })
          .join('');

        return `
          <div class="habit-row" data-id="${h.id}" style="animation-delay: ${idx * 40}ms">
            <button class="row-delete" data-action="delete" aria-label="削除">削除</button>
            <article class="habit ${completed ? 'done' : ''}">
              <div class="habit-info">
                <div class="habit-emoji">${escapeHtml(h.emoji || DEFAULT_EMOJI)}</div>
                <div class="habit-name-wrap">
                  <div class="habit-name">${escapeHtml(h.name)}</div>
                  <div class="habit-meta">${streakHtml}</div>
                </div>
              </div>
              <button class="check" data-action="toggle" aria-label="完了切替">
                <svg viewBox="0 0 24 24"><polyline points="4 12 10 18 20 6"></polyline></svg>
              </button>
              <div class="week-row">${weekHtml}</div>
            </article>
          </div>
        `;
      })
      .join('');
  };

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));

  // ---------- Sheet ----------
  const openSheet = () => {
    selectedEmoji = DEFAULT_EMOJI;
    updateEmojiSelection();
    els.habitInput.value = '';
    els.sheet.classList.add('open');
    els.sheetBackdrop.classList.add('open');
    els.sheet.setAttribute('aria-hidden', 'false');
    setTimeout(() => els.habitInput.focus(), 300);
    updateAddDisabled();
  };

  const closeSheet = () => {
    els.sheet.classList.remove('open');
    els.sheetBackdrop.classList.remove('open');
    els.sheet.setAttribute('aria-hidden', 'true');
    els.habitInput.blur();
  };

  const updateEmojiSelection = () => {
    els.emojiPicker.querySelectorAll('.emoji-option').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.emoji === selectedEmoji);
    });
  };

  const updateAddDisabled = () => {
    const v = els.habitInput.value.trim();
    els.addBtn.disabled = v.length === 0;
  };

  const addHabit = () => {
    const name = els.habitInput.value.trim();
    if (!name) return;
    const id =
      Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.habits.push({
      id,
      name,
      emoji: selectedEmoji,
      createdAt: new Date().toISOString(),
    });
    save();
    closeSheet();
    render();
  };

  // ---------- Confirm ----------
  const openConfirm = (habitId) => {
    pendingDeleteId = habitId;
    els.confirm.classList.add('open');
    els.confirmBackdrop.classList.add('open');
  };

  const closeConfirm = () => {
    pendingDeleteId = null;
    els.confirm.classList.remove('open');
    els.confirmBackdrop.classList.remove('open');
  };

  const deletePending = () => {
    if (!pendingDeleteId) return;
    state.habits = state.habits.filter((h) => h.id !== pendingDeleteId);
    delete state.completions[pendingDeleteId];
    save();
    closeConfirm();
    render();
  };

  // ---------- Wire up ----------
  els.fabAdd.addEventListener('click', openSheet);
  els.cancelBtn.addEventListener('click', closeSheet);
  els.sheetBackdrop.addEventListener('click', closeSheet);
  els.addBtn.addEventListener('click', addHabit);
  els.habitInput.addEventListener('input', updateAddDisabled);
  els.habitInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addHabit();
    if (e.key === 'Escape') closeSheet();
  });

  els.emojiPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.emoji-option');
    if (!btn) return;
    selectedEmoji = btn.dataset.emoji;
    updateEmojiSelection();
  });

  els.confirmCancel.addEventListener('click', closeConfirm);
  els.confirmBackdrop.addEventListener('click', closeConfirm);
  els.confirmOk.addEventListener('click', deletePending);

  // ---------- Swipe-to-reveal-delete (iOS Reminders style) ----------
  const REVEAL_THRESHOLD = 48;
  const REVEAL_DISTANCE = 96;
  let swipe = null; // { row, startX, startY, dx, locked, lockedAxis }
  let suppressClick = false;

  const closeAllRows = (except) => {
    els.habits.querySelectorAll('.habit-row.revealed').forEach((r) => {
      if (r !== except) r.classList.remove('revealed');
    });
  };

  const onSwipeStart = (e) => {
    const t = e.touches ? e.touches[0] : e;
    const row = e.target.closest('.habit-row');
    if (!row) return;
    // ignore taps on the inline delete button (reveal already active)
    if (e.target.closest('.row-delete')) return;
    swipe = {
      row,
      startX: t.clientX,
      startY: t.clientY,
      dx: 0,
      locked: false,
      lockedAxis: null,
      wasRevealed: row.classList.contains('revealed'),
    };
  };

  const onSwipeMove = (e) => {
    if (!swipe) return;
    const t = e.touches ? e.touches[0] : e;
    const dx = t.clientX - swipe.startX;
    const dy = t.clientY - swipe.startY;
    if (!swipe.locked) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      swipe.locked = true;
      swipe.lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (swipe.lockedAxis === 'x') {
        swipe.row.classList.add('dragging');
        closeAllRows(swipe.row);
      } else {
        swipe = null;
        return;
      }
    }
    if (swipe.lockedAxis !== 'x') return;
    if (e.cancelable) e.preventDefault();
    const baseOffset = swipe.wasRevealed ? -REVEAL_DISTANCE : 0;
    let next = baseOffset + dx;
    if (next > 0) next = next * 0.25; // rubber-band right
    if (next < -REVEAL_DISTANCE - 30) next = -REVEAL_DISTANCE - 30 + (next + REVEAL_DISTANCE + 30) * 0.25;
    swipe.dx = next;
    swipe.row.querySelector('.habit').style.transform = `translateX(${next}px)`;
  };

  const onSwipeEnd = () => {
    if (!swipe) return;
    const row = swipe.row;
    const dx = swipe.dx;
    const wasRevealed = swipe.wasRevealed;
    const wasDrag = swipe.lockedAxis === 'x';
    row.classList.remove('dragging');
    row.querySelector('.habit').style.transform = '';
    if (wasDrag) {
      const reveal = wasRevealed
        ? dx < -REVEAL_DISTANCE + REVEAL_THRESHOLD
        : dx < -REVEAL_THRESHOLD;
      row.classList.toggle('revealed', reveal);
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 80);
    }
    swipe = null;
  };

  els.habits.addEventListener('touchstart', onSwipeStart, { passive: true });
  els.habits.addEventListener('touchmove', onSwipeMove, { passive: false });
  els.habits.addEventListener('touchend', () => { onSwipeEnd(); });
  els.habits.addEventListener('touchcancel', () => { onSwipeEnd(); });

  // Tap handling (separate from swipe — only fires when swipe didn't move)
  els.habits.addEventListener('click', (e) => {
    if (suppressClick) return;
    const row = e.target.closest('.habit-row');
    if (!row) return;
    const id = row.dataset.id;

    // Tap on delete button in revealed state
    if (e.target.closest('.row-delete')) {
      openConfirm(id);
      return;
    }

    // If any row is revealed, first tap closes it
    const anyRevealed = els.habits.querySelector('.habit-row.revealed');
    if (anyRevealed) {
      closeAllRows();
      return;
    }

    // Toggle done on row tap (anywhere on the card)
    const checkEl = row.querySelector('.check');
    toggleDone(id, toKey(today()));
    checkEl?.classList.add('pulsing');
    setTimeout(() => checkEl?.classList.remove('pulsing'), 350);
    render();
    if (navigator.vibrate) navigator.vibrate(6);
  });

  // Tap outside any habit closes revealed rows
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.habit-row')) closeAllRows();
  });

  // ---------- Sheet drag-to-dismiss ----------
  let sheetDrag = null;

  const onSheetDragStart = (e) => {
    const t = e.touches ? e.touches[0] : e;
    sheetDrag = { startY: t.clientY, dy: 0 };
    els.sheet.classList.add('dragging');
  };

  const onSheetDragMove = (e) => {
    if (!sheetDrag) return;
    const t = e.touches ? e.touches[0] : e;
    let dy = t.clientY - sheetDrag.startY;
    if (dy < 0) dy = dy * 0.25;
    sheetDrag.dy = dy;
    els.sheet.style.transform = `translateY(${dy}px)`;
  };

  const onSheetDragEnd = () => {
    if (!sheetDrag) return;
    els.sheet.classList.remove('dragging');
    els.sheet.style.transform = '';
    if (sheetDrag.dy > 80) closeSheet();
    sheetDrag = null;
  };

  els.sheetHandle.addEventListener('touchstart', onSheetDragStart, { passive: true });
  els.sheetHandle.addEventListener('touchmove', onSheetDragMove, { passive: true });
  els.sheetHandle.addEventListener('touchend', onSheetDragEnd);
  els.sheetHandle.addEventListener('touchcancel', onSheetDragEnd);
  els.sheetHandle.addEventListener('mousedown', (e) => {
    onSheetDragStart(e);
    const onMove = (ev) => onSheetDragMove(ev);
    const onUp = () => {
      onSheetDragEnd();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (els.sheet.classList.contains('open')) closeSheet();
      if (els.confirm.classList.contains('open')) closeConfirm();
    }
  });

  // ---------- iOS / PWA niceties ----------
  // Mark standalone (added to home screen) for slightly tighter chrome.
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  if (isStandalone) document.body.classList.add('standalone');

  // Keep the sheet & input above the iOS keyboard using visualViewport.
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const updateViewport = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb-inset', `${offset}px`);
      if (els.sheet.classList.contains('open') && offset > 0) {
        els.sheet.style.bottom = `${offset}px`;
      } else {
        els.sheet.style.bottom = '';
      }
    };
    vv.addEventListener('resize', updateViewport);
    vv.addEventListener('scroll', updateViewport);
  }

  // Prevent double-tap zoom on iOS for the whole app (still allows pinch).
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // ---------- Boot ----------
  load();
  render();

  // Re-render at midnight so date and streaks update
  const scheduleMidnightRefresh = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 1, 0);
    setTimeout(() => {
      render();
      scheduleMidnightRefresh();
    }, next - now);
  };
  scheduleMidnightRefresh();
})();
