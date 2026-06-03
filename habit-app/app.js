(() => {
  'use strict';

  const STORAGE_KEY = 'habits-app-v1';
  const DEFAULT_EMOJI = '✦';
  const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
  const MILESTONES = [3, 7, 14, 30, 60, 100, 365];

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

  let state = { habits: [], completions: {}, milestones: {} };
  let selectedEmoji = DEFAULT_EMOJI;
  let pendingDeleteId = null;
  let editingId = null;

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
          state = {
            habits: parsed.habits,
            completions: parsed.completions,
            milestones: parsed.milestones || {},
          };
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
    let justCompleted = false;
    if (state.completions[habitId][dateKey]) {
      delete state.completions[habitId][dateKey];
    } else {
      state.completions[habitId][dateKey] = true;
      justCompleted = true;
    }
    save();
    if (justCompleted) maybeCelebrateMilestone(habitId);
  };

  const maybeCelebrateMilestone = (habitId) => {
    const longest = getLongestStreak(habitId);
    const already = state.milestones[habitId] || [];
    const newlyReached = MILESTONES.filter(
      (m) => longest >= m && !already.includes(m)
    );
    if (newlyReached.length === 0) return;
    state.milestones[habitId] = [...already, ...newlyReached];
    save();
    showMilestoneToast(habitId, newlyReached[newlyReached.length - 1]);
  };

  const getLongestStreak = (habitId) => {
    const dates = Object.keys(state.completions[habitId] || {}).sort();
    if (dates.length === 0) return 0;
    let max = 1;
    let cur = 1;
    for (let i = 1; i < dates.length; i += 1) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diff = Math.round((curr - prev) / 86400000);
      if (diff === 1) {
        cur += 1;
        if (cur > max) max = cur;
      } else if (diff > 1) {
        cur = 1;
      }
    }
    return max;
  };

  const getTotalDays = (habitId) =>
    Object.keys(state.completions[habitId] || {}).length;

  const getRecentRate = (habitId) => {
    const habit = state.habits.find((h) => h.id === habitId);
    if (!habit) return 0;
    const created = new Date(habit.createdAt);
    created.setHours(0, 0, 0, 0);
    const t = today();
    const days = Math.floor((t - created) / 86400000) + 1;
    const window = Math.min(30, Math.max(1, days));
    let count = 0;
    for (let i = 0; i < window; i += 1) {
      if (isDone(habitId, toKey(addDays(t, -i)))) count += 1;
    }
    return Math.round((count / window) * 100);
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
        const longest = getLongestStreak(h.id);
        const totalDays = getTotalDays(h.id);
        const rate = getRecentRate(h.id);
        const hasAnyRecord = totalDays > 0;

        const metaHtml = hasAnyRecord
          ? `
              <span class="meta-item meta-streak"><span class="streak-flame">●</span>${streak}</span>
              <span class="meta-sep">·</span>
              <span class="meta-item">最長 <b>${longest}</b></span>
              <span class="meta-sep">·</span>
              <span class="meta-item">累計 <b>${totalDays}</b></span>
              <span class="meta-sep">·</span>
              <span class="meta-item"><b>${rate}</b>%</span>
            `
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
                  <div class="habit-meta">${metaHtml}</div>
                </div>
              </div>
              <button class="check" data-action="toggle" aria-label="完了切替">
                <svg viewBox="0 0 24 24"><polyline points="4 12 10 18 20 6"></polyline></svg>
              </button>
              <button class="week-row" data-action="detail" aria-label="詳細を見る">${weekHtml}</button>
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

  // ---------- Sheet (add / edit) ----------
  const sheetTitleEl = () => document.querySelector('#sheet .sheet-title');

  const openSheet = () => {
    editingId = null;
    selectedEmoji = DEFAULT_EMOJI;
    updateEmojiSelection();
    els.habitInput.value = '';
    sheetTitleEl().textContent = '新しい習慣';
    els.addBtn.textContent = '追加する';
    els.sheet.classList.add('open');
    els.sheetBackdrop.classList.add('open');
    els.sheet.setAttribute('aria-hidden', 'false');
    setTimeout(() => els.habitInput.focus(), 300);
    updateAddDisabled();
  };

  const openEditSheet = (habitId) => {
    const habit = state.habits.find((h) => h.id === habitId);
    if (!habit) return;
    closeDetail();
    editingId = habitId;
    selectedEmoji = habit.emoji || DEFAULT_EMOJI;
    updateEmojiSelection();
    els.habitInput.value = habit.name;
    sheetTitleEl().textContent = '習慣を編集';
    els.addBtn.textContent = '保存';
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
    editingId = null;
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
    if (editingId) {
      const habit = state.habits.find((h) => h.id === editingId);
      if (habit) {
        habit.name = name;
        habit.emoji = selectedEmoji;
      }
    } else {
      const id =
        Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      state.habits.push({
        id,
        name,
        emoji: selectedEmoji,
        createdAt: new Date().toISOString(),
      });
    }
    save();
    closeSheet();
    render();
  };

  // ---------- Detail sheet (stats + monthly calendar) ----------
  let detailHabitId = null;
  let detailMonth = null; // { year, month } (0-indexed month)

  const detailEls = {
    sheet: document.getElementById('detailSheet'),
    backdrop: document.getElementById('detailBackdrop'),
    handle: document.getElementById('detailHandle'),
    emoji: document.getElementById('detailEmoji'),
    title: document.getElementById('detailTitle'),
    editBtn: document.getElementById('editBtn'),
    statStreak: document.getElementById('statStreak'),
    statLongest: document.getElementById('statLongest'),
    statTotal: document.getElementById('statTotal'),
    statRate: document.getElementById('statRate'),
    milestones: document.getElementById('milestones'),
    monthLabel: document.getElementById('monthLabel'),
    monthGrid: document.getElementById('monthGrid'),
    prevMonth: document.getElementById('prevMonth'),
    nextMonth: document.getElementById('nextMonth'),
    yearGrid: document.getElementById('yearGrid'),
    yearMonths: document.getElementById('yearMonths'),
    closeBtn: document.getElementById('detailClose'),
  };

  const openDetail = (habitId) => {
    detailHabitId = habitId;
    const t = today();
    detailMonth = { year: t.getFullYear(), month: t.getMonth() };
    renderDetail();
    detailEls.sheet.classList.add('open');
    detailEls.backdrop.classList.add('open');
  };

  const closeDetail = () => {
    detailEls.sheet.classList.remove('open');
    detailEls.backdrop.classList.remove('open');
    detailHabitId = null;
  };

  const renderDetail = () => {
    if (!detailHabitId) return;
    const h = state.habits.find((x) => x.id === detailHabitId);
    if (!h) return closeDetail();

    detailEls.emoji.textContent = h.emoji || DEFAULT_EMOJI;
    detailEls.title.textContent = h.name;

    detailEls.statStreak.textContent = getStreak(h.id);
    detailEls.statLongest.textContent = getLongestStreak(h.id);
    detailEls.statTotal.textContent = getTotalDays(h.id);
    detailEls.statRate.textContent = `${getRecentRate(h.id)}%`;

    const { year, month } = detailMonth;
    detailEls.monthLabel.textContent = `${year}年${month + 1}月`;

    // Disable next button if showing current month or future
    const now = today();
    const isCurrentMonth =
      year === now.getFullYear() && month === now.getMonth();
    detailEls.nextMonth.disabled = isCurrentMonth;

    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = toKey(now);

    let cellsHtml = WEEK_LABELS.map(
      (l) => `<div class="month-head">${l}</div>`
    ).join('');

    for (let i = 0; i < startDay; i += 1) {
      cellsHtml += `<div class="month-day empty"></div>`;
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = new Date(year, month, d);
      const key = toKey(date);
      const done = isDone(h.id, key);
      const isToday = key === todayKey;
      const isFuture = date > now;
      const cls = [
        'month-day',
        done ? 'done' : '',
        isToday ? 'today' : '',
        isFuture ? 'future' : '',
      ]
        .filter(Boolean)
        .join(' ');
      cellsHtml += `<div class="${cls}" data-key="${key}"><span>${d}</span></div>`;
    }

    detailEls.monthGrid.innerHTML = cellsHtml;

    renderMilestones(h.id);
    renderYearGrid(h.id);
  };

  const renderMilestones = (habitId) => {
    const longest = getLongestStreak(habitId);
    const html = MILESTONES.map((m) => {
      const reached = longest >= m;
      return `
        <div class="milestone ${reached ? 'reached' : ''}">
          <div class="milestone-num">${m}</div>
          <div class="milestone-label">日</div>
        </div>
      `;
    }).join('');
    detailEls.milestones.innerHTML = html;
  };

  const renderYearGrid = (habitId) => {
    const t = today();
    // Start from the Sunday 51 weeks before this week's Sunday
    const thisSun = new Date(t);
    thisSun.setDate(t.getDate() - t.getDay());
    const start = new Date(thisSun);
    start.setDate(thisSun.getDate() - 51 * 7);

    // 52 weeks × 7 days = 364 cells (close to a year)
    let cellsHtml = '';
    let monthsHtml = '';
    let lastMonth = -1;
    for (let w = 0; w < 52; w += 1) {
      // For month label, look at the first day of this week
      const firstOfWeek = new Date(start);
      firstOfWeek.setDate(start.getDate() + w * 7);
      const month = firstOfWeek.getMonth();
      const showLabel = month !== lastMonth && firstOfWeek.getDate() <= 7;
      monthsHtml += `<div class="year-month-label">${
        showLabel ? `${month + 1}月` : ''
      }</div>`;
      if (showLabel) lastMonth = month;

      for (let d = 0; d < 7; d += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        if (date > t) {
          cellsHtml += `<div class="year-cell future" style="grid-column:${w + 1};grid-row:${d + 1}"></div>`;
        } else {
          const done = isDone(habitId, toKey(date));
          const todayCls = toKey(date) === toKey(t) ? ' today' : '';
          cellsHtml += `<div class="year-cell${done ? ' done' : ''}${todayCls}" style="grid-column:${w + 1};grid-row:${d + 1}" data-key="${toKey(date)}" title="${toKey(date)}"></div>`;
        }
      }
    }
    detailEls.yearGrid.innerHTML = cellsHtml;
    detailEls.yearMonths.innerHTML = monthsHtml;
  };

  // ---------- Milestone toast ----------
  const showMilestoneToast = (habitId, milestone) => {
    const habit = state.habits.find((h) => h.id === habitId);
    if (!habit) return;
    const toast = document.getElementById('toast');
    toast.innerHTML = `
      <div class="toast-emoji">${escapeHtml(habit.emoji || DEFAULT_EMOJI)}</div>
      <div class="toast-content">
        <div class="toast-num">${milestone}日連続 達成 ✦</div>
        <div class="toast-sub">${escapeHtml(habit.name)}</div>
      </div>
    `;
    toast.classList.remove('show');
    void toast.offsetWidth;
    toast.classList.add('show');
    if (navigator.vibrate) navigator.vibrate([20, 60, 30, 60, 30]);
    clearTimeout(showMilestoneToast._t);
    showMilestoneToast._t = setTimeout(() => toast.classList.remove('show'), 3800);
  };

  const changeMonth = (delta) => {
    if (!detailMonth) return;
    const d = new Date(detailMonth.year, detailMonth.month + delta, 1);
    const now = today();
    if (
      d.getFullYear() > now.getFullYear() ||
      (d.getFullYear() === now.getFullYear() && d.getMonth() > now.getMonth())
    )
      return;
    detailMonth = { year: d.getFullYear(), month: d.getMonth() };
    renderDetail();
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

    // Tap on week-row (7-day preview) opens detail view
    if (e.target.closest('[data-action="detail"]')) {
      openDetail(id);
      return;
    }

    // Toggle done on row tap (anywhere else on the card)
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

  // ---------- Detail sheet wiring ----------
  detailEls.closeBtn.addEventListener('click', closeDetail);
  detailEls.backdrop.addEventListener('click', closeDetail);
  detailEls.prevMonth.addEventListener('click', () => changeMonth(-1));
  detailEls.nextMonth.addEventListener('click', () => changeMonth(1));
  detailEls.editBtn.addEventListener('click', () => {
    if (detailHabitId) openEditSheet(detailHabitId);
  });

  detailEls.monthGrid.addEventListener('click', (e) => {
    const cell = e.target.closest('.month-day');
    if (!cell || cell.classList.contains('empty') || cell.classList.contains('future')) return;
    const key = cell.dataset.key;
    if (!key || !detailHabitId) return;
    toggleDone(detailHabitId, key);
    renderDetail();
    render();
    if (navigator.vibrate) navigator.vibrate(6);
  });

  // Drag-to-dismiss for detail sheet
  let detailDrag = null;
  const onDetailDragStart = (e) => {
    const t = e.touches ? e.touches[0] : e;
    detailDrag = { startY: t.clientY, dy: 0 };
    detailEls.sheet.classList.add('dragging');
  };
  const onDetailDragMove = (e) => {
    if (!detailDrag) return;
    const t = e.touches ? e.touches[0] : e;
    let dy = t.clientY - detailDrag.startY;
    if (dy < 0) dy = dy * 0.25;
    detailDrag.dy = dy;
    detailEls.sheet.style.transform = `translateY(${dy}px)`;
  };
  const onDetailDragEnd = () => {
    if (!detailDrag) return;
    detailEls.sheet.classList.remove('dragging');
    detailEls.sheet.style.transform = '';
    if (detailDrag.dy > 80) closeDetail();
    detailDrag = null;
  };
  detailEls.handle.addEventListener('touchstart', onDetailDragStart, { passive: true });
  detailEls.handle.addEventListener('touchmove', onDetailDragMove, { passive: true });
  detailEls.handle.addEventListener('touchend', onDetailDragEnd);
  detailEls.handle.addEventListener('touchcancel', onDetailDragEnd);
  detailEls.handle.addEventListener('mousedown', (e) => {
    onDetailDragStart(e);
    const onMove = (ev) => onDetailDragMove(ev);
    const onUp = () => {
      onDetailDragEnd();
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
      if (detailEls.sheet.classList.contains('open')) closeDetail();
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
