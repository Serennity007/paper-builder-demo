/* =========================================================
 * 成都智慧象留学 - 国际课程组卷系统 · 真题库与知识点刷题
 *
 * 页签：真题库（Paper 元数据 + QP/MS）｜知识点刷题（P1/P2→Topic→Subtopic→列表→详情→MS）｜我的收藏
 * 由 admin.js 初始化：window.ZJ_Archive.init({ ZJ, Data, state })
 * ========================================================= */
(function () {
  'use strict';

  var ZJ, Data, adminState, root, rootPractice;
  var ready = false;
  var paperFilter = 'P1';          // 刷题页当前 Paper
  var currentTopicId = 0;          // 0 = 全部
  var practiceFilters = { year: '', session: '', difficulty: '' };
  var archiveFilters = { board: 'Edexcel', paper: '', year: '', session: '', status: '全部状态' };
  var archiveLoad=0;
  var epCache = [];                // 真题卷缓存
  var pendingPdfs = { qp: null, ms: null };
  var sourceState = null;
  var savedQuestion = null;
  var sourceUrls = [];
  var sourceLoad = 0;
  var historyView = null;      // 当前正在查看的历史修订 { questionId, revision, serial }
  var historyLoad = 0;         // 历史预览请求序号：只有最新一次请求可更新 DOM
  var historyUrls = [];        // 历史预览的 blob URL，切换/关闭时立即释放

  function init(ctx) {
    try {
      ZJ = ctx.ZJ;
      Data = ctx.Data;
      adminState = ctx.state;
      root = document.getElementById('tab-archive');
      rootPractice = document.getElementById('tab-practice');
      bindArchive();
      bindPractice();
      ready = true;
    } catch (e) {
      window.__archiveErr = String(e && e.stack || e);
    }
  }

  function refresh() {
    if (!ready) { return; }
    loadArchive();
  }

  /* ================= 真题库 ================= */

  function bindArchive() {
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) { return; }
      var id = Number(btn.dataset.id);
      var act = btn.dataset.act;
      if (act === 'new') { openExamPaperModal(null); }
      else if (act === 'edit') { openExamPaperModal(id); }
      else if (act === 'del') {
        ZJ.confirm('删除真题卷', '删除后该卷下题目将脱离真题关联（题目保留在题库）。确定删除吗？', '删除').then(function (ok) {
          if (!ok) { return; }
          Data.deleteExamPaper(id).then(function () { ZJ.toast('真题卷已删除'); loadArchive(); })
            .catch(function (err) { ZJ.toast(err.message, true); });
        });
      }
      else if (act === 'preview-qp' || act === 'preview-ms') {
        Data.previewExamPaperPdf(id, act.slice(8)).catch(function (err) { ZJ.toast(err.message, true); });
      }
      else if (act === 'create-source') { openSourceQuestion(id); }
      else if (act === 'open-source') { openSavedSource(id); }
    });
    ['ar-paper', 'ar-year'].forEach(function(id){document.getElementById(id).addEventListener('input',function(){archiveFilters.paper=document.getElementById('ar-paper').value;archiveFilters.year=document.getElementById('ar-year').value;loadArchive();});});
    ['ar-paper', 'ar-year', 'ar-session', 'ar-status'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        archiveFilters.paper = document.getElementById('ar-paper').value;
        archiveFilters.year = document.getElementById('ar-year').value;
        archiveFilters.session = document.getElementById('ar-session').value;
        archiveFilters.status = document.getElementById('ar-status').value;
        loadArchive();
      });
    });
    document.getElementById('btn-ep-new').addEventListener('click', function () { openExamPaperModal(null); });
    document.getElementById('btn-ep-save').addEventListener('click', saveExamPaper);
    bindSourceQuestion();
    // QP/MS 上传（编辑弹窗内）
    document.getElementById('btn-ep-qp').addEventListener('click', function () { document.getElementById('ep-qp-file').click(); });
    document.getElementById('btn-ep-ms').addEventListener('click', function () { document.getElementById('ep-ms-file').click(); });
    document.getElementById('ep-qp-file').addEventListener('change', function () {
      pendingPdfs.qp = this.files[0] || null;
      document.getElementById('ep-qp-name').textContent = pendingPdfs.qp ? pendingPdfs.qp.name + '（保存时上传）' : '';
    });
    document.getElementById('ep-ms-file').addEventListener('change', function () {
      pendingPdfs.ms = this.files[0] || null;
      document.getElementById('ep-ms-name').textContent = pendingPdfs.ms ? pendingPdfs.ms.name + '（保存时上传）' : '';
    });
  }

  function uploadTo(input, cb) {
    var file = input.files[0];
    input.value = '';
    if (!file) { return; }
    ZJ.toast('上传中…');
    Data.uploadFile(file).then(cb).catch(function (err) { ZJ.toast(err.message, true); });
  }

  function loadArchive() {
    var token=++archiveLoad;
    return Data.examPapers(archiveFilters).then(function (list) {
      if(token!==archiveLoad){return;}
      epCache = list;
      var names=[];list.forEach(function(p){if(names.indexOf(p.paperName)<0){names.push(p.paperName);}});
      document.getElementById('ar-paper-options').innerHTML=names.map(function(n){return '<option value="'+ZJ.esc(n)+'">';}).join('');
      var tbody = document.getElementById('ar-tbody');
      document.getElementById('ar-count').textContent = list.length ? '共 ' + list.length + ' 套' : '';
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="empty-tip">没有真题卷，点「新建真题卷」录入</div></td></tr>';
        return;
      }
      tbody.innerHTML = list.map(function (p) {
        var res = (p.resourceType === 'official_link' ? '链接型' : p.resourceType === 'owned_content' ? '自有内容' : '托管文件');
        return '<tr data-id="' + p.id + '">' +
          '<td><b style="font-family:var(--f-serif);color:var(--c-navy-2);">' + ZJ.esc(p.paperName) + '</b>' +
          '<div class="cell-sub">' + ZJ.esc(p.paperCode || '—') + ' · ' + ZJ.esc(p.examBoard) + '</div></td>' +
          '<td style="font-family:var(--f-num);">' + p.year + '</td>' +
          '<td>' + ZJ.esc(p.session || '—') + '</td>' +
          '<td style="font-family:var(--f-num);">' + p.questionCount + '</td>' +
          '<td>' + res + '</td>' +
          '<td><span class="tag ' + (p.status === 'published' ? 'tag-ok' : p.status === 'draft' ? 'tag-draft' : 'tag-off') + '">' +
          (p.status === 'published' ? '已发布' : p.status === 'draft' ? '草稿' : '已下架') + '</span></td>' +
          '<td><div class="row-actions">' +
          (p.qpAvailable ? '<button class="btn-mini primary" data-act="preview-qp" data-id="' + p.id + '">QP</button>' : '<span class="cell-sub">QP 未传</span>') +
          (p.msAvailable ? '<button class="btn-mini primary" data-act="preview-ms" data-id="' + p.id + '">MS</button>' : '<span class="cell-sub">MS 未传</span>') +
          (p.qpAvailable && Data.mode === 'server' ? '<button class="btn-mini gold" data-act="create-source" data-id="' + p.id + '">创建大题</button>' : '') +
          '<button class="btn-mini gold" data-act="edit" data-id="' + p.id + '">编辑</button>' +
          '<button class="btn-mini danger" data-act="del" data-id="' + p.id + '">删除</button>' +
          '</div></td></tr>';
      }).join('');
      return loadSourceDrafts(list, token);
    }).catch(function (err) { ZJ.toast(err.message, true); });
  }

  function loadSourceDrafts(papers, token) {
    var area = document.getElementById('ar-source-drafts');
    if (Data.mode !== 'server') {
      area.textContent = '静态演示模式不包含原卷 PDF 或结构化大题，请从正式后端打开后台。';
      return Promise.resolve();
    }
    return Promise.all(papers.filter(function (p) { return p.qpAvailable; }).map(function (p) {
      return Data.sourceQuestions(p.id);
    })).then(function (lists) {
      if(token!==archiveLoad){return;}
      var available = papers.filter(function (p) { return p.qpAvailable; });
      area.innerHTML = available.length ? available.map(function (p, index) {
        var drafts = lists[index];
        return '<details class="paper-group"><summary>' + ZJ.esc(p.paperName + ' · ' + (p.paperCode || '原卷 #' + p.id) + ' · ' + p.year + ' · ' + (p.session || '未填写考季')) + ' · ' + drafts.length + ' 道题</summary><div class="paper-group-content">' + (drafts.length ? drafts.map(function (q) {
        var qp = q.regions.filter(function (r) { return r.kind === 'qp'; }).length;
        var ms = q.regions.length - qp;
        return '<div style="padding:8px;border-bottom:1px solid #e4e8ed;">' +
          ZJ.esc(q.paperName) + ' · 原题 ' + ZJ.esc(q.originalQuestionNumber) + ' · ' +
          qp + ' 个 QP 区域 / ' + ms + ' 个 MS 区域 · <strong>标签与可用状态见题目管理</strong> ' +
          '<button class="btn-mini primary" data-act="open-source" data-id="' + q.id + '">重新打开预览 #' + q.id + '</button></div>';
      }).join('') : '<p class="empty-tip">该原卷尚未创建题目切片。</p>') + '</div></details>';
      }).join('') : '当前筛选范围内没有原卷。';
    });
  }

  function openExamPaperModal(id) {
    var p = null;
    epCache.forEach(function (x) { if (x.id === id) { p = x; } });
    document.getElementById('ep-title').textContent = p ? '编辑真题卷 #' + p.id : '新建真题卷';
    document.getElementById('ep-id').value = p ? p.id : '';
    document.getElementById('ep-board').value = p ? p.examBoard : archiveFilters.board;
    document.getElementById('ep-board').disabled = !!p;
    document.getElementById('ep-paper').value = p ? p.paperName : 'P1';
    document.getElementById('ep-code').value = p ? (p.paperCode || '') : '';
    document.getElementById('ep-year').value = p ? p.year : ZJ.todayStr().slice(0, 4);
    document.getElementById('ep-session').value = p ? (p.session || 'June') : 'June';
    document.getElementById('ep-qp-source').value = p ? (p.qpSource || '') : '';
    document.getElementById('ep-ms-source').value = p ? (p.msSource || '') : '';
    document.getElementById('ep-permission-note').value = p ? (p.permissionNote || '') : '';
    document.getElementById('ep-display-scope').value = p ? (p.displayScope || 'internal') : 'internal';
    document.getElementById('ep-status').value = p ? p.status : 'draft';
    pendingPdfs = { qp: null, ms: null };
    ['qp', 'ms'].forEach(function (kind) {
      document.getElementById('ep-' + kind + '-file').value = '';
      document.getElementById('ep-' + kind + '-name').textContent = p && p[kind + 'Available'] ? '已上传（可在列表预览）' : '尚未上传';
    });
    ZJ.openModal('modal-exampaper');
  }

  function saveExamPaper() {
    var id = document.getElementById('ep-id').value;
    var fields = {
      examBoard: document.getElementById('ep-board').value,
      paperName: document.getElementById('ep-paper').value.trim(),
      paperCode: document.getElementById('ep-code').value.trim(),
      year: Number(document.getElementById('ep-year').value),
      session: document.getElementById('ep-session').value,
      qpSource: document.getElementById('ep-qp-source').value.trim(),
      msSource: document.getElementById('ep-ms-source').value.trim(),
      permissionNote: document.getElementById('ep-permission-note').value.trim(),
      displayScope: document.getElementById('ep-display-scope').value,
      status: document.getElementById('ep-status').value
    };
    var req = id ? Data.updateExamPaper(Number(id), fields) : Data.createExamPaper(fields);
    req.then(function (paper) {
      return ['qp', 'ms'].reduce(function (chain, kind) {
        return chain.then(function () {
          return pendingPdfs[kind] ? Data.uploadExamPaperPdf(paper.id, kind, pendingPdfs[kind]) : null;
        });
      }, Promise.resolve());
    }).then(function () {
      ZJ.toast(id ? '真题卷已更新' : '真题卷已创建');
      ZJ.closeModal('modal-exampaper');
      loadArchive();
    }).catch(function (err) { ZJ.toast('元数据可能已保存；PDF 上传失败时请重新打开记录检查。' + err.message, true); loadArchive(); });
  }

  /* ================= Phase 1B · 从原卷人工建立完整大题 ================= */
  function clearSourceUrls() {
    sourceLoad++;
    sourceUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    sourceUrls = [];
  }

  function clearHistoryUrls() {
    historyUrls.forEach(function (url) { URL.revokeObjectURL(url); });
    historyUrls = [];
  }

  // 开始查看某历史修订：递增序号、记录当前目标，并释放上一版历史预览的 blob。
  function beginHistoryView(questionId, revision) {
    historyLoad++;
    historyView = { questionId: questionId, revision: revision, serial: historyLoad };
    clearHistoryUrls();
    return historyView;
  }

  // 只有仍指向当前查看目标（同一题同一修订）且序号最新的请求才允许更新 DOM。
  function historyViewCurrent(token) {
    return !!token && !!historyView && token.serial === historyLoad &&
      historyView.questionId === token.questionId && historyView.revision === token.revision;
  }

  // 关闭/切换/重新打开时失效：任何在途的旧 JSON/PNG 都不再更新 DOM。
  function endHistoryView() {
    historyLoad++;
    historyView = null;
    clearHistoryUrls();
  }

  function bindSourceQuestion() {
    var stage = document.getElementById('sq-stage');
    var kindControl = document.getElementById('sq-kind');
    kindControl.addEventListener('change', function () { displaySourcePage(); });
    document.getElementById('sq-prev').addEventListener('click', function () { changeSourcePage(-1); });
    document.getElementById('sq-next').addEventListener('click', function () { changeSourcePage(1); });
    document.getElementById('sq-page').addEventListener('change', function () {
      if (!sourceState) { return; }
      var kind = kindControl.value;
      sourceState.pages[kind] = Math.max(0, Math.min(sourceState.counts[kind] - 1, Number(this.value || 1) - 1));
      displaySourcePage();
    });
    document.getElementById('sq-add-full').addEventListener('click', function () { addSourceRegion([0, 0, 1, 1]); });
    document.getElementById('sq-add-region').addEventListener('click', function () {
      if (!sourceState || !sourceState.selection) { ZJ.toast('请先在原卷页面上拖选区域', true); return; }
      addSourceRegion(sourceState.selection);
    });
    stage.addEventListener('pointerdown', function (event) {
      if (!sourceState || !sourceState.counts[kindControl.value] || !document.getElementById('sq-image').naturalWidth) { return; }
      var pt = sourcePoint(event);
      sourceState.start = pt;
      sourceState.selection = null;
      stage.setPointerCapture(event.pointerId);
      drawSourceSelection([pt[0], pt[1], pt[0], pt[1]]);
    });
    stage.addEventListener('pointermove', function (event) {
      if (!sourceState || !sourceState.start) { return; }
      var pt = sourcePoint(event);
      var start = sourceState.start;
      drawSourceSelection([Math.min(start[0], pt[0]), Math.min(start[1], pt[1]),
                           Math.max(start[0], pt[0]), Math.max(start[1], pt[1])]);
    });
    stage.addEventListener('pointerup', function (event) {
      if (!sourceState || !sourceState.start) { return; }
      var pt = sourcePoint(event), start = sourceState.start;
      var box = [Math.min(start[0], pt[0]), Math.min(start[1], pt[1]),
                 Math.max(start[0], pt[0]), Math.max(start[1], pt[1])];
      sourceState.start = null;
      sourceState.selection = box[2] - box[0] >= .02 && box[3] - box[1] >= .02 ? box : null;
      drawSourceSelection(sourceState.selection);
    });
    document.getElementById('sq-regions').addEventListener('click', function (event) {
      var button = event.target.closest('button[data-action]');
      if (!button || !sourceState) { return; }
      var kind = button.dataset.kind, index = Number(button.dataset.index);
      var list = sourceState.regions[kind];
      if (button.dataset.action === 'remove') { list.splice(index, 1); }
      if (button.dataset.action === 'up' && index > 0) {
        var prev = list[index - 1]; list[index - 1] = list[index]; list[index] = prev;
      }
      if (button.dataset.action === 'down' && index < list.length - 1) {
        var next = list[index + 1]; list[index + 1] = list[index]; list[index] = next;
      }
      renderSourceRegions();
    });
    document.getElementById('sq-save').addEventListener('click', saveSourceQuestion);
    document.getElementById('modal-source-question').addEventListener('click', function (event) {
      if (event.target.closest('#sq-edit')) {
        if (savedQuestion) { openSourceQuestionEdit(savedQuestion); }
        return;
      }
      var revButton = event.target.closest('[data-history-rev]');
      if (revButton) { openSourceRevision(Number(revButton.dataset.historyRev)); return; }
      if (event.target.closest('#sq-history-close')) { closeSourceRevision(); return; }
      if (event.target.closest('[data-close="modal-source-question"]')) {
        clearSourceUrls(); sourceState = null;
        endHistoryView();
        document.getElementById('sq-history').hidden = true;
      }
    });
  }

  function sourcePoint(event) {
    var rect = document.getElementById('sq-image').getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
            Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))];
  }

  function drawSourceSelection(box) {
    var marker = document.getElementById('sq-selection');
    marker.hidden = !box;
    if (!box) { return; }
    var image = document.getElementById('sq-image'), stage = document.getElementById('sq-stage');
    marker.style.left = (image.offsetLeft - stage.clientLeft + box[0] * image.clientWidth) + 'px';
    marker.style.top = (image.offsetTop - stage.clientTop + box[1] * image.clientHeight) + 'px';
    marker.style.width = ((box[2] - box[0]) * image.clientWidth) + 'px';
    marker.style.height = ((box[3] - box[1]) * image.clientHeight) + 'px';
  }

  function changeSourcePage(delta) {
    if (!sourceState) { return; }
    var kind = document.getElementById('sq-kind').value;
    sourceState.pages[kind] = Math.max(0, Math.min(sourceState.counts[kind] - 1, sourceState.pages[kind] + delta));
    displaySourcePage();
  }

  function displaySourcePage() {
    if (!sourceState) { return; }
    var kind = document.getElementById('sq-kind').value;
    var count = sourceState.counts[kind], index = sourceState.pages[kind];
    var image = document.getElementById('sq-image');
    sourceState.selection = null;
    drawSourceSelection(null);
    document.getElementById('sq-page').value = count ? index + 1 : '';
    document.getElementById('sq-page').max = count;
    document.getElementById('sq-page-total').textContent = ' / ' + count + ' 页';
    document.getElementById('sq-add-full').disabled = !count;
    document.getElementById('sq-add-region').disabled = !count;
    image.removeAttribute('src');
    image.alt = count ? '加载私有原卷页…' : '此原卷没有可用 MS（可保留缺失状态）';
    if (!count) { return; }
    var serial = ++sourceLoad;
    Data.sourcePageImage(sourceState.paperId, kind, index, (sourceState.sourceFiles || {})[kind]).then(function (url) {
      if (serial !== sourceLoad || !sourceState) { URL.revokeObjectURL(url); return; }
      sourceUrls.push(url);
      image.src = url;
      image.alt = kind.toUpperCase() + ' · PDF 第 ' + (index + 1) + ' 页';
    }).catch(function (err) { ZJ.toast(err.message, true); });
  }

  function addSourceRegion(box) {
    if (!sourceState) { return; }
    var kind = document.getElementById('sq-kind').value;
    if (!sourceState.counts[kind] || sourceState.regions[kind].length >= 12) {
      ZJ.toast('该资源不可用或选区已达 12 个', true); return;
    }
    sourceState.regions[kind].push({ pageIndex: sourceState.pages[kind], box: box.slice() });
    sourceState.selection = null;
    drawSourceSelection(null);
    renderSourceRegions();
  }

  function renderSourceRegions() {
    if (!sourceState) { return; }
    var area = document.getElementById('sq-regions');
    area.innerHTML = ['qp', 'ms'].map(function (kind) {
      return '<h3 style="margin:12px 0 6px;">' + kind.toUpperCase() + ' · ' + sourceState.regions[kind].length + ' 个区域</h3>' +
        (sourceState.regions[kind].length ? sourceState.regions[kind].map(function (r, i) {
          return '<div style="padding:8px;border:1px solid #e5e8eb;margin:6px 0;border-radius:6px;">' +
            (i + 1) + '. PDF 第 ' + (r.pageIndex + 1) + ' 页' +
            '<div class="row-actions" style="margin:5px 0;">' +
            ['up', 'down', 'remove'].map(function (action) {
              return '<button class="btn-mini" data-action="' + action + '" data-kind="' + kind +
                '" data-index="' + i + '">' + ({ up: '上移', down: '下移', remove: '移除' })[action] + '</button>';
            }).join('') + '</div><img data-source-thumb="' + kind + ':' + i +
            '" alt="选定区域预览" style="max-width:100%;max-height:350px;display:block;"></div>';
        }).join('') : '<div class="f-hint">尚未添加' + kind.toUpperCase() + ' 区域' + (kind === 'ms' ? '；可保留缺失' : '') + '</div>');
    }).join('');
    ['qp', 'ms'].forEach(function (kind) {
      sourceState.regions[kind].forEach(function (r, i) {
        var target = area.querySelector('[data-source-thumb="' + kind + ':' + i + '"]');
        Data.sourcePageImage(sourceState.paperId, kind, r.pageIndex, (sourceState.sourceFiles || {})[kind]).then(function (url) {
          var source = new Image();
          source.onload = function () {
            if (target.isConnected) {
              var width = Math.max(1, Math.floor(source.naturalWidth * (r.box[2] - r.box[0])));
              var height = Math.max(1, Math.floor(source.naturalHeight * (r.box[3] - r.box[1])));
              var canvas = document.createElement('canvas');
              canvas.width = width; canvas.height = height;
              canvas.getContext('2d').drawImage(source, r.box[0] * source.naturalWidth,
                r.box[1] * source.naturalHeight, width, height, 0, 0, width, height);
              target.src = canvas.toDataURL('image/png');
            }
            URL.revokeObjectURL(url);
          };
          source.onerror = function () { URL.revokeObjectURL(url); };
          source.src = url;
        }).catch(function (err) { ZJ.toast(err.message, true); });
      });
    });
  }

  function openSourceQuestion(id) {
    var paper = epCache.filter(function (p) { return p.id === id; })[0];
    if (!paper || Data.mode !== 'server') { ZJ.toast('请从正式后台打开原卷', true); return; }
    clearSourceUrls();
    endHistoryView();
    savedQuestion = null;
    sourceState = { mode: 'create', paperId: id, questionId: null, counts: { qp: 0, ms: 0 }, pages: { qp: 0, ms: 0 },
      regions: { qp: [], ms: [] }, selection: null, start: null,
      sourceFiles: { qp: '', ms: '' }, expectedRevision: null };
    document.getElementById('sq-title').textContent = paper.paperName + ' · ' + paper.year + ' ' + paper.session + ' · 创建完整大题';
    document.getElementById('sq-number').value = '';
    document.getElementById('sq-number').disabled = false;
    document.getElementById('sq-kind').value = 'qp';
    document.getElementById('sq-confirm').checked = false;
    document.getElementById('sq-note').value = '';
    document.getElementById('sq-note-wrap').hidden = true;
    document.getElementById('sq-original').hidden = true;
    document.getElementById('sq-selector').hidden = false;
    document.getElementById('sq-saved').hidden = true;
    document.getElementById('sq-save').disabled = false;
    document.getElementById('sq-save').textContent = '保存私有草稿（不发布）';
    ZJ.openModal('modal-source-question');
    Promise.all([Data.sourcePages(id, 'qp'), paper.msAvailable ? Data.sourcePages(id, 'ms') : Promise.resolve({ pageCount: 0 })])
      .then(function (results) {
        if (!sourceState || sourceState.paperId !== id) { return; }
        sourceState.counts.qp = results[0].pageCount;
        sourceState.counts.ms = results[1].pageCount;
        sourceState.sourceFiles.qp = results[0].sourceFile || '';
        sourceState.sourceFiles.ms = results[1].sourceFile || '';
        displaySourcePage();
        renderSourceRegions();
      }).catch(function (err) { ZJ.toast(err.message, true); });
  }

  function saveSourceQuestion() {
    if (!sourceState) { return; }
    if (sourceState.blocked) { ZJ.toast(sourceState.blocked, true); return; }
    var editing = sourceState.mode === 'edit';
    var number = document.getElementById('sq-number').value.trim();
    var note = document.getElementById('sq-note').value.trim();
    if (!/^[1-9][0-9]{0,2}$/.test(number) || !sourceState.regions.qp.length || !document.getElementById('sq-confirm').checked) {
      ZJ.toast('请填写完整大题号、加入 QP 区域并确认 QP/MS 边界', true); return;
    }
    if (editing && !note) { ZJ.toast('修正选区请填写修改说明', true); return; }
    var button = document.getElementById('sq-save');
    button.disabled = true;
    var files = sourceState.sourceFiles || { qp: '', ms: '' };
    var request = editing
      ? Data.updateSourceRegions(sourceState.questionId, {
          qpRegions: sourceState.regions.qp, msRegions: sourceState.regions.ms,
          selectionAcknowledged: true, changeNote: note,
          expectedRevision: sourceState.expectedRevision,
          qpSourceFile: files.qp, msSourceFile: files.ms
        })
      : Data.createSourceQuestion(sourceState.paperId, {
          originalQuestionNumber: number, qpRegions: sourceState.regions.qp,
          msRegions: sourceState.regions.ms, selectionAcknowledged: true,
          qpSourceFile: files.qp, msSourceFile: files.ms
        });
    request.then(function (question) {
      ZJ.toast(editing ? '选区已修正，请教研重新确认' : '完整大题草稿已保存，待教研审核');
      loadArchive();
      showSavedSource(question);
    }).catch(function (err) {
      button.disabled = false;
      // 过期编辑 / 原卷文件已更换：服务端返回 409，本地选区未提交，引导重新打开并重新预览。
      if (err && err.status === 409 && editing) {
        ZJ.toast('保存被拒绝：' + err.message, true);
      } else {
        ZJ.toast(err.message, true);
      }
    });
  }

  function sourceBindingMismatch(question, currentFiles) {
    // 已保存草稿的活动选区所绑定的原件，若与当前预览到的原卷文件版本不一致，返回不一致的 kind 列表。
    // 用于阻止把旧坐标自动套用到已被替换的新原件上（历史预览仍固定各自快照原件，不回退）。
    var files = currentFiles || {};
    return ['qp', 'ms'].filter(function (kind) {
      var bound = (question.regions || []).filter(function (r) { return r.kind === kind && r.sourceFile; })
        .map(function (r) { return r.sourceFile; });
      return bound.some(function (name) { return name !== files[kind]; });
    });
  }

  function beginEditState(question) {
    // 打开编辑时锁定"当前修订号"与"所预览的原卷文件版本"，保存时回传以拒绝过期编辑/已更换文件。
    sourceState = { mode: 'edit', paperId: question.examPaperId, questionId: question.id,
      counts: { qp: 0, ms: 0 }, pages: { qp: 0, ms: 0 },
      regions: { qp: [], ms: [] }, selection: null, start: null,
      sourceFiles: { qp: '', ms: '' }, expectedRevision: question.regionRevision || 0 };
    (question.regions || []).forEach(function (r) {
      if (sourceState.regions[r.kind]) {
        sourceState.regions[r.kind].push({ pageIndex: r.pageIndex, box: r.box.slice() });
      }
    });
    return sourceState;
  }

  function openSourceQuestionEdit(question) {
    if (!question || Data.mode !== 'server') { return; }
    clearSourceUrls();
    endHistoryView();
    beginEditState(question);
    document.getElementById('sq-title').textContent = question.paperName + ' · 原题 ' + question.originalQuestionNumber +
      ' · 修正选区（草稿 #' + question.id + '，当前修订 ' + (question.regionRevision || 0) + '）';
    document.getElementById('sq-number').value = question.originalQuestionNumber;
    document.getElementById('sq-number').disabled = true;
    document.getElementById('sq-kind').value = 'qp';
    document.getElementById('sq-confirm').checked = false;
    document.getElementById('sq-note').value = '';
    document.getElementById('sq-note-wrap').hidden = false;
    document.getElementById('sq-original').hidden = false;
    document.getElementById('sq-selector').hidden = false;
    document.getElementById('sq-saved').hidden = true;
    document.getElementById('sq-save').disabled = false;
    document.getElementById('sq-save').textContent = '保存修正（仍为私有草稿）';
    ZJ.openModal('modal-source-question');
    renderOriginalRegions(question);
    Promise.all([Data.sourcePages(question.examPaperId, 'qp'), Data.sourcePages(question.examPaperId, 'ms')
      .catch(function () { return { pageCount: 0 }; })])
      .then(function (results) {
        if (!sourceState || sourceState.questionId !== question.id) { return; }
        sourceState.counts.qp = results[0].pageCount;
        sourceState.counts.ms = results[1].pageCount;
        sourceState.sourceFiles.qp = results[0].sourceFile || '';
        sourceState.sourceFiles.ms = results[1].sourceFile || '';
        displaySourcePage();
        renderSourceRegions();
        // 原卷文件在保存前被替换：草稿旧坐标不得套到新文件上，明确阻断并要求重新选择。
        var mismatched = sourceBindingMismatch(question, sourceState.sourceFiles);
        if (mismatched.length) {
          sourceState.blocked = '该草稿的选区绑定的是已被替换的原卷 ' +
            mismatched.map(function (k) { return k.toUpperCase(); }).join('/') +
            ' 文件，不能直接把旧坐标套用到新文件；请重新打开原卷重新选择区域。';
          document.getElementById('sq-save').disabled = true;
          document.getElementById('sq-title').textContent += ' · 原卷文件已更换，需重新选择';
          ZJ.toast(sourceState.blocked, true);
        }
      }).catch(function (err) { ZJ.toast(err.message, true); });
  }

  function renderOriginalRegions(question) {
    var area = document.getElementById('sq-original-list');
    area.innerHTML = ['qp', 'ms'].map(function (kind) {
      var list = question.regions.filter(function (r) { return r.kind === kind; })
        .sort(function (a, b) { return a.sortOrder - b.sortOrder; });
      return '<div style="font-size:12px;margin:6px 0 2px;">' + kind.toUpperCase() + ' · ' + list.length + ' 个区域</div>' +
        (list.length ? list.map(function (r, i) {
          return '<div style="display:inline-block;margin:4px 8px 4px 0;font-size:12px;">' + (i + 1) + '. 第 ' + (r.pageIndex + 1) + ' 页' +
            '<img data-original-id="' + r.id + '" alt="原选区 ' + kind.toUpperCase() + ' 第 ' + (i + 1) + ' 块" ' +
            'style="display:block;max-width:220px;max-height:170px;border:1px solid #e0d4c4;margin-top:3px;"></div>';
        }).join('') : '<div class="f-hint">无 ' + kind.toUpperCase() + ' 区域</div>');
    }).join('');
    question.regions.forEach(function (r) {
      Data.sourceRegionImage(question.id, r.id).then(function (url) {
        var img = area.querySelector('[data-original-id="' + r.id + '"]');
        if (!img || !img.isConnected) { URL.revokeObjectURL(url); return; }
        sourceUrls.push(url);
        img.src = url;
      }).catch(function () { /* 原选区缩略图失败不阻塞修正 */ });
    });
  }

  function openSavedSource(id) {
    Data.sourceQuestion(id).then(showSavedSource).catch(function (err) { ZJ.toast(err.message, true); });
  }

  function showSavedSource(question) {
    clearSourceUrls();
    endHistoryView();
    sourceState = null;
    savedQuestion = question;
    document.getElementById('sq-title').textContent = question.paperName + ' · 原题 ' + question.originalQuestionNumber +
      ' · 草稿 #' + question.id + '（修订 ' + (question.regionRevision || 0) + '）';
    document.getElementById('sq-number').disabled = false;
    document.getElementById('sq-save').textContent = '保存私有草稿（不发布）';
    document.getElementById('sq-selector').hidden = true;
    document.getElementById('sq-history').hidden = true;
    var area = document.getElementById('sq-saved');
    area.hidden = false;
    var revisions = question.regionRevisions || [];
    var latest = revisions.length ? revisions[revisions.length - 1] : null;
    var previous = question.previousRegions;
    var header = '<p>以下按保存顺序预览 QP 和 MS。这里检查裁剪与修订记录；标签及是否可用于组卷，请在「题目管理」中查看。</p>' +
      '<div class="row-actions" style="margin:8px 0 14px;">' +
      '<button class="btn btn-primary" id="sq-edit">编辑选区并重新预览</button>' +
      '<span class="f-hint">修正后仍为私有草稿，需教研重新确认。</span></div>' +
      (latest && latest.note ? '<p class="f-hint">最近一次修改说明（修订 ' + latest.revision + '，' + ZJ.esc(latest.changedBy || '') + '）：' + ZJ.esc(latest.note) + '</p>' : '');
    if (previous) {
      header += '<p class="f-hint">刚刚由修订 ' + (question.previousRevision || 0) + ' 修正为修订 ' +
        (question.regionRevision || 0) + '：上一次 QP ' +
        previous.filter(function (r) { return r.kind === 'qp'; }).length + ' 个区域 / MS ' +
        previous.filter(function (r) { return r.kind === 'ms'; }).length + ' 个区域。</p>';
    }
    if (revisions.length) {
      header += '<div style="margin:14px 0;padding:10px;border:1px solid #e4e8ed;border-radius:6px;">' +
        '<strong style="font-size:13px;">历史修订（只读）</strong>' +
        '<div style="margin-top:6px;">' + revisions.map(function (rev) {
          return '<div style="display:flex;align-items:center;gap:10px;padding:4px 0;border-top:1px solid #f0f2f5;">' +
            '<span style="font-size:12px;">修订 ' + rev.revision + ' · QP ' + rev.qpCount + ' / MS ' + rev.msCount +
            ' · ' + ZJ.esc(rev.changedBy || '') + ' · ' + ZJ.esc(rev.createdAt || '') +
            (rev.note ? ' · ' + ZJ.esc(rev.note) : '') + '</span>' +
            '<button class="btn btn-ghost" data-history-rev="' + rev.revision + '" style="margin-left:auto;">查看该修订</button></div>';
        }).join('') + '</div>' +
        '<p class="f-hint" style="margin-top:6px;">历史只读：查看历史修订不会修改当前选区或修订号。</p></div>';
    }
    area.innerHTML = header +
      ['qp', 'ms'].map(function (kind) {
        var list = question.regions.filter(function (r) { return r.kind === kind; })
          .sort(function (a, b) { return a.sortOrder - b.sortOrder; });
        return '<h3>' + kind.toUpperCase() + ' · ' + list.length + ' 个区域</h3>' +
          (list.length ? list.map(function (r, i) {
            return '<div style="padding:10px;margin:8px 0;border:1px solid #e4e8ed;border-radius:6px;">' +
              (i + 1) + '. PDF 第 ' + (r.pageIndex + 1) + ' 页' +
              '<img data-saved-id="' + r.id + '" alt="已保存的' + kind.toUpperCase() + '区域" style="display:block;max-width:100%;max-height:600px;margin-top:8px;"></div>';
          }).join('') : '<p>无 MS 区域：评分方案暂缺，需教研核对。</p>');
      }).join('');
    ZJ.openModal('modal-source-question');
    question.regions.forEach(function (r) {
      Data.sourceRegionImage(question.id, r.id).then(function (url) {
        var img = area.querySelector('[data-saved-id="' + r.id + '"]');
        if (!img || !img.isConnected) { URL.revokeObjectURL(url); return; }
        sourceUrls.push(url);
        img.src = url;
      }).catch(function (err) { ZJ.toast(err.message, true); });
    });
  }

  function openSourceRevision(revision) {
    if (!savedQuestion) { return; }
    var qid = savedQuestion.id;
    var token = beginHistoryView(qid, revision);
    var area = document.getElementById('sq-history');
    Data.sourceQuestionRevision(qid, revision).then(function (revisionData) {
      if (!historyViewCurrent(token)) { return; }  // 过时 JSON：不得覆盖 DOM 或重新显示历史
      var regions = revisionData.regions || [];
      area.innerHTML = '<div class="row-actions" style="margin:0 0 12px;">' +
        '<button class="btn btn-primary" id="sq-history-close">返回当前</button>' +
        '<span class="f-hint">历史修订 ' + revisionData.revision + '（只读）；当前修订 ' + revisionData.currentRevision + '。查看历史不会修改当前选区。</span></div>' +
        '<p class="f-hint">操作者：' + ZJ.esc(revisionData.changedBy || '') + ' · 时间：' + ZJ.esc(revisionData.createdAt || '') +
        (revisionData.note ? ' · 说明：' + ZJ.esc(revisionData.note) : '') + '</p>' +
        ['qp', 'ms'].map(function (kind) {
          var list = regions.filter(function (r) { return r.kind === kind; })
            .sort(function (a, b) { return a.sortOrder - b.sortOrder; });
          return '<h3>' + kind.toUpperCase() + ' · ' + list.length + ' 个区域</h3>' +
            (list.length ? list.map(function (r, i) {
              return '<div style="padding:10px;margin:8px 0;border:1px solid #e4e8ed;border-radius:6px;">' +
                (i + 1) + '. PDF 第 ' + (r.pageIndex + 1) + ' 页' +
                '<img data-history-img="' + kind + '-' + r.sortOrder + '" alt="修订 ' + revisionData.revision + ' 的' + kind.toUpperCase() + '区域" style="display:block;max-width:100%;max-height:600px;margin-top:8px;"></div>';
            }).join('') : '<p>无 ' + kind.toUpperCase() + ' 区域。</p>');
        }).join('');
      document.getElementById('sq-saved').hidden = true;
      area.hidden = false;
      regions.forEach(function (r) {
        Data.sourceRevisionRegionImage(qid, revisionData.revision, r.kind, r.sortOrder).then(function (url) {
          if (!historyViewCurrent(token)) { URL.revokeObjectURL(url); return; }  // 过时 PNG：立即释放，不覆盖新版本图片
          var img = area.querySelector('[data-history-img="' + r.kind + '-' + r.sortOrder + '"]');
          if (!img || !img.isConnected) { URL.revokeObjectURL(url); return; }
          historyUrls.push(url);
          img.src = url;
        }).catch(function (err) { if (historyViewCurrent(token)) { ZJ.toast(err.message, true); } });
      });
    }).catch(function (err) { if (historyViewCurrent(token)) { ZJ.toast(err.message, true); } });
  }

  function closeSourceRevision() {
    endHistoryView();
    var area = document.getElementById('sq-history');
    area.hidden = true;
    area.innerHTML = '';
    if (savedQuestion) { showSavedSource(savedQuestion); }
    else { document.getElementById('sq-saved').hidden = false; }
  }

  /* ================= 知识点刷题 ================= */

  function bindPractice() {
    document.getElementById('pt-paper').addEventListener('change', function () {
      paperFilter = this.value;
      currentTopicId = 0;
      loadTopics();
    });
    document.querySelectorAll('#tab-practice .topic-pill').forEach(function () { /* 动态绑定在渲染时 */ });
    document.getElementById('practice-list').addEventListener('click', function (e) {
      var fav = e.target.closest('button[data-act="fav"]');
      if (fav) {
        var qid = Number(fav.dataset.qid);
        var isFav = fav.dataset.fav === '1';
        var req = isFav ? Data.removeFavorite(qid) : Data.addFavorite(qid);
        req.then(function () {
          fav.dataset.fav = isFav ? '0' : '1';
          fav.classList.toggle('on', !isFav);
          fav.textContent = isFav ? '♡' : '♥';
        }).catch(function (err) { ZJ.toast(err.message, true); });
        return;
      }
      var add = e.target.closest('button[data-act="add"]');
      if (add) {
        var q = null;
        (practiceCache || []).forEach(function (x) { if (x.id === Number(add.dataset.qid)) { q = x; } });
        if (q && window.ZJ_Builder) {
          window.ZJ_Builder.addQuestion(q);
          ZJ.toast('已加入组卷台试卷');
        }
        return;
      }
      var card = e.target.closest('.pq-card');
      if (card) { openQuestionDetail(Number(card.dataset.qid)); }
    });
    ['pf-year', 'pf-session', 'pf-diff'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', loadPractice);
    });
    document.getElementById('pf-search').addEventListener('input', ZJ.debounce(function (e) {
      practiceFilters.q = e.target.value.trim();
      loadPractice();
    }, 300));
    document.getElementById('pf-dl').addEventListener('click', function () {
      var pane = document.getElementById('dl-pane');
      pane.hidden = !pane.hidden;
      document.getElementById('practice-fav-pane').hidden = true;
      if (!pane.hidden) { loadDownloads(); }
    });
    document.getElementById('pf-fav').addEventListener('click', function () {
      document.getElementById('practice-fav-pane').hidden = !document.getElementById('practice-fav-pane').hidden;
      if (!document.getElementById('practice-fav-pane').hidden) { loadFavorites(); }
    });
  }

  function loadTopics() {
    return Data.examTopics(paperFilter).then(function (t) {
      var box = document.getElementById('topic-pills');
      var html = '<span class="chip on" data-tid="0">全部</span>';
      t.topics.forEach(function (tp) {
        html += '<span class="chip topic-pill" data-tid="' + tp.id + '">' + ZJ.esc(tp.name) +
          ' <i style="font-style:normal;opacity:.65;">' + tp.count + '</i></span>';
      });
      box.innerHTML = html;
      box.addEventListener('click', topicPillClick);
      loadPractice();
    }).catch(function (err) { ZJ.toast(err.message, true); });
  }

  function topicPillClick(e) {
    var chip = e.target.closest('.chip[data-tid]');
    if (!chip) { return; }
    currentTopicId = Number(chip.dataset.tid);
    document.querySelectorAll('#topic-pills .chip').forEach(function (c) { c.classList.toggle('on', c === chip); });
    loadPractice();
  }

  var practiceCache = [];

  function loadPractice() {
    practiceFilters.year = document.getElementById('pf-year').value;
    practiceFilters.session = document.getElementById('pf-session').value;
    practiceFilters.difficulty = document.getElementById('pf-diff').value;
    var searching = !!(practiceFilters.q && practiceFilters.q.length);
    var filters = {
      page: 1, page_size: 50,
      q: practiceFilters.q || '',
      // 有关键词时放宽到全库（卡片上标注 真题/练习）；否则仅真题
      only_exam: searching ? '' : '1',
      exam_paper: searching ? '' : paperFilter,
      topic_id: searching ? '' : (currentTopicId || ''),
      year: practiceFilters.year,
      session: practiceFilters.session,
      difficulty: practiceFilters.difficulty
    };
    return Data.questions(filters).then(function (list) {
      practiceCache = list;
      var box = document.getElementById('practice-list');
      document.getElementById('practice-count').textContent = list.length ? '共 ' + list.length + ' 题' : '';
      if (!list.length) {
        box.innerHTML = '<div class="empty-tip" style="padding:30px 0;">该知识点下暂无已发布真题，换一个 Topic 或筛选条件</div>';
        return;
      }
      box.innerHTML = list.map(function (q) {
        var stem = q.stem.length > 72 ? q.stem.slice(0, 72) + '…' : q.stem;
        return '<div class="pq-card" data-qid="' + q.id + '">' +
          '<div class="pq-main">' +
          '<div class="pq-stem">' + (q.audioPath ? '🔊 ' : '') + (q.imagePath ? '🖼 ' : '') + ZJ.esc(stem) + '</div>' +
          '<div class="pq-meta">' +
          '<span class="tag tag-type">' + ZJ.esc(q.qtype) + '</span>' +
          '<span class="tag ' + ZJ.diffClass(q.difficulty) + '">难度 ' + q.difficulty + '</span>' +
          '<span class="tag tag-subject">' + (q.marks || q.score || '—') + ' 分</span>' +
          '<span class="tag tag-off">' + (q.questionNumber ? 'Q' + ZJ.esc(q.questionNumber) + (q.subQuestion ? '(' + ZJ.esc(q.subQuestion) + ')' : '') : '—') + '</span>' +
          '<span>' + (q.examPaperId ? '真题' : '练习') + '</span>' +
          '</div></div>' +
          '<div class="pq-tools">' +
          '<button class="btn-mini star-btn' + (q.favorite ? ' on' : '') + '" data-act="fav" data-qid="' + q.id + '" data-fav="' + (q.favorite ? '1' : '0') + '">' + (q.favorite ? '♥' : '♡') + '</button>' +
          '<button class="btn-mini primary" data-act="add" data-qid="' + q.id + '" title="加入组卷台试卷">+ 试卷</button>' +
          '</div></div>';
      }).join('');
      ZJ.renderMath(box);
    }).catch(function (err) { ZJ.toast(err.message, true); });
  }

  /* ================= 下载记录 ================= */

  function loadDownloads() {
    return Data.generatedFiles().then(function (r) {
      var box = document.getElementById('dl-list');
      var files = r.files || [];
      if (!files.length) {
        box.innerHTML = '<div class="empty-tip" style="padding:24px 0;">暂无生成记录：在组卷台点「保存并打印」后此处出现 QP/MS 记录</div>';
        return;
      }
      box.innerHTML = files.map(function (f) {
        return '<div class="pq-card"><div class="pq-main">' +
          '<div class="pq-stem">' + ZJ.esc(f.paperName || ('试卷 #' + f.user_paper_id)) + '</div>' +
          '<div class="pq-meta"><span class="tag ' + (f.kind === 'ms' ? 'tag-d3' : 'tag-d1') + '">' +
          (f.kind === 'ms' ? 'Mark Scheme' : 'Question Paper') + '</span>' +
          '<span class="tag tag-ok">' + f.status + '</span>' +
          '<span>' + ZJ.fmtDateTime(f.created_at) + '</span></div></div>' +
          '<a class="btn-mini primary" href="print.html?id=' + f.user_paper_id + '&ver=' + (f.kind === 'ms' ? 'teacher' : 'student') + '" target="_blank">重新打开</a>' +
          '</div>';
      }).join('');
    }).catch(function (err) { ZJ.toast(err.message, true); });
  }

  /* ================= 题目详情（含 MS 展开） ================= */

  function openQuestionDetail(qid) {
    var q = null;
    practiceCache.forEach(function (x) { if (x.id === qid) { q = x; } });
    if (!q) { return; }
    var modal = document.getElementById('modal-qd');
    var tags =
      '<span class="tag tag-subject">' + ZJ.esc(q.subject) + '</span>' +
      '<span class="tag tag-type">' + ZJ.esc(q.qtype) + '</span>' +
      '<span class="tag ' + ZJ.diffClass(q.difficulty) + '">难度 ' + q.difficulty + '</span>' +
      '<span class="tag tag-draft">' + (q.score || '—') + ' 分</span>';
    var html =
      '<div class="qc-head"><div class="qc-tags">' + tags + '</div></div>' +
      '<div class="qc-stem" style="margin-top:6px;">' + ZJ.esc(q.stem) + '</div>' +
      ZJ.questionAudioHtml(q) + ZJ.questionImageHtml(q);
    if ((q.qtype === '单选题' || q.qtype === '多选题') && q.options && q.options.length) {
      html += '<ul class="qc-options">';
      q.options.forEach(function (opt, i) {
        html += '<li data-letter="' + String.fromCharCode(65 + i) + '">' + ZJ.esc(String(opt).replace(/^[A-Za-z][.、．]\s*/, '')) + '</li>';
      });
      html += '</ul>';
    }
    document.getElementById('qd-body').innerHTML = html;
    // MS（答案）展开区
    var ms = '';
    if (q.answerImageUrl) {
      ms = '<img src="/' + ZJ.esc(q.answerImageUrl) + '" style="max-width:100%;border:1px solid var(--c-border);border-radius:6px;">';
    } else {
      ms = (q.answer ? '<div class="qc-answer"><b>答案：</b>' + ZJ.esc(q.answer) + '</div>' : '') +
        (q.explanation ? '<div class="qc-explain"><b>解析：</b>' + ZJ.esc(q.explanation) + '</div>' : '<div class="f-hint">本题暂无 Mark Scheme</div>');
    }
    document.getElementById('qd-ms').innerHTML = ms;
    document.getElementById('qd-ms').hidden = true;
    var favBtn = document.getElementById('qd-fav');
    favBtn.dataset.qid = q.id;
    favBtn.dataset.fav = q.favorite ? '1' : '0';
    favBtn.textContent = (q.favorite ? '♥ 已收藏' : '♡ 收藏');
    favBtn.classList.toggle('on', !!q.favorite);
    var addBtn = document.getElementById('qd-add');
    addBtn.dataset.qid = q.id;
    ZJ.openModal('modal-qd');
    ZJ.renderMath(modal);
  }

  function bindDetail() {
    document.getElementById('qd-toggle-ms').addEventListener('click', function () {
      var ms = document.getElementById('qd-ms');
      ms.hidden = !ms.hidden;
      this.textContent = ms.hidden ? '查看 Mark Scheme' : '收起 Mark Scheme';
    });
    document.getElementById('qd-fav').addEventListener('click', function () {
      var qid = Number(this.dataset.qid);
      var isFav = this.dataset.fav === '1';
      var req = isFav ? Data.removeFavorite(qid) : Data.addFavorite(qid);
      var btn = this;
      req.then(function () {
        btn.dataset.fav = isFav ? '0' : '1';
        btn.textContent = isFav ? '♡ 收藏' : '♥ 已收藏';
        btn.classList.toggle('on', !isFav);
        loadPractice();
      }).catch(function (err) { ZJ.toast(err.message, true); });
    });
    document.getElementById('qd-add').addEventListener('click', function () {
      var qid = Number(this.dataset.qid);
      var q = null;
      practiceCache.forEach(function (x) { if (x.id === qid) { q = x; } });
      if (q && window.ZJ_Builder) {
        window.ZJ_Builder.addQuestion(q);
        ZJ.closeModal('modal-qd');
        ZJ.toast('已加入组卷台试卷');
      }
    });
  }

  /* ================= 我的收藏 ================= */

  function loadFavorites() {
    return Data.favorites().then(function (list) {
      var box = document.getElementById('fav-list');
      if (!list.length) {
        box.innerHTML = '<div class="empty-tip" style="padding:24px 0;">还没有收藏题目：在题目卡片点 ♡ 收藏</div>';
        return;
      }
      box.innerHTML = list.map(function (q) {
        var stem = q.stem.length > 60 ? q.stem.slice(0, 60) + '…' : q.stem;
        return '<div class="pq-card" data-qid="' + q.id + '">' +
          '<div class="pq-main"><div class="pq-stem">' + ZJ.esc(stem) + '</div>' +
          '<div class="pq-meta">' + ZJ.esc(q.subject) + ' · ' + ZJ.esc(q.qtype) + ' · 难度 ' + q.difficulty + '</div></div>' +
          '<div class="pq-tools"><button class="btn-mini danger" data-act="unfav" data-qid="' + q.id + '">取消收藏</button></div></div>';
      }).join('');
      box.onclick = function (e) {
        var btn = e.target.closest('button[data-act="unfav"]');
        if (!btn) { return; }
        Data.removeFavorite(Number(btn.dataset.qid)).then(function () { loadFavorites(); })
          .catch(function (err) { ZJ.toast(err.message, true); });
      };
    }).catch(function (err) { ZJ.toast(err.message, true); });
  }

  window.ZJ_Archive = {
    init: function (ctx) {
      init(ctx);
      bindDetail();
    },
    refresh: function () { refresh(); },
    setBoard: function (board) { archiveFilters.board=board; archiveFilters.paper=''; document.getElementById('ar-paper').value=''; loadArchive(); },
    openQuestion: openSavedSource,
    // 仅供自动化测试（tests/history-race.cjs）：注入依赖并驱动历史预览的竞态保护。
    _historyForTest: {
      use: function (ctx) { ZJ = ctx.ZJ; Data = ctx.Data; },
      setQuestion: function (question) { savedQuestion = question; },
      open: function (revision) { openSourceRevision(revision); },
      close: function () { closeSourceRevision(); },
      state: function () { return { serial: historyLoad, view: historyView }; }
    },
    // 仅供自动化测试（tests/stale-edit-guard.cjs）：驱动"编辑保存"是否回传 expectedRevision 与来源文件版本。
    _editForTest: {
      use: function (ctx) { ZJ = ctx.ZJ; Data = ctx.Data; },
      beginEdit: function (question) { return beginEditState(question); },
      setSourceFiles: function (files) { if (sourceState) { sourceState.sourceFiles = files; } },
      bindingMismatch: function (question, files) { return sourceBindingMismatch(question, files); },
      block: function (reason) { if (sourceState) { sourceState.blocked = reason; } },
      previewPage: function () { displaySourcePage(); },
      save: function () { saveSourceQuestion(); },
      state: function () { return sourceState; }
    }
  };
})();
