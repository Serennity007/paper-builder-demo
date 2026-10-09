/* =========================================================
 * P1 题库静态路由：把后端专属的 workspace / diagnostic 接口
 * 在浏览器里用 js/p1-bank.js 的数据重新实现一遍，使 GitHub Pages
 * 这种无后端环境也能演示真实的已确认 P1 题卡。
 *
 * 语义对齐 backend/app.py 与 backend/diagnostic.py；差异见 README。
 * 原卷 PDF 下载与 MS 答案裁图不在此静态包内。
 * ========================================================= */
(function () {
  'use strict';

  var B = window.ZJ_P1_BANK;
  if (!B) { return; }

  var EDITS_KEY = 'zhxx_p1_card_edits_v1';
  var PAPERS_KEY = 'zhxx_p1_papers_v1';
  var RUNS_KEY = 'zhxx_p1_runs_v1';
  var LEADS_KEY = 'zhxx_p1_leads_v1';
  var STATES = ['can', 'unsure', 'cannot', 'unlearned'];
  var INTENTS = ['获取完整 P1 学习规划', '获取针对性真题练习', '预约完整数学水平诊断', '咨询 P1/P2 课程'];
  var DISCLAIMER = '本报告基于本次快速自评生成，仅作为初步学习诊断，不等同于正式考试成绩。';

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 忽略 */ }
  }
  function now() { return new Date().toISOString().slice(0, 19); }
  function utcNow() { return new Date().toISOString(); }
  function canonical(obj) {
    if (obj === null || typeof obj !== 'object') { return JSON.stringify(obj); }
    return '{' + Object.keys(obj).sort().map(function (k) {
      return JSON.stringify(k) + ':' + canonical(obj[k]);
    }).join(',') + '}';
  }
  function fail(message) { return Promise.reject(new Error(message)); }

  var topicIndex = {};
  B.catalogs.forEach(function (cat) {
    cat.topics.forEach(function (t) {
      topicIndex[t.id] = { id: t.id, chapter: t.chapter, name: t.name, title: cat.title, edition: cat.edition };
    });
  });

  /* ---------- 题卡：只读快照 + 本地编辑覆盖层 ---------- */

  function cards() {
    var edits = read(EDITS_KEY, {});
    return B.cards.map(function (c) {
      var e = edits[c.id];
      if (!e) { return c; }
      var topics = (e.topicIds || []).map(function (id) { return topicIndex[id]; }).filter(Boolean);
      return Object.assign({}, c, {
        difficulty: e.difficulty, minutes: e.minutes, marks: e.marks, topics: topics,
        reviewStatus: e.reviewStatus, metadataRevision: e.metadataRevision,
        available: e.reviewStatus === 'approved' && topics.length > 0 &&
          e.minutes > 0 && e.marks > 0 && c.resourcesAvailable
      });
    });
  }

  function filterCards(list, q, availableOnly) {
    var out = list.filter(function (c) {
      if (q.board && c.board !== q.board) { return false; }
      if (q.paper && c.paper !== q.paper) { return false; }
      if (q.examPaperId && String(c.examPaperId) !== String(q.examPaperId)) { return false; }
      if (q.year && String(c.year) !== String(q.year)) { return false; }
      if (q.topicId && !c.topics.some(function (t) { return String(t.id) === String(q.topicId); })) { return false; }
      if (q.difficulty && String(c.difficulty) !== String(q.difficulty)) { return false; }
      if (q.maxMinutes && c.minutes > Number(q.maxMinutes)) { return false; }
      if (q.state === 'ready' && !c.available) { return false; }
      if (q.state === 'pending' && c.available) { return false; }
      if (availableOnly && !c.available) { return false; }
      return true;
    });
    out.sort(function (a, b) { return b.year - a.year || b.id - a.id; });
    return out;
  }

  /* ---------- 生成：有界子集选择，与 workspace_generate 一致 ---------- */

  function generate(body) {
    var target = Number(body.targetMinutes || 0);
    if (!(target >= 1 && target <= 600) || !body.paper || !body.topicId) {
      throw new Error('请选择卷型、Topic 和 1–600 分钟目标时长');
    }
    var pool = filterCards(cards(), body, true);
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    var choices = { 0: [] };
    pool.forEach(function (card) {
      Object.keys(choices).forEach(function (total) {
        var next = Number(total) + card.minutes;
        if (next > 0 && next <= target && !Object.prototype.hasOwnProperty.call(choices, next)) {
          choices[next] = choices[total].concat([card]);
        }
      });
    });
    var best = Math.max.apply(null, Object.keys(choices).map(Number));
    return { cards: choices[best], totalMinutes: best, shortageMinutes: target - best, candidateCount: pool.length };
  }

  /* ---------- 已保存试卷：本地覆盖层 + 快照冻结 ---------- */

  function paperState() {
    var saved = read(PAPERS_KEY, null);
    if (!saved) {
      saved = { nextId: 1, rows: B.papers.map(function (p) { return Object.assign({}, p); }) };
      saved.nextId = Math.max.apply(null, saved.rows.map(function (p) { return p.id; }).concat([0])) + 1;
      write(PAPERS_KEY, saved);
    }
    return saved;
  }

  function paperPayload(row) {
    return { id: row.id, name: row.name, revision: row.revision, filters: row.filters,
      items: row.items, updatedAt: row.updatedAt };
  }

  function listPapers() {
    return paperState().rows.slice().sort(function (a, b) {
      return String(b.updatedAt).localeCompare(String(a.updatedAt)) || b.id - a.id;
    }).map(paperPayload);
  }

  function savePaper(body) {
    var name, ids, pid, filters;
    try {
      name = String(body.name || '').trim();
      ids = (body.questionIds || []).map(Number);
      pid = Number(body.id || 0);
      filters = body.filters;
      if (!name || name.length > 200 || !ids.length || ids.length > 100 ||
        new Set(ids).size !== ids.length || !filters || !filters.paper) { throw new Error('x'); }
    } catch (e) {
      throw new Error('请填写名称、卷型并选择不重复的题卡（最多100题）');
    }
    var state = paperState();
    var old = pid ? state.rows.filter(function (p) { return p.id === pid; })[0] : null;
    if (old && body.revision !== old.revision) { throw new Error('试卷已更新，请重新打开'); }
    var candidates = {};
    filterCards(cards(), filters, true).forEach(function (c) { candidates[c.id] = c; });
    var sameFilters = !!old && canonical(old.filters) === canonical(filters);
    var oldItems = {};
    if (old) { old.items.forEach(function (c) { oldItems[c.id] = c; }); }
    var items = [];
    ids.forEach(function (qid) {
      if (sameFilters && oldItems[qid]) { items.push(oldItems[qid]); } else if (candidates[qid]) { items.push(candidates[qid]); } else {
        throw new Error('题卡未确认可用或不符合当前筛选条件，请重新选择');
      }
    });
    var total = items.reduce(function (n, c) { return n + c.minutes; }, 0);
    var row, revision;
    if (old) {
      old.name = name; old.duration = total; old.updatedAt = now();
      old.revision += 1;
      old.items = items;
      old.filters = filters;
      row = old;
      revision = old.revision;
    } else {
      revision = 1;
      row = {
        id: state.nextId++, name: name, subjectLine: filters.board + ' ' + filters.paper,
        remark: '', duration: total, status: '草稿', variant: '', createdBy: 'teacher',
        updatedAt: now(), revision: revision, filters: filters, items: items
      };
      state.rows.push(row);
    }
    write(PAPERS_KEY, state);
    return { paper: paperPayload(row) };
  }

  /* ---------- 学生诊断：题组、评分、线索 ---------- */

  function diagnosticCards() {
    var byId = {};
    cards().forEach(function (c) { byId[c.id] = c; });
    return B.diagnostic.ids.map(function (id) { return byId[id]; });
  }

  function diagnosticQuestions() {
    var rows = diagnosticCards();
    rows.forEach(function (c) {
      if (!c || !c.available || c.board !== 'Edexcel' || c.paper !== 'P1' || !c.topics.length) {
        throw new Error('固定诊断题组尚未可用，请检查已确认 P1 题库及原件。');
      }
    });
    return {
      version: B.diagnostic.version,
      questions: rows.map(function (c) {
        return {
          id: c.id, difficulty: c.difficulty, marks: c.marks, minutes: c.minutes,
          topics: c.topics.map(function (t) { return t.name; }),
          source: 'Edexcel IAL P1 · ' + c.year + ' ' + c.session + ' · Q' + c.originalQuestionNumber,
          images: c.regions.slice().sort(function (a, b) { return a.sortOrder - b.sortOrder; })
            .map(function (r) { return r.url; })
        };
      })
    };
  }

  function scoreReport(rows, answers) {
    var groups = {}, weighted = 0, total = 0;
    rows.forEach(function (card) {
      var state = answers[String(card.id)];
      var difficulty = card.difficulty;
      var weight = difficulty <= 2 ? 3 : difficulty === 3 ? 2 : 1;
      var value = state === 'can' ? 1 : state === 'unsure' ? 0.5 : 0;
      if (state !== 'unlearned') { weighted += value * weight; total += weight; }
      card.topics.forEach(function (topic) {
        var entry = groups[topic.name] = groups[topic.name] || [];
        entry.push({ questionId: card.id, state: state, difficulty: difficulty });
      });
    });
    var result = { mastered: [], risk: [], weak: [], unlearned: [], partial: [] };
    var evidence = [];
    Object.keys(groups).forEach(function (topic) {
      var rws = groups[topic];
      var covered = rws.filter(function (r) { return r.state !== 'unlearned'; });
      var category, reason;
      if (!covered.length) {
        category = 'unlearned'; reason = '本次相关题均选择没学过，表示课程进度尚未覆盖。';
      } else if (covered.some(function (r) { return r.state === 'cannot' && r.difficulty <= 2; })) {
        category = 'weak'; reason = '基础题选择不会，建议优先补基础。';
      } else if (covered.every(function (r) { return r.state === 'can'; })) {
        category = 'mastered'; reason = '已学题均选择会做；仍需用实际解题验证。';
      } else {
        category = 'risk'; reason = '存在不确定或不会；高难题不会仅作为复核信号。';
      }
      result[category].push(topic);
      if (covered.length && covered.length < rws.length) { result.partial.push(topic); }
      evidence.push({ topic: topic, category: category, reason: reason, answers: rws });
    });
    var score = total ? Math.round(100 * weighted / total) : null;
    var learned = 0;
    Object.keys(answers).forEach(function (k) { if (answers[k] !== 'unlearned') { learned += 1; } });
    return Object.assign({}, result, {
      readiness: score,
      readinessLabel: score === null ? '尚无法判断' : score < 40 ? '基础待巩固' : score < 75 ? '正在建立掌握' : '自评准备较充分',
      learnedQuestions: learned, totalQuestions: rows.length,
      priorities: result.weak.concat(result.risk).concat(result.unlearned),
      evidence: evidence, disclaimer: DISCLAIMER, version: B.diagnostic.version,
      advice: '先补基础薄弱项，再用真题复核风险项；未学内容按课程进度安排。准备度仅计算已学题，加权会做=1、不确定=0.5、不会=0；基础/中等/较难权重=3/2/1。多 Topic 大题只能提供联合信号，不能定位每个小问。'
    });
  }

  function newRunId() {
    var bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    var s = '';
    bytes.forEach(function (b) { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function createReport(body) {
    var answers = body && body.answers;
    var keys = Object.keys(answers || {});
    var expected = B.diagnostic.ids.map(String);
    if (!answers || keys.length !== expected.length ||
      !expected.every(function (k) { return keys.indexOf(k) >= 0; }) ||
      !keys.every(function (k) { return STATES.indexOf(answers[k]) >= 0; })) {
      throw new Error('请完成全部 8 题，并选择有效状态。');
    }
    var rows = diagnosticCards();
    var report = scoreReport(rows, answers);
    var runs = read(RUNS_KEY, {});
    var run = newRunId();
    runs[run] = { answers: answers, report: report, created_at: utcNow() };
    write(RUNS_KEY, runs);
    return { runId: run, report: report };
  }

  function submitLead(body) {
    if (!body || typeof body !== 'object') { throw new Error('提交内容无效'); }
    var limits = { name: 80, contact: 160, course: 120, examTime: 80, intent: 80, runId: 100 };
    var values = {};
    Object.keys(limits).forEach(function (key) {
      var value = body[key] === undefined ? '' : body[key];
      if (typeof value !== 'string' || value.trim().length > limits[key]) { throw new Error('字段类型或长度无效'); }
      values[key] = value.trim();
    });
    if (!values.name || !values.contact || !values.course || !values.intent || !values.runId ||
      INTENTS.indexOf(values.intent) < 0 || body.consent !== true) {
      throw new Error('请填写必填项并同意用于本次咨询联系。');
    }
    if (!read(RUNS_KEY, {})[values.runId]) { throw new Error('诊断记录不存在，请重新完成诊断。'); }
    var leads = read(LEADS_KEY, []);
    var runs = read(RUNS_KEY, {});
    leads.push({
      id: leads.length ? Math.max.apply(null, leads.map(function (l) { return l.id; })) + 1 : 1,
      run_id: values.runId, name: values.name, contact: values.contact, course: values.course,
      exam_time: values.examTime, intent: values.intent, created_at: utcNow(),
      is_priority: 0, deleted_at: null, report: runs[values.runId].report
    });
    write(LEADS_KEY, leads);
    return { ok: true };
  }

  function listLeads(query) {
    var onlyPriority = query.priority === '1';
    var out = read(LEADS_KEY, []).filter(function (l) {
      return !l.deleted_at && (!onlyPriority || l.is_priority);
    });
    out.sort(function (a, b) { return b.is_priority - a.is_priority || b.id - a.id; });
    return { leads: out.slice(0, 200) };
  }

  function manageLead(id, method, body) {
    var leads = read(LEADS_KEY, []);
    var row = leads.filter(function (l) { return String(l.id) === String(id) && !l.deleted_at; })[0];
    if (!row) { throw new Error('线索不存在或已删除'); }
    if (method === 'DELETE') { row.deleted_at = utcNow(); } else {
      if (!body || typeof body.priority !== 'boolean') { throw new Error('重点标记必须为 true 或 false'); }
      row.is_priority = body.priority ? 1 : 0;
    }
    write(LEADS_KEY, leads);
    return { ok: true };
  }

  /* ---------- 路由入口 ---------- */

  function parse(path) {
    var cut = path.indexOf('?');
    var clean = (cut < 0 ? path : path.slice(0, cut)).replace(/^\/+/, '');
    var query = {};
    if (cut >= 0) {
      path.slice(cut + 1).split('&').filter(Boolean).forEach(function (pair) {
        var kv = pair.split('=');
        query[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      });
    }
    return { seg: clean.split('/'), query: query };
  }

  function handle(method, path, body) {
    var r = parse(path);
    var seg = r.seg, q = r.query, group = seg[1], name = seg[2], arg = seg[3];
    try {
      if (group === 'workspace') {
        if (name === 'catalogs' && method === 'GET') {
          return { catalogs: B.catalogs.filter(function (c) { return !q.board || c.board === q.board; }) };
        }
        if (name === 'catalogs' && method === 'POST') {
          return fail('静态演示不包含新增教材目录，请从正式后端维护。');
        }
        if (name === 'cards' && method === 'GET') {
          return { cards: filterCards(cards(), q, q.usable === '1') };
        }
        if (name === 'cards' && method === 'PATCH') {
          var base = B.cards.filter(function (c) { return String(c.id) === String(arg); })[0];
          if (!base) { return fail('题卡不存在'); }
          var diff = Number(body.difficulty), minutes = Number(body.minutes), marks = Number(body.marks);
          var topicIds = (body.topicIds || []).map(Number);
          var action = body.action || 'draft';
          if (!(diff >= 1 && diff <= 5) || !(minutes >= 0 && minutes <= 600) ||
            !isFinite(marks) || !(marks >= 0 && marks <= 1000) ||
            ['draft', 'approve'].indexOf(action) < 0 || Number(body.metadataRevision) !== base.metadataRevision ||
            Number(body.regionRevision) !== base.regionRevision) {
            return fail('题卡已被修改，或难度、分钟、分值、版本无效');
          }
          if (topicIds.some(function (t) { return !topicIndex[t]; })) {
            return fail('Topic 必须属于本题考试局和卷型的教材目录');
          }
          if (action === 'approve' && (body.confirmed !== true || !topicIds.length || minutes <= 0 ||
            marks <= 0 || !base.resourcesAvailable)) {
            return fail('请核对完整题干及 MS，选择教材 Topic，填写正数分钟和分值后确认可用');
          }
          var edits = read(EDITS_KEY, {});
          edits[base.id] = {
            difficulty: diff, minutes: minutes, marks: marks, topicIds: topicIds,
            reviewStatus: action === 'approve' ? 'approved' : 'pending',
            metadataRevision: base.metadataRevision + 1
          };
          write(EDITS_KEY, edits);
          return { card: cards().filter(function (c) { return c.id === base.id; })[0] };
        }
        if (name === 'papers' && method === 'GET') { return { papers: listPapers() }; }
        if (name === 'papers' && method === 'POST') { return savePaper(body); }
        if (name === 'generate' && method === 'POST') { return generate(body); }
        return fail('静态演示不支持该接口：' + path);
      }
      if (group === 'diagnostic') {
        if (name === 'questions' && method === 'GET') { return diagnosticQuestions(); }
        if (name === 'report' && method === 'POST') { return createReport(body); }
        if (name === 'leads' && !arg && method === 'POST') { return submitLead(body); }
        if (name === 'leads' && !arg && method === 'GET') { return listLeads(q); }
        if (name === 'leads' && arg && (method === 'PATCH' || method === 'DELETE')) {
          return manageLead(arg, method, body);
        }
        return fail('静态演示不支持该接口：' + path);
      }
      return fail('静态演示不支持该接口：' + path);
    } catch (e) {
      return fail(e.message || String(e));
    }
  }

  /* ---------- 题卡图片：预渲染裁图 ---------- */

  function image(path) {
    var rid = (path.match(/regions\/([0-9]+)\.png/) || [])[1];
    if (rid && B.regionImages[rid]) {
      return fetch(B.regionImages[rid], { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) { throw new Error('题卡图片加载失败（' + res.status + '）'); }
          return res.blob();
        }).then(function (blob) { return URL.createObjectURL(blob); });
    }
    if (/\/pdf\/(qp|ms)$/.test(path)) {
      return fail('静态演示不提供原卷 PDF 下载，请从正式后端下载 QP/MS。');
    }
    return fail('静态演示无法预览该私有资源');
  }

  window.ZJ_StaticBank = {
    handle: handle,
    image: image,
    examPapers: function (filters) {
      var list = B.examPapers;
      if (filters) {
        list = list.filter(function (p) {
          if (filters.paper && filters.paper !== '全部' && p.paperName !== filters.paper) { return false; }
          if (filters.year && String(p.year) !== String(filters.year)) { return false; }
          if (filters.session && filters.session !== '全部' && p.session !== filters.session) { return false; }
          if (filters.status && filters.status !== '全部状态' && p.status !== filters.status) { return false; }
          return true;
        });
      }
      return list.map(function (p) { return JSON.parse(JSON.stringify(p)); });
    },
    stats: function () { return { cards: B.cards.length, available: B.cards.filter(function (c) { return c.available; }).length }; }
  };
}());
