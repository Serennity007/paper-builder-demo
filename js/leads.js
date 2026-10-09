'use strict';
const leadsEmbedded=!!document.getElementById('leads-status');
const leadsElement=id=>document.getElementById(leadsEmbedded?'leads-'+id:id);
let leadsLoading=false;
let leadsBusy=false;
async function manageLead(lead,remove){
  if(leadsBusy)return;
  if(remove&&!window.confirm(`删除“${lead.name}”的咨询线索？删除后将从销售列表隐藏。`))return;
  leadsBusy=true;
  try{
    const path='/api/diagnostic/leads/'+lead.id, method=remove?'DELETE':'PATCH';
    if(window.ZJ_StaticBank){
      await window.ZJ_StaticBank.handle(method,path,remove?undefined:{priority:!lead.is_priority});
    }else{
      const response=await fetch(path,{
        method:method,headers:{Authorization:'Bearer '+(sessionStorage.getItem('zhxx_zj_token_v1')||''),'Content-Type':'application/json'},
        ...(remove?{}:{body:JSON.stringify({priority:!lead.is_priority})})
      });
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'操作失败');
    }
    leadsBusy=false;
    await load();
  }catch(error){leadsElement('status').textContent=error.message;}
  finally{leadsBusy=false;}
}
function leadDate(value){
  // created_at 是 Python isoformat 的六位微秒；ECMAScript 只保证三位毫秒，旧版 Safari/WebKit 解析会得 Invalid Date，先截断再解析。
  const parsed=new Date(String(value).replace(/(\.\d{3})\d+/,'$1'));
  if(isNaN(parsed.getTime()))return String(value||'');
  const parts=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(parsed);
  const date=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${date.year}年${date.month}月${date.day}日 ${date.hour}:${date.minute}:${date.second}`;
}
async function load() {
  if(leadsLoading||leadsBusy)return;
  leadsLoading=true;
  const status=leadsElement('status'), body=leadsElement('rows');
  status.textContent='加载中…';
  try {
    const filter=leadsElement('priority-only');
    const listPath='/api/diagnostic/leads'+(filter&&filter.checked?'?priority=1':'');
    const data=window.ZJ_StaticBank?await window.ZJ_StaticBank.handle('GET',listPath):await (async()=>{
      const response=await fetch(listPath,{cache:'no-store',headers:{Authorization:'Bearer '+(sessionStorage.getItem('zhxx_zj_token_v1')||'')}});
      const json=await response.json();
      if(!response.ok)throw Error(json.error+'；请先在原后台以管理员身份登录。');
      return json;})();
    body.replaceChildren();
    data.leads.forEach(l=>{
      const tr=document.createElement('tr'),r=l.report;
      [`${l.name}\n${l.contact}`,`${l.course}\n${l.exam_time||'未填写'}`,`${r.readiness===null?'暂无分数':r.readiness+'%'} · 已学 ${r.learnedQuestions}/${r.totalQuestions}`,`薄弱：${r.weak.join(' / ')||'无'}\n风险：${r.risk.join(' / ')||'无'}`,`${r.unlearned.join(' / ')||'无'}\n部分未覆盖：${r.partial.join(' / ')||'无'}`,`${l.intent}\n线索提交时间：${leadDate(l.created_at)}`].forEach((value,index)=>{
        const td=document.createElement('td');
        td.textContent=value;td.style.whiteSpace='pre-line';tr.append(td);
        if(index===2){
          const details=document.createElement('details'),summary=document.createElement('summary');
          summary.textContent='完整诊断报告';details.append(summary);
          const paragraphs=[r.readinessLabel,'已掌握：'+(r.mastered.join(' / ')||'无'),'风险：'+(r.risk.join(' / ')||'无'),'明显薄弱：'+(r.weak.join(' / ')||'无'),'尚未学习：'+(r.unlearned.join(' / ')||'无'),'部分未覆盖：'+(r.partial.join(' / ')||'无'),'建议优先顺序：'+(r.priorities.join(' → ')||'暂无'),r.advice,...r.evidence.map(e=>e.topic+'：'+e.reason),r.disclaimer];
          paragraphs.forEach(text=>{const p=document.createElement('p');p.textContent=text;details.append(p)});
          td.append(details);
        }
      });
      const actions=document.createElement('td');
      if(l.is_priority){tr.style.backgroundColor='#fff7dc';const label=document.createElement('strong');label.textContent='★ 重点客户';actions.append(label,document.createElement('br'));}
      const priority=document.createElement('button');priority.type='button';priority.className='btn btn-ghost';priority.textContent=l.is_priority?'取消重点':'标记重点';priority.onclick=()=>manageLead(l,false);
      const remove=document.createElement('button');remove.type='button';remove.className='btn btn-ghost';remove.textContent='删除';remove.onclick=()=>manageLead(l,true);
      actions.append(priority,remove);tr.append(actions);
      body.append(tr);
    });
    status.textContent=data.leads.length?`${data.leads.length} 条线索`:'暂无诊断线索，学生提交咨询后会显示在这里。';
  } catch(e) {status.textContent=e.message;}
  finally {leadsLoading=false;}
}
leadsElement('refresh').onclick=load;
window.ZJ_Leads={refresh:load};
if(leadsElement('priority-only'))leadsElement('priority-only').onchange=load;
if(!leadsEmbedded){load();}
function leadsVisible(){return !document.hidden&&(!leadsEmbedded||!document.getElementById('tab-leads').hidden);}
setInterval(()=>{if(leadsVisible()&&!leadsElement('rows').querySelector('details[open]'))load();},5000);
window.addEventListener('focus',()=>{if(leadsVisible())load();});
