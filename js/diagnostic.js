'use strict';
const $=id=>document.getElementById(id), answers={};let questions=[],index=0,runId='',renderSerial=0;
const imageCache=new Map(); // 题图响应是 no-store，换答案重渲染时复用已加载的 img 元素，避免重复下载。
const labels={can:'会做',unsure:'不确定',cannot:'不会',unlearned:'没学过'};
function appendLearningPlan(box,report){
  box.append(node('h2','你的模拟 P1 学习规划'),node('p','根据本次自评生成的示例规划。建议每次安排 20–30 分钟，聚焦一个 Topic；具体进度由实际解题和教师诊断调整。'));
  const stages=[];
  if(report.weak.length)stages.push({title:'先补基础',topics:report.weak,action:'复习概念与基本方法，先做基础例题，再独立完成 2–3 道同 Topic 练习。遇到卡点时记录具体步骤，交给老师核查。'});
  if(report.risk.length)stages.push({title:'再复核风险项',topics:report.risk,action:'不看答案独立尝试真题，对照评分步骤找出问题；高难题不会先检查所需基础，不直接认定整个 Topic 薄弱。'});
  const notCovered=[...new Set([...report.unlearned,...report.partial])];
  if(notCovered.length)stages.push({title:'安排未学内容',topics:notCovered,action:'按课程进度学习相关概念，再从例题过渡到基础真题。没学过表示进度未覆盖，先学习再评价掌握情况。'});
  if(report.mastered.length)stages.push({title:'保持已掌握内容',topics:report.mastered,action:'间隔复习并尝试混合 Topic 真题，用实际解题确认自评；完成当前优先项后再增加难度。'});
  stages.forEach((stage,i)=>{box.append(node('h3',`第 ${i+1} 步 · ${stage.title}`),node('p',stage.topics.join(' / ')),node('p',stage.action));});
  box.append(node('p','完成一个 Topic 的练习后，再核查掌握情况并调整下一步顺序。完整规划需结合你的目标考试时间、已学进度和实际解题表现。'));
}
function node(tag,text){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e}
async function api(url,body){if(window.ZJ_StaticBank)return window.ZJ_StaticBank.handle(body?'POST':'GET',url,body);const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await r.json();if(!r.ok)throw Error(data.error||'请求失败');return data}
function fail(e){$('error').textContent=e.message}
function retryButton(attempt){const b=node('button','重试加载');b.onclick=attempt;return b}
function attachImage(box,url,i,pending,settle){
  const cached=imageCache.get(url);
  if(cached){box.append(cached);return;}
  pending.add(url);
  const holder=node('div');box.append(holder);
  const attempt=()=>{
    if(renderSerial!==Number(holder.dataset.gen))return;
    holder.replaceChildren();
    const image=node('img');
    image.alt=`真实题目第 ${i+1} 个区域`;image.className='question-image';
    image.onload=()=>{imageCache.set(url,image);holder.replaceChildren(image);settle(url,true)};
    image.onerror=()=>{settle(url,false);holder.replaceChildren(node('p','题目图片加载失败。'),retryButton(attempt))};
    image.src=url;
    holder.append(image);
  };
  holder.dataset.gen=renderSerial;attempt();
}
function render(){
  const q=questions[index],box=$('quiz');const gen=++renderSerial;
  box.replaceChildren();
  box.append(node('p',`第 ${index+1} / ${questions.length} 题 · 已选择 ${Object.keys(answers).length} 题`));
  const progress=node('progress');progress.max=questions.length;progress.value=Object.keys(answers).length;
  box.append(progress,node('h2',q.topics.join(' / ')),node('p',`${q.source} · ${['','基础','较易','中等','较难','挑战'][q.difficulty]} · ${q.marks} 分`));
  const pending=new Set();
  const settle=(url,ok)=>{if(ok)pending.delete(url);if(gen===renderSerial&&!pending.size){opts.querySelectorAll('button').forEach(b=>b.disabled=false);next.disabled=!answers[q.id]}};
  q.images.forEach((url,i)=>attachImage(box,url,i,pending,settle));
  const opts=node('div');opts.className='options';Object.entries(labels).forEach(([key,label])=>{const b=node('button',label);b.className=answers[q.id]===key?'selected':'';b.setAttribute('aria-pressed',answers[q.id]===key);b.onclick=()=>{answers[q.id]=key;render()};opts.append(b)});box.append(opts);
  const nav=node('div');nav.className='actions';const back=node('button','上一题');back.disabled=index===0;back.onclick=()=>{index--;render()};const next=node('button',index===questions.length-1?'生成学习诊断':'下一题');next.className='primary';next.disabled=!answers[q.id];next.onclick=async()=>{if(index<questions.length-1){index++;render();box.scrollIntoView({behavior:'smooth'});return}next.disabled=true;try{const data=await api('/api/diagnostic/report',{answers});runId=data.runId;showReport(data.report)}catch(e){fail(e);next.disabled=false}};nav.append(back,next);box.append(nav);
  opts.querySelectorAll('button').forEach(b=>b.disabled=true);next.disabled=true;
  settle(null,true);
}
function showReport(r){$('quiz').hidden=true;const box=$('result');box.hidden=false;box.replaceChildren(node('h2','你的 P1 初步学习诊断'));const score=node('div',r.readiness===null?'暂无分数':`${r.readiness}%`);score.className='score';box.append(score,node('p',`${r.readinessLabel} · 已学 ${r.learnedQuestions} / ${r.totalQuestions} 题；百分比为自评指标。`));[['mastered','已掌握 Topic（自评）'],['risk','风险 Topic'],['weak','明显薄弱 Topic'],['unlearned','尚未学习 Topic'],['partial','部分内容未覆盖 Topic']].forEach(([key,title])=>{box.append(node('h3',title),node('p',r[key].join(' / ')||'本次未发现'))});box.append(node('h3','建议优先学习顺序'));const ol=node('ol');r.priorities.forEach(t=>ol.append(node('li',t)));box.append(ol,node('p',r.advice),node('p',r.disclaimer));const details=node('details');details.append(node('summary','为什么得到这个结果？'));r.evidence.forEach(e=>details.append(node('p',`${e.topic}：${e.reason} ${e.answers.map(a=>`题 ${questions.find(q=>q.id===a.questionId).source}：${labels[a.state]}`).join('；')}`)));box.append(details);appendLearningPlan(box,r);const actions=node('div');actions.className='actions';[...$('form').elements.intent.options].forEach(o=>{const b=node('button',o.value);b.onclick=()=>{$('lead').hidden=false;$('form').elements.intent.value=o.value;$('lead').scrollIntoView({behavior:'smooth'})};actions.append(b)});box.append(actions);box.scrollIntoView({behavior:'smooth'})}
$('form').onsubmit=async e=>{e.preventDefault();const form=e.target,b=form.querySelector('button');b.disabled=true;$('error').textContent='';try{await api('/api/diagnostic/leads',{...Object.fromEntries(new FormData(form)),runId,consent:form.elements.consent.checked});$('submitted').textContent='静态演示版：本次提交只保存在当前浏览器，不会发送给老师。正式咨询请使用老师提供的联系方式。';form.querySelectorAll('input,select').forEach(e=>e.disabled=true)}catch(e){fail(e);b.disabled=false}};
api('/api/diagnostic/questions').then(data=>{questions=data.questions;render()}).catch(e=>{fail(e);$('quiz').textContent='诊断暂不可用，请稍后重试。'});
