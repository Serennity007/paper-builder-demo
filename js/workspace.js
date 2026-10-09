(function () {
  'use strict';
  var Data, ZJ, ready=false, board='Edexcel', catalogs=[], sources=[], cards=[], candidates=[];
  var edit=null, serial=0, urls=[], paper={id:null,revision:0,items:[],filters:null}, dirty=true;
  function el(id){return document.getElementById(id);}
  function esc(s){return ZJ.esc(String(s == null ? '' : s));}
  function req(method,path,body){return Data.workspaceRequest(method,'/api/workspace/'+path,body);}
  function fail(err){ZJ.toast(err.message || String(err),true);}
  function revoke(){urls.forEach(function(u){URL.revokeObjectURL(u);});urls=[];}
  function label(c){return c.board+' · '+c.paper+' · '+c.year+' '+c.session+' · 原题 '+c.originalQuestionNumber;}
  function options(items,empty){return '<option value="">'+esc(empty)+'</option>'+items.map(function(x){return '<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>';}).join('');}
  function topicsFor(c){var list=[];catalogs.forEach(function(cat){if(cat.paper===c.paper){cat.topics.forEach(function(t){list.push({id:t.id,name:t.chapter+' / '+t.name,title:cat.title+' · '+cat.edition});});}});return list;}
  function filters(prefix){return {board:board,paper:el(prefix+'-paper').value,topicId:el(prefix+'-topic').value,
    difficulty:prefix==='wg'?el('wg-difficulty').value:'',year:prefix==='wg'?el('wg-year').value:'',
    maxMinutes:prefix==='wg'?el('wg-max-minutes').value:'',
    examPaperId:prefix==='wc'&&el('wc-view').value==='source'?el('wc-source').value:'',state:prefix==='wc'?el('wc-state').value:''};}
  function fillCatalog(prefix){
    var select=el(prefix+'-catalog'),keep=select.value;
    var cats=catalogs.filter(function(c){return c.paper===el(prefix+'-paper').value;});
    select.innerHTML=options(cats.map(function(c){return {id:c.id,name:c.title+' · '+c.edition};}),'选择教材版本');
    if(cats.some(function(c){return String(c.id)===keep;})){select.value=keep;}else if(cats.length){select.value=cats[0].id;}
    fillTopics(prefix);
  }
  function fillTopics(prefix){
    var keep=el(prefix+'-topic').value,cat=catalogs.find(function(c){return String(c.id)===el(prefix+'-catalog').value;});
    el(prefix+'-topic').innerHTML=options(cat?cat.topics.map(function(t){return {id:t.id,name:t.chapter+' / '+t.name};}):[],'全部知识点');
    if(cat&&cat.topics.some(function(t){return String(t.id)===keep;})){el(prefix+'-topic').value=keep;}
    if(prefix==='wc'){el('wc-directory-note').textContent=cat?'目录来源：'+cat.source+'；版本：'+cat.edition:'当前考试局和卷型尚未录入经核对的官方教材目录。可按原卷查看题卡，并在「教材目录」中录入实际目录。';}
  }
  function fillPapers(prefix){
    var keep=el(prefix+'-paper').value,names=[];
    sources.forEach(function(p){if(names.indexOf(p.paperName)<0){names.push(p.paperName);}});
    catalogs.forEach(function(c){if(names.indexOf(c.paper)<0){names.push(c.paper);}});
    el(prefix+'-paper').innerHTML=options(names.map(function(n){return {id:n,name:n};}),'选择卷型');
    if(names.indexOf(keep)>=0){el(prefix+'-paper').value=keep;}else if(names.length){el(prefix+'-paper').value=names[0];}
    fillCatalog(prefix);
  }
  function refresh(name){
    if(!ready){return;}
    var token=++serial;revoke();
    return Promise.all([req('GET','catalogs?board='+encodeURIComponent(board)),Data.examPapers({board:board})]).then(function(result){
      if(token!==serial){return;}
      catalogs=result[0].catalogs;sources=result[1];
      fillPapers('wc');fillPapers('wg');
      el('wc-source').innerHTML=options(sources.map(function(p){return {id:p.id,name:p.paperName+' · '+p.year+' '+p.session};}),'全部原卷');
      if(name==='cards'){return loadCards();}
      if(name==='compose'){renderPaper();return loadCandidates();}
    }).catch(fail);
  }
  var cardRequest=0,poolRequest=0;
  function query(f){return Object.keys(f).filter(function(k){return f[k]!=='';}).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(f[k]);}).join('&');}
  function loadCards(){
    var token=++cardRequest;
    var f=filters('wc');if(el('wc-view').value==='source'){f.topicId='';}
    el('wc-list').textContent='正在读取裁剪题卡…';
    return req('GET','cards?'+query(f)).then(function(d){if(token!==cardRequest){return;}cards=d.cards;renderCards('wc-list',cards,false);}).catch(function(err){if(token===cardRequest){el('wc-list').textContent=err.message;}fail(err);});
  }
  function loadCandidates(){
    var token=++poolRequest,f=filters('wg');
    el('wg-list').textContent='正在读取可用题卡…';
    if(!f.paper){candidates=[];el('wg-list').textContent='当前考试局暂无原卷或教材目录。';return Promise.resolve();}
    return req('GET','cards?'+query(f)+'&usable=1').then(function(d){if(token!==poolRequest){return;}candidates=d.cards;renderCards('wg-list',candidates,true);}).catch(function(err){if(token===poolRequest){el('wg-list').textContent=err.message;}fail(err);});
  }
  function imageMarkup(c,kind){
    var regions=c.regions.filter(function(r){return r.kind===kind;}).sort(function(a,b){return a.sortOrder-b.sortOrder;});
    return regions.length?regions.map(function(r){return '<div><img class="region-image" loading="lazy" alt="'+esc(kind.toUpperCase()+' 第'+(r.sortOrder+1)+'块，原卷PDF第'+(r.pageIndex+1)+'页')+'" data-card="'+c.id+'" data-region="'+r.id+'"><span class="f-hint">PDF 第 '+(r.pageIndex+1)+' 页</span></div>';}).join(''):'<p class="f-hint">MS 暂缺</p>';
  }
  function hydrate(root){
    root.querySelectorAll('img[data-region]').forEach(function(img){
      var cardId=img.dataset.card,regionId=img.dataset.region;
      Data.workspaceImage('/api/workspace/cards/'+cardId+'/regions/'+regionId+'.png').then(function(url){
        if(!img.isConnected){URL.revokeObjectURL(url);return;}urls.push(url);img.src=url;
      }).catch(function(err){if(img.isConnected){var msg=document.createElement('p');msg.className='error';msg.textContent=err.message;img.replaceWith(msg);}});
    });
  }
  function renderCards(id,list,compose){
    var root=el(id);
    root.querySelectorAll('img[src]').forEach(function(img){var u=img.src;if(u.indexOf('blob:')===0){URL.revokeObjectURL(u);urls=urls.filter(function(x){return x!==u;});}});
    function cardMarkup(c){
      var selected=paper.items.some(function(x){return x.id===c.id;});
      return '<article class="question-card" data-id="'+c.id+'"><header><strong>'+esc(label(c))+'</strong><span class="tag '+(c.available?'tag-ok':'tag-draft')+'">'+(c.available?'可用于组卷':'待确认')+'</span></header>'+
        '<div class="card-topics">'+(c.topics.length?c.topics.map(function(t){return esc(t.chapter+' / '+t.name);}).join(' · '):'尚未归入教材 Topic')+'</div>'+
        '<div class="row-actions"><span class="tag">难度 '+c.difficulty+'</span><span class="tag">'+c.minutes+' 分钟</span><span class="tag">'+c.marks+' 分</span></div>'+
        imageMarkup(c,'qp')+'<details><summary>查看 MS / 答案</summary>'+imageMarkup(c,'ms')+'</details>'+
        '<div class="row-actions">'+(compose?'<button class="btn btn-primary" data-action="add" '+(selected?'disabled':'')+'>'+(selected?'已在试卷中':'加入试卷')+'</button>':
        '<button class="btn btn-ghost" data-action="regions">查看 / 修正裁剪</button><button class="btn btn-primary" data-action="metadata">标签与确认可用</button>')+'</div></article>';
    }
    root.innerHTML=list.length?(compose?list.map(cardMarkup).join(''):''):'<div class="empty-tip">没有符合条件的'+(compose?'可用题卡。请先在题目管理中完成标签与确认。':'裁剪题卡。请从原卷管理中创建大题。')+'</div>';
    if(compose){hydrate(root);return;}
    var groups=[];
    list.forEach(function(c){var group=groups.find(function(g){return g.id===c.examPaperId;});if(!group){group={id:c.examPaperId,items:[]};groups.push(group);}group.items.push(c);});
    if(!groups.length){return;}
    groups.forEach(function(g){g.items.sort(function(a,b){return String(a.originalQuestionNumber).localeCompare(String(b.originalQuestionNumber),undefined,{numeric:true});});});
    root.innerHTML=groups.map(function(g,index){
      var source=sources.find(function(p){return p.id===g.id;}),c=g.items[0];
      var title=source?source.paperName+' · '+(source.paperCode||'原卷 #'+source.id)+' · '+source.year+' · '+(source.session||'未填写考季'):c.paper+' · 原卷 #'+g.id+' · '+c.year+' · '+c.session;
      return '<details class="paper-group" data-group="'+index+'"><summary>'+esc(title)+' · '+g.items.length+' 道题</summary><div class="paper-group-content question-cards"></div></details>';
    }).join('');
    root.querySelectorAll('details[data-group]').forEach(function(details){details.addEventListener('toggle',function(){
      if(!details.open||details.dataset.loaded){return;}
      details.dataset.loaded='1';var content=details.querySelector('.paper-group-content');
      content.innerHTML=groups[Number(details.dataset.group)].items.map(function(c){return '<details class="question-entry"><summary>原题 '+esc(c.originalQuestionNumber)+' · '+c.marks+' 分 · '+(c.available?'可用于组卷':'待确认')+'</summary><div class="question-entry-content" data-question="'+c.id+'"></div></details>';}).join('');
      content.querySelectorAll('.question-entry').forEach(function(entry){entry.addEventListener('toggle',function(){
        if(!entry.open||entry.dataset.loaded){return;}entry.dataset.loaded='1';var box=entry.querySelector('[data-question]');
        var card=groups[Number(details.dataset.group)].items.find(function(c){return String(c.id)===box.dataset.question;});box.innerHTML=cardMarkup(card);hydrate(box);
      });});
    });});
  }
  function openMetadata(c){
    edit=c;el('wm-source').textContent=label(c);el('wm-diff').value=c.difficulty;el('wm-minutes').value=c.minutes||'';el('wm-marks').value=c.marks||'';el('wm-confirm').checked=false;
    var topics=topicsFor(c);
    el('wm-topics').innerHTML=topics.length?topics.map(function(t){return '<label class="topic-check"><input type="checkbox" value="'+t.id+'" '+(c.topics.some(function(x){return x.id===t.id;})?'checked':'')+'> '+esc(t.name)+' <span class="f-hint">'+esc(t.title)+'</span></label>';}).join(''):'尚无对应的官方教材目录，请先关闭本窗口，在「教材目录」录入并核对。';
    ZJ.openModal('modal-card-metadata');
  }
  function saveMetadata(action){
    if(!edit){return;}
    var body={difficulty:Number(el('wm-diff').value),minutes:Number(el('wm-minutes').value),marks:Number(el('wm-marks').value),
      topicIds:Array.from(el('wm-topics').querySelectorAll('input:checked')).map(function(x){return Number(x.value);}),
      metadataRevision:edit.metadataRevision,regionRevision:edit.regionRevision,confirmed:el('wm-confirm').checked,action:action};
    el('wm-draft').disabled=true;el('wm-approve').disabled=true;
    req('PATCH','cards/'+edit.id,body).then(function(){ZJ.closeModal('modal-card-metadata');ZJ.toast(action==='approve'?'题卡已确认，可用于内部组卷':'题卡草稿已保存');loadCards();}).catch(fail).finally(function(){el('wm-draft').disabled=false;el('wm-approve').disabled=false;});
  }
  function cartCompatible(f){return !paper.items.length||JSON.stringify(paper.filters)===JSON.stringify(f);}
  function add(c){
    var f=filters('wg');
    if(!cartCompatible(f)){ZJ.toast('当前试卷使用其他筛选条件，请先保存并新建试卷。',true);return;}
    if(!paper.items.some(function(x){return x.id===c.id;})){paper.filters=f;paper.items.push(c);dirty=true;renderPaper();renderCards('wg-list',candidates,true);}
  }
  function renderPaper(){
    el('wg-sum').textContent=paper.items.length+' 题 · '+paper.items.reduce(function(s,c){return s+c.marks;},0)+' 分 · 预计 '+paper.items.reduce(function(s,c){return s+c.minutes;},0)+' 分钟';
    el('wg-scope').textContent=paper.filters?'本卷范围：'+paper.filters.board+' · '+paper.filters.paper:'尚未选题';
    el('wg-items').innerHTML=paper.items.map(function(c,i){return '<div class="compose-item"><b>'+(i+1)+'. '+esc(label(c))+'</b><div class="row-actions"><button class="btn-mini" data-item="'+i+'" data-move="-1" '+(!i?'disabled':'')+'>上移</button><button class="btn-mini" data-item="'+i+'" data-move="1" '+(i===paper.items.length-1?'disabled':'')+'>下移</button><button class="btn-mini" data-remove="'+i+'">移除 / 换题</button></div></div>';}).join('');
    el('wg-qp').disabled=!paper.id||dirty;el('wg-ms').disabled=!paper.id||dirty;
  }
  function clearPaper(){paper={id:null,revision:0,items:[],filters:null};dirty=true;el('wg-name').value='';el('wg-result').textContent='';renderPaper();renderCards('wg-list',candidates,true);}
  function savePaper(){
    var f=paper.filters;if(!f){ZJ.toast('请先选择题卡',true);return;}
    el('wg-save').disabled=true;
    req('POST','papers',{id:paper.id,revision:paper.revision,name:el('wg-name').value,filters:f,questionIds:paper.items.map(function(c){return c.id;})})
      .then(function(d){paper=d.paper;dirty=false;renderPaper();ZJ.toast('试卷已保存');if(!el('wg-saved').hidden){loadSaved();}}).catch(fail).finally(function(){el('wg-save').disabled=false;});
  }
  function loadSaved(){
    return req('GET','papers').then(function(d){
      el('wg-saved').innerHTML='<h3>已保存试卷</h3>'+(d.papers.length?d.papers.map(function(p){return '<div class="paper-brief"><div class="pb-main"><b>'+esc(p.name)+'</b><p class="f-hint">'+esc(p.filters.board+' · '+p.filters.paper)+' · '+p.items.length+' 题 · 版本 '+p.revision+'</p></div><button class="btn btn-ghost" data-open-paper="'+p.id+'">打开</button></div>';}).join(''):'暂无已保存试卷');
      el('wg-saved').querySelectorAll('[data-open-paper]').forEach(function(b){b.addEventListener('click',function(){
        var p=d.papers.find(function(x){return x.id===Number(b.dataset.openPaper);});
        function open(){
          paper=p;dirty=false;board=p.filters.board;el('workspace-board').value=board;el('wg-name').value=p.name;renderPaper();
          window.ZJ_Archive.setBoard(board);
          refresh('compose').then(function(){
            el('wg-paper').value=p.filters.paper;fillCatalog('wg');
            var cat=catalogs.find(function(c){return c.topics.some(function(t){return String(t.id)===String(p.filters.topicId);});});
            if(cat){el('wg-catalog').value=cat.id;fillTopics('wg');}
            el('wg-topic').value=p.filters.topicId||'';el('wg-difficulty').value=p.filters.difficulty||'';
            el('wg-year').value=p.filters.year||'';el('wg-max-minutes').value=p.filters.maxMinutes||'';loadCandidates();
          });
        }
        if(paper.items.length&&dirty){ZJ.confirm('打开试卷','当前试卷有未保存修改，确定打开已保存试卷？','打开').then(function(ok){if(ok){open();}});}else{open();}
      });});
    }).catch(fail);
  }
  function download(kind){
    if(!paper.id||dirty){return;}
    Data.workspaceImage('/api/workspace/papers/'+paper.id+'/pdf/'+kind).then(function(url){var a=document.createElement('a');a.href=url;a.download='paper_'+paper.id+'_'+kind+'.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);}).catch(fail);
  }
  function init(ctx){
    if(ready){return;}Data=ctx.Data;ZJ=ctx.ZJ;
    el('workspace-board').addEventListener('change',function(){board=this.value;cardRequest++;poolRequest++;refresh(ctx.state.activeTab);window.ZJ_Archive.setBoard(board);});
    ['wc-paper','wc-catalog','wc-topic','wc-state','wc-source','wc-view'].forEach(function(id){el(id).addEventListener('change',function(){
      if(id==='wc-paper'){fillCatalog('wc');}if(id==='wc-catalog'){fillTopics('wc');}
      var source=el('wc-view').value==='source';el('wc-source').hidden=!source;el('wc-catalog').hidden=source;el('wc-topic').hidden=source;loadCards();
    });});
    ['wg-paper','wg-catalog','wg-topic','wg-difficulty','wg-year','wg-max-minutes'].forEach(function(id){el(id).addEventListener('change',function(){if(id==='wg-paper'){fillCatalog('wg');}if(id==='wg-catalog'){fillTopics('wg');}loadCandidates();});});
    ['wc-list','wg-list'].forEach(function(id){el(id).addEventListener('click',function(e){var b=e.target.closest('[data-action]');if(!b){return;}var item=b.closest('[data-id]'),list=id==='wc-list'?cards:candidates,c=list.find(function(x){return x.id===Number(item.dataset.id);});if(!c){return;}
      if(b.dataset.action==='add'){add(c);}if(b.dataset.action==='metadata'){openMetadata(c);}if(b.dataset.action==='regions'){window.ZJ_Archive.openQuestion(c.id);}
    });});
    el('wm-draft').addEventListener('click',function(){saveMetadata('draft');});el('wm-approve').addEventListener('click',function(){saveMetadata('approve');});
    el('wc-catalog-open').addEventListener('click',function(){el('wt-paper').value=el('wc-paper').value;el('wt-confirm').checked=false;ZJ.openModal('modal-textbook');});
    el('wt-save').addEventListener('click',function(){
      var entries=el('wt-entries').value.split('\n').filter(function(s){return s.trim();}).map(function(s){var parts=s.split('|');return {chapter:parts[0].trim(),name:parts.length===2?parts[1].trim():''};});
      el('wt-save').disabled=true;
      req('POST','catalogs',{board:board,paper:el('wt-paper').value,title:el('wt-title').value,edition:el('wt-edition').value,source:el('wt-source').value,entries:entries,confirmed:el('wt-confirm').checked})
        .then(function(){ZJ.closeModal('modal-textbook');ZJ.toast('教材目录已保存');refresh('cards');}).catch(fail).finally(function(){el('wt-save').disabled=false;});
    });
    ['wg-year','wg-max-minutes'].forEach(function(id){el(id).addEventListener('input',loadCandidates);});
    el('wg-generate').addEventListener('click',function(){
      var f=filters('wg');if(paper.items.length){ZJ.toast('请先保存或新建试卷，再按条件选题。',true);return;}
      el('wg-generate').disabled=true;
      req('POST','generate',Object.assign({},f,{targetMinutes:Number(el('wg-target').value)})).then(function(d){paper.filters=f;paper.items=d.cards;dirty=true;renderPaper();renderCards('wg-list',candidates,true);el('wg-result').textContent='符合条件 '+d.candidateCount+' 题，本次选出 '+d.cards.length+' 题 / '+d.totalMinutes+' 分钟'+(d.shortageMinutes?'；距离目标尚缺 '+d.shortageMinutes+' 分钟，未放宽筛选条件。':'。');}).catch(fail).finally(function(){el('wg-generate').disabled=false;});
    });
    el('wg-items').addEventListener('click',function(e){var b=e.target.closest('button');if(!b){return;}if(b.dataset.remove!==undefined){paper.items.splice(Number(b.dataset.remove),1);}else{var i=Number(b.dataset.item),j=i+Number(b.dataset.move);if(j<0||j>=paper.items.length){return;}var temp=paper.items[i];paper.items[i]=paper.items[j];paper.items[j]=temp;}dirty=true;renderPaper();renderCards('wg-list',candidates,true);});
    el('wg-clear').addEventListener('click',function(){if(paper.items.length&&dirty){ZJ.confirm('新建试卷','当前未保存内容将清空，确定新建？','新建').then(function(ok){if(ok){clearPaper();}});}else{clearPaper();}});
    el('wg-name').addEventListener('input',function(){dirty=true;renderPaper();});el('wg-save').addEventListener('click',savePaper);
    el('wg-qp').addEventListener('click',function(){download('qp');});el('wg-ms').addEventListener('click',function(){download('ms');});
    el('wg-saved-toggle').addEventListener('click',function(){el('wg-saved').hidden=!el('wg-saved').hidden;if(!el('wg-saved').hidden){loadSaved();}});
    document.querySelectorAll('#modal-card-metadata [data-close], #modal-textbook [data-close]').forEach(function(b){b.addEventListener('click',function(){ZJ.closeModal(b.dataset.close);});});
    window.addEventListener('pagehide',revoke);ready=true;renderPaper();
  }
  window.ZJ_Workspace={init:init,refresh:refresh};
})();
