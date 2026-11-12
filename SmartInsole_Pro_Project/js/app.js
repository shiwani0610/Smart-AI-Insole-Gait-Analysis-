(()=>{'use strict';
const E=window.GaitEngine;
const ML=window.GaitML;
if(!E){alert('Analysis engine could not load. Please keep the js folder with index.html.');return;}
const $=id=>document.getElementById(id);
const n=(x,d=0)=>Number.isFinite(x)?Number(x).toFixed(d):'—';
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const live={on:false,bridge:false,source:'HARDWARE',status:{},frames:[],events:null,baseline:null,offset:[0,0,0],amplitude:0,lastFrameAt:0,lastRender:0,lastAnalysis:0,stream:null};
const state={frames:[],results:null,kind:'steady',source:'Simulated · Steady demo',fileName:'',cursor:0,playing:false,speed:1,raf:0,lastStamp:0,chart:'pressure',history:[],baseline:null,rawText:null};
try{state.history=JSON.parse(localStorage.getItem('smartinsole_history_v4')||'[]');if(!Array.isArray(state.history))state.history=[];state.baseline=JSON.parse(localStorage.getItem('smartinsole_baseline_v4')||'null')}catch(e){state.history=[];state.baseline=null}
const fmtTime=t=>n(t,1)+'s';
function toast(msg,error=false){const d=$('toast');d.textContent=msg;d.className='visible'+(error?' error':'');clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>d.className='',3500)}
function store(){try{localStorage.setItem('smartinsole_history_v4',JSON.stringify(state.history.slice(0,60)));localStorage.setItem('smartinsole_baseline_v4',JSON.stringify(state.baseline))}catch(e){toast('Browser storage unavailable. Export reports to keep records.',true)}}
function show(view){if(!document.getElementById('view-'+view))return;document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id==='view-'+view));document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.view===view));$('crumbName').textContent=({overview:'Overview',lab:'Gait analysis lab',pressure:'Pressure map',monitor:'Sensor monitor',sessions:'Session history',reports:'Reports & compare',architecture:'System architecture',about:'About & setup'})[view]||view;window.scrollTo({top:0,behavior:'smooth'});if(view==='live')drawLive();if(view==='overview')drawChart($('overviewChart'),state.chart);if(view==='lab')drawChart($('labChart'),'pressure');if(view==='pressure')renderPressure();if(view==='monitor')renderMonitor();if(view==='sessions')renderSessions();if(view==='reports')renderReports()}
document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>show(btn.dataset.view)));
function csvDownload(filename,rows){const text=rows.map(row=>row.map(v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s}).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
const stamp=()=>new Date().toISOString().slice(0,19).replaceAll(':','-');
function metrics(r=state.results){return !r?{}:{cadence:r.cadence,contacts:r.events.length,stance:r.stance,swing:r.swing,consistency:r.consistency,cycle:r.cycle,h2t:r.heelToToe,integrity:r.integrity,flags:r.flags.length,zonePct:r.zonePct||[0,0,0]}}
function loadData(frames,kind,filename=''){live.on=false;pause();if(frames.length>80000)throw new Error('This file is too large for browser analysis (max 80,000 samples).');state.frames=frames;state.results=E.analyze(frames);state.ml=ML?ML.predict(state.results):{valid:false,reason:"ML module unavailable"};state.kind=kind;state.source=kind==='steady'?'Simulated · Steady demo':kind==='irregular'?'Simulated · Irregular demo':'Imported CSV · '+filename;state.fileName=filename;state.cursor=Math.floor(frames.length*.38);$('timeline').max=Math.max(0,frames.length-1);$('timeline').value=state.cursor;$('sourceTag').textContent=kind==='imported'?'RECORDED CSV':kind==='steady'?'SIMULATED · STEADY':'SIMULATED · IRREGULAR';$('sourceBadge').textContent=kind==='imported'?'RECORDED CSV':kind==='steady'?'STEADY DEMO':'IRREGULAR DEMO';$('monitorSrc').textContent=kind==='imported'?'IMPORTED CSV':'SIMULATED RECORDING';$('fileStatus').textContent=kind==='imported'?'Imported: '+filename+' · '+frames.length.toLocaleString()+' samples':`Loaded: simulated ${kind} walking sequence · ${frames.length.toLocaleString()} samples`;document.querySelectorAll('[data-demo]').forEach(b=>b.classList.toggle('active',b.dataset.demo===kind));renderAll();toast(kind==='imported'?'CSV imported and analyzed successfully.':kind==='steady'?'Steady demo loaded — simulated data.':'Irregular demo loaded — simulated data.')}
function current(){return state.frames[state.cursor]||state.frames.at(-1)||null}
function phase(f){if(live.on&&live.amplitude<160)return{key:'swing',label:'INSUFFICIENT SIGNAL',desc:'No clear pressure transitions — calibrate and walk'};if(!f||!state.results)return{key:'swing',label:'NO DATA',desc:'Load a recording'};const v=live.on?{heel:Math.max(0,f.heel-live.offset[0]),midfoot:Math.max(0,f.midfoot-live.offset[1]),toe:Math.max(0,f.toe-live.offset[2])}:f;let sum=v.heel+v.midfoot+v.toe;if(sum<state.results.threshold)return{key:'swing',label:'SWING',desc:'No clear ground contact'};if(v.heel>v.toe*1.2&&v.heel>=v.midfoot)return{key:'heel',label:'HEEL CONTACT',desc:'Initial rearfoot loading'};if(v.toe>v.heel*1.22&&v.toe>=v.midfoot)return{key:'toe',label:'PUSH-OFF',desc:'Toe / forefoot loading'};return{key:'mid',label:'MID-STANCE',desc:'Load transfers through foot'}}
function percent(v,base){return Math.max(0,Math.min(100,base>0?v/base*100:0))}
function updateHeat(id,weight){const el=$(id);if(!el)return;const alpha=Math.max(.14,Math.min(.95,weight/1800));el.setAttribute('opacity',String(alpha));el.setAttribute('fill',weight>1600?'#fbad62':weight>900?'#3bf4bc':'#279edc')}
function renderFrame(){const f=current();if(!f)return;const ph=phase(f);$('phaseName').textContent=ph.label;$('phaseDesc').textContent=ph.desc;$('labPhase').textContent=ph.label;$('phaseGlyph').textContent=ph.key==='swing'?'◌':ph.key==='heel'?'↙':ph.key==='toe'?'↗':'◈';document.querySelectorAll('#phaseTrack span').forEach(el=>el.classList.toggle('active',el.dataset.phase===ph.key));$('footHeel').textContent=Math.round(f.heel)+' ADC';$('footMid').textContent=Math.round(f.midfoot)+' ADC';$('footToe').textContent=Math.round(f.toe)+' ADC';const vals=[f.heel,f.midfoot,f.toe];const max=Math.max(1,...vals,800);['barHeel','barMid','barToe'].forEach((id,i)=>$(id).style.width=percent(vals[i],max)+'%');updateHeat('heatHeel',f.heel);updateHeat('heatMid',f.midfoot);updateHeat('heatToe',f.toe);$('timelineTime').textContent=fmtTime(f.t);if(live.on)drawLive();$('timeline').value=state.cursor;drawChart($('overviewChart'),state.chart);drawChart($('labChart'),'pressure');renderMonitor();renderPressureValues()}
function renderAll(){const r=state.results;if(!r)return;const m=metrics(r);$('kCadence').textContent=n(r.cadence,0);$('kCadenceTag').textContent=r.cadence?'Estimated':'Insufficient cycles';$('kContacts').textContent=r.events.length;$('kStance').textContent=n(r.stance,0);$('kConsistency').textContent=n(r.consistency,0);$('pCycle').textContent=r.cycle?n(r.cycle,2)+'s':'—';$('pProgression').textContent=r.heelToToe!==null?n(r.heelToToe,0)+'%':'—';$('pFlags').textContent=r.flags.length;$('aCad').textContent=n(r.cadence,0);$('aStance').textContent=r.stance!==null?n(r.stance,0)+' / '+n(r.swing,0)+'%':'—';$('aConsistency').textContent=n(r.consistency,0)+' / 100';$('aH2T').textContent=r.heelToToe!==null?n(r.heelToToe,0)+'%':'—';$('aContacts').textContent=r.events.length;$('durationChip').textContent=n(r.duration,1)+' SEC · '+r.frames+' SAMPLES';$('eventsCount').textContent=r.events.length+' CONTACT EVENTS';$('qualityNumber').textContent=n(r.integrity,0)+'%';$('qualityRing').style.strokeDashoffset=String(213.63*(1-Math.max(0,Math.min(100,r.integrity))/100));$('analysisStatus').textContent=r.flags.length?'CHECK SIGNAL':'ANALYZED';$('alertCount').textContent=r.flags.length+' FLAGS';$('rhythmText').textContent=r.cv!==null?`Same-foot cycle timing varies by ${n(r.cv,1)}% (coefficient of variation). ${r.cv>12?'This demo/recording has uneven timing.':'This recording shows relatively regular timing.'}`:'Not enough complete gait cycles to measure rhythm reliably.';$('transferText').textContent=r.heelToToe!==null?`${n(r.heelToToe,0)}% of eligible contacts have toe peak after heel peak — a simple pressure-transfer proxy.`:'Insufficient heel and toe peak events to estimate pressure progression.';$('anomalyText').textContent=r.flags.length?r.flags.join(' · '):'No rule-based flags triggered in the selected recording. This does not establish healthy or normal gait.';renderEvents();renderAlerts();renderML();renderFrame();renderRecent();renderSessions();renderReports()}
function renderML(){const z=state.ml||{valid:false,reason:'Model not loaded'};
 $('mlStatus').textContent=z.valid?'RANDOM FOREST · '+z.trees+' TREES':'DATA INSUFFICIENT';
 $('mlClass').textContent=z.valid?z.label:'Not enough gait events';
 $('mlExplain').textContent=z.valid?`Experimental classification of ${state.kind==='live'?'hardware stream':state.kind==='imported'?'imported':'simulated'} recording. Computed from cycle timing and three-zone pressure features.`:z.reason;
 const steady=z.valid?100*(1-z.irregularProbability):0,irregular=z.valid?100*z.irregularProbability:0;
 $('mlSteady').textContent=z.valid?n(steady,1)+'%':'—';$('mlIrregular').textContent=z.valid?n(irregular,1)+'%':'—';
 $('mlSteadyBar').style.width=steady+'%';$('mlIrregularBar').style.width=irregular+'%';
 $('mlVotes').textContent=z.valid?'Model class score only. Not a calibrated probability of disease or real-world accuracy.':'No output is invented if the input is insufficient.';
}
function renderEvents(){const r=state.results;$('eventList').innerHTML=r.events.slice(-10).map(e=>`<div class="event-item"><span>${n(e.start,2)} s</span><span>${e.stance!==undefined?n(e.stance,2)+' s':'Incomplete'}</span><span>${safe(e.first)}</span><span class="${e.heelAt!==null&&e.toeAt!==null&&e.toeAt>e.heelAt?'good':'bad'}">${e.toeAt!==null&&e.heelAt!==null?(e.toeAt>e.heelAt?'Ordered':'Reversed'):'Unknown'}</span></div>`).join('')||'<p class="recent-empty">No contacts detected.</p>'}
function renderAlerts(){const flags=state.results?.flags||[];$('alertList').innerHTML=flags.length?flags.map(f=>`<div class="alert-item"><i>⚠</i><span>${safe(f)}<br/><small>Experimental threshold check · review input data</small></span></div>`).join(''):'<div class="alert-item ok"><i>✓</i><span>No algorithmic alert triggered.<br/><small>This is not a medical clearance or diagnosis.</small></span></div>'}
function drawChart(canvas,kind){if(!state.frames.length||!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);const left=48,right=15,top=21,bottom=30,plotW=w-left-right,plotH=h-top-bottom;ctx.strokeStyle='#25425e';ctx.lineWidth=1;ctx.font='11px system-ui';ctx.fillStyle='#729ab8';ctx.textAlign='right';let max=kind==='motion'?Math.max(1,...state.frames.filter((_,i)=>i%Math.max(1,Math.floor(state.frames.length/600))===0).map(f=>Math.max(Math.abs(f.ax),Math.abs(f.ay),Math.abs(f.az)))):Math.max(200,...state.frames.filter((_,i)=>i%Math.max(1,Math.floor(state.frames.length/600))===0).map(f=>Math.max(f.heel,f.midfoot,f.toe)));let min=kind==='motion'?-max:0;let hi=max*1.1,lo=kind==='motion'?min*1.1:0;for(let i=0;i<=4;i++){let y=top+i*plotH/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.fillText(Math.round(hi-(hi-lo)*i/4).toLocaleString(),left-8,y+4)}ctx.textAlign='center';const end=state.frames.at(-1).t,first=state.frames[0].t;for(let i=0;i<=5;i++){const x=left+i*plotW/5;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,top+plotH);ctx.stroke();ctx.fillText(n(first+(end-first)*i/5,1)+'s',x,h-9)}const signals=kind==='motion'?[['ax','#1ddcbb'],['ay','#4f9cfa'],['az','#efab79']]:[['heel','#1ddcbb'],['midfoot','#4f9cfa'],['toe','#efab79']];const step=Math.max(1,Math.floor(state.frames.length/700));signals.forEach(([key,col])=>{ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();state.frames.forEach((f,i)=>{if(i%step!==0&&i!==state.frames.length-1)return;let x=left+Math.min(plotW,Math.max(0,(f.t-first)/(end-first||1)*plotW));let y=top+(hi-f[key])/(hi-lo||1)*plotH;y=Math.max(top,Math.min(top+plotH,y));if(i<step)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke()});const f=current();if(f){const x=left+(f.t-first)/(end-first||1)*plotW;ctx.beginPath();ctx.strokeStyle='#f8fcff';ctx.globalAlpha=.5;ctx.setLineDash([4,4]);ctx.moveTo(x,top);ctx.lineTo(x,top+plotH);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1}}
function renderPressureValues(){const f=current();if(!f)return;const r=state.results;const zone=r.zonePct||[0,0,0];const host=$('zoneRows');host.innerHTML=['Heel','Midfoot','Toe'].map((name,i)=>`<div class="zone-bar"><div><span>${name}</span><b>${n(zone[i],1)}%</b></div><div class="progress"><i style="width:${zone[i]}%"></i></div></div>`).join('');$('pressureSummary').innerHTML=[['Heel',f.heel],['Midfoot',f.midfoot],['Toe',f.toe]].map(([k,v])=>`<div>${k} current<b>${n(v,0)} ADC</b></div>`).join('');const clone=$('largePressure').querySelector('svg');if(clone){const heats=[f.heel,f.midfoot,f.toe];['heatHeel','heatMid','heatToe'].forEach((id,i)=>{const a=clone.querySelector('[id="big_'+id+'"]');if(a){a.setAttribute('opacity',String(Math.max(.15,Math.min(.95,heats[i]/1800))));a.setAttribute('fill',heats[i]>1600?'#fbad62':heats[i]>900?'#3bf4bc':'#279edc')}})}}
function renderPressure(){const dest=$('largePressure');if(!dest.querySelector('svg')){const svg=document.querySelector('.foot-svg').cloneNode(true);svg.querySelectorAll('[id]').forEach(el=>el.id='big_'+el.id);const inner=document.createElement('div');inner.className='large-foot-inner';inner.appendChild(svg);const labels=document.createElement('div');labels.className='bigmap-labels';labels.innerHTML='<div><span>HEEL ZONE</span><b>FSR 01</b></div><div><span>MIDFOOT</span><b>FSR 02</b></div><div><span>TOE ZONE</span><b>FSR 03</b></div>';inner.appendChild(labels);dest.innerHTML='<div class="panelhead"><div><h2>Three-zone foot heatmap</h2><p>Color intensity follows sensor signal</p></div><span class="chip green">SENSOR VIEW</span></div>';dest.appendChild(inner)}renderPressureValues()}
function renderMonitor(){const f=current();if(!f)return;const vals=[['Heel',f.heel],['Midfoot',f.midfoot],['Toe',f.toe]];$('monitorFsr').innerHTML=vals.map(([name,v])=>`<div class="monitor-zone"><div class="zrow"><span>${name} ADC</span><b>${n(v,0)}</b></div><div class="progress"><i style="width:${Math.min(100,Math.max(0,v)/4095*100)}%"></i></div></div>`).join('');$('imuGrid').innerHTML=[['Accel X',f.ax],['Accel Y',f.ay],['Accel Z',f.az],['Gyro X',f.gx],['Gyro Y',f.gy],['Gyro Z',f.gz]].map(([name,val])=>`<div class="imu-tile"><small>${name}</small><b>${n(val,0)}</b></div>`).join('');const r=state.results;$('diagGrid').innerHTML=[['Loaded samples',r.frames.toLocaleString()],['Duration',n(r.duration,1)+' s'],['Signal coverage',n(r.integrity,0)+'%'],['FSR events',r.events.length]].map(([l,v])=>`<div class="diag-card"><small>${l}</small><b>${v}</b></div>`).join('')}
function makeSession(){const r=state.results;if(!r)return null;return{id:'SI-'+Date.now(),name:state.fileName?state.fileName.slice(0,40):state.kind==='live'?'Live ESP32 capture':state.kind==='steady'?'Steady walking demo':'Irregular walking demo',source:state.kind==='live'?(live.source==='HARDWARE'?'Live ESP32 USB':'Test replay'):state.kind==='imported'?'Recorded CSV':'Simulated',createdAt:new Date().toISOString(),metrics:metrics(r),flags:[...r.flags],duration:r.duration,frames:r.frames}}
function saveSession(){const item=makeSession();if(!item)return;state.history.unshift(item);state.history=state.history.slice(0,60);store();renderRecent();renderSessions();renderReports();toast('Analysis saved in local session history.')}
function renderRecent(){const recent=state.history.slice(0,3);$('recentList').innerHTML=recent.map(s=>`<div class="recent-row"><div class="recent-icon">⌁</div><div class="r-mid"><strong>${safe(s.name)}</strong><small>${new Date(s.createdAt).toLocaleDateString('en-IN')} · ${n(s.metrics.cadence,0)} steps/min*</small></div><span class="r-state">${safe(s.source)}</span></div>`).join('')||'<div class="recent-empty">No sessions saved yet. Analyze a demo or CSV, then select “Save current session”.</div>'}
function renderSessions(){const q=($('searchSessions').value||'').toLowerCase();const filtered=state.history.filter(s=>(s.name+' '+s.id+' '+s.source).toLowerCase().includes(q));$('sessionBody').innerHTML=filtered.map(s=>`<tr><td><strong>${safe(s.name)}</strong><br/><small>${safe(s.id)}</small></td><td>${safe(s.source)}</td><td>${new Date(s.createdAt).toLocaleString('en-IN')}</td><td>${n(s.metrics.cadence,0)}</td><td>${n(s.metrics.consistency,0)}</td><td>${s.metrics.flags}</td><td><button data-remove="${safe(s.id)}">Delete</button></td></tr>`).join('')||'<tr><td colspan="7">No saved sessions. Use “Save current session” to add one.</td></tr>';$('sessionBody').querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{state.history=state.history.filter(s=>s.id!==b.dataset.remove);store();renderSessions();renderRecent();renderReports();toast('Session removed.')}))}
function renderReports(){const r=state.results;if(!r)return;const base=state.baseline;$('baselineName').textContent=base?base.name+' · '+new Date(base.createdAt).toLocaleDateString('en-IN'):'No baseline saved';const cur=metrics(r);const def=[['Cadence (steps/min)','cadence',0],['Cycle time (s)','cycle',2],['Stance time (%)','stance',0],['Rhythm consistency','consistency',0],['Heel-to-toe (%)','h2t',0]];$('comparisonRows').innerHTML=base?def.map(([label,key,dec])=>{const a=base.metrics[key],b=cur[key];const delta=Number.isFinite(a)&&Number.isFinite(b)&&a!==0?(b-a)/Math.abs(a)*100:null;return `<div class="compare-item"><span>${label}</span><b>${n(a,dec)}</b><b>${n(b,dec)}</b><b class="delta ${delta<0?'down':''}">${delta===null?'—':(delta>0?'+':'')+n(delta,1)+'%'}</b></div>`}).join(''):'<p style="padding:18px 0;color:#809cb4;font-size:12px">Click “Save current as baseline” to compare future recordings with this reference.</p>'}
function exportSummary(){const r=state.results;if(!r)return;const m=metrics(r),row=['source','createdAt','samples','duration_s','contacts','cadence_est_spm','cycle_s','stance_pct','swing_pct','consistency_index','heel_to_toe_pct','sensor_coverage_pct','flags','ml_synthetic_class','ml_steady_score_pct','ml_irregular_score_pct','caution'];csvDownload('SmartInsole_Analysis_'+stamp()+'.csv',[row,[state.source,new Date().toISOString(),r.frames,n(r.duration,3),r.events.length,n(r.cadence,2),n(r.cycle,3),n(r.stance,1),n(r.swing,1),n(r.consistency,1),n(r.heelToToe,1),n(r.integrity,1),r.flags.join(' | '),state.ml?.valid?state.ml.label:'N/A',state.ml?.valid?n(100*(1-state.ml.irregularProbability),1):'N/A',state.ml?.valid?n(100*state.ml.irregularProbability,1):'N/A','Research prototype. Synthetic-trained ML only. Not medical diagnosis. Single insole cadence assumption.']]);toast('Analysis summary exported.')}
function exportSamples(){if(!state.frames.length)return;const head=['time_s','heel','midfoot','toe','ax','ay','az','gx','gy','gz'];csvDownload('SmartInsole_Sensor_Samples_'+stamp()+'.csv',[head,...state.frames.map(f=>head.map(k=>k==='time_s'?n(f.t,3):Math.round(f[k])))]);toast('Sensor samples exported.')}
function exportHistory(){if(!state.history.length){toast('No saved sessions to export yet.',true);return}const head=['id','name','source','recorded_at','duration_s','cadence_est','stance_pct','consistency','flags'];csvDownload('SmartInsole_Sessions_'+stamp()+'.csv',[head,...state.history.map(s=>[s.id,s.name,s.source,s.createdAt,n(s.duration,2),n(s.metrics.cadence,1),n(s.metrics.stance,1),n(s.metrics.consistency,1),s.flags.join(' | ')])])}
function setBaseline(){state.baseline=makeSession();state.baseline.name=state.kind==='live'?'Live ESP32 reference':state.kind==='imported'?(state.fileName||'Recorded session'):'Reference · '+(state.kind==='steady'?'Steady demo':'Irregular demo');store();renderReports();toast('Baseline saved locally. Load a different session to compare.')}
function pause(){state.playing=false;cancelAnimationFrame(state.raf);if($('playPause'))$('playPause').textContent='▶ Play timeline';state.lastStamp=0}
function animate(ts){if(!state.playing)return;const r=state.frames;const delta=state.lastStamp?(ts-state.lastStamp)/1000:0;state.lastStamp=ts;const cur=current();if(!cur){pause();return}const target=cur.t+delta*state.speed;let j=state.cursor;while(j<r.length-1&&r[j].t<target)j++;state.cursor=j;renderFrame();if(j>=r.length-1){pause();toast('Playback finished.')}else state.raf=requestAnimationFrame(animate)}
$('playPause').addEventListener('click',()=>{if(state.playing){pause();return}if(state.cursor>=state.frames.length-1)state.cursor=0;state.playing=true;$('playPause').textContent='Ⅱ Pause timeline';state.lastStamp=0;state.raf=requestAnimationFrame(animate)});
$('rewind').addEventListener('click',()=>{pause();state.cursor=0;renderFrame()});$('timeline').addEventListener('input',e=>{pause();state.cursor=Number(e.target.value);renderFrame()});$('playSpeed').addEventListener('change',e=>state.speed=Number(e.target.value));
document.querySelectorAll('[data-demo]').forEach(b=>b.addEventListener('click',()=>loadData(E.simulate(b.dataset.demo),b.dataset.demo)));
$('clearData').addEventListener('click',()=>loadData(E.simulate('steady'),'steady'));
$('sampleRate').addEventListener('change',()=>{if(state.rawText){try{const p=E.parseCSV(state.rawText,Number($('sampleRate').value));loadData(p.frames,'imported',state.fileName)}catch(e){toast(e.message,true)}}});
$('csvFile').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>7*1024*1024)throw Error('Use a CSV under 7 MB for browser analysis.');const str=await file.text();const parsed=E.parseCSV(str,Number($('sampleRate').value));state.rawText=str;loadData(parsed.frames,'imported',file.name);if(parsed.rejected.length)toast('Imported '+parsed.frames.length+' rows; skipped '+parsed.rejected.length+' unrecognized rows.')}catch(err){toast('CSV error: '+err.message,true)}finally{e.target.value=''}});
document.querySelectorAll('[data-chart]').forEach(b=>b.addEventListener('click',()=>{state.chart=b.dataset.chart;document.querySelectorAll('[data-chart]').forEach(x=>x.classList.toggle('selected',x===b));$('chartHint').textContent=state.chart==='motion'?'Acceleration XYZ (raw)':'Pressure channels (ADC)';drawChart($('overviewChart'),state.chart)}));
$('searchSessions').addEventListener('input',renderSessions);
['saveOverview','saveLab','saveSessions'].forEach(id=>$(id).addEventListener('click',saveSession));
['topReport','labExport','exportReport','reportSummary'].forEach(id=>$(id).addEventListener('click',exportSummary));
$('reportSamples').addEventListener('click',exportSamples);$('reportPrint').addEventListener('click',()=>{show('reports');window.print()});$('setBaseline').addEventListener('click',setBaseline);$('exportSessions').addEventListener('click',exportHistory);
$('downloadSample').addEventListener('click',()=>{const frames=E.simulate('steady');const head=['time_s','heel','midfoot','toe','ax','ay','az','gx','gy','gz'];csvDownload('SmartInsole_Example_Reading.csv',[head,...frames.map(f=>head.map(k=>k==='time_s'?n(f.t,3):Math.round(f[k])))]);toast('Example CSV downloaded.')});
window.addEventListener('keydown',e=>{if(e.key==='Escape')pause()});
window.addEventListener('resize',()=>{if(document.querySelector('.view.active')?.id==='view-overview')drawChart($('overviewChart'),state.chart);if(document.querySelector('.view.active')?.id==='view-lab')drawChart($('labChart'),'pressure')});
// Clearly labelled simulated data is fallback for file:// opening; local server switches to actual USB mode automatically.
loadData(E.simulate('steady'),'steady');

// ── REAL ESP32 USB LIVE MODE (Python serial bridge → browser SSE) ──
// No sensor values or AI predictions are invented when hardware is disconnected.
function setLiveMode(){
 live.on=true;live.frames=[];live.baseline=null;live.offset=[0,0,0];live.amplitude=0;
 state.frames=[];state.results=null;state.ml={valid:false,reason:'Waiting for multiple real foot-contact events'};
 state.kind='live';state.source='Live ESP32 USB';state.fileName='Live ESP32';state.cursor=0;
 $('sourceTag').textContent='AWAITING LIVE ESP32';$('sourceBadge').textContent='LIVE / WAITING';$('monitorSrc').textContent='LIVE USB';
 $('fileStatus').textContent='Waiting for the first actual ESP32 serial frames...';
 $('kCadence').textContent='—';$('kContacts').textContent='0';$('kStance').textContent='—';$('kConsistency').textContent='—';
 $('phaseName').textContent='WAITING FOR HARDWARE';$('phaseDesc').textContent='No sensor frames received yet';
 ['footHeel','footMid','footToe','mlSteady','mlIrregular'].forEach(k=>$(k).textContent='—');
 $('mlClass').textContent='Waiting for actual sensor data';$('mlExplain').textContent='No gait result is created until real sensor frames arrive.';
 $('sourceTag').closest('.mode-pill')?.classList.add('live-mode');
 $('timeline').max=0;$('timeline').value=0;
 drawLive();
}
function quantile(a,q){if(!a.length)return 0;const sorted=[...a].sort((x,y)=>x-y);return sorted[Math.floor((sorted.length-1)*q)]}
function median(a){return quantile(a,.5)}
function liveCalculation(){
 const arr=live.frames;if(arr.length<10)return;state.source=live.source==='REPLAY'?'TEST REPLAY · NOT HARDWARE':'Live ESP32 USB';
 const fields=['heel','midfoot','toe'];
 const offset=live.baseline||fields.map(k=>quantile(arr.map(f=>f[k]),.10));live.offset=offset;
 const processed=arr.map(f=>({...f,heel:Math.max(0,f.heel-offset[0]),midfoot:Math.max(0,f.midfoot-offset[1]),toe:Math.max(0,f.toe-offset[2])}));
 const totals=processed.map(f=>f.heel+f.midfoot+f.toe);
 // Robust dynamic range: ignore huge isolated noise spikes.
 live.amplitude=quantile(totals,.95)-quantile(totals,.1);
 let r=E.analyze(processed);
 if(live.amplitude<160){
   r=E.analyze(processed.map(f=>({...f,heel:0,midfoot:0,toe:0})));
   r.flags=['Pressure variation too small to identify reliable foot contacts'];
 }
 state.frames=arr;state.results=r;state.ml=ML?ML.predict(r):{valid:false,reason:'ML model unavailable'};
 state.cursor=arr.length-1;
 $('timeline').max=arr.length-1;$('timeline').value=state.cursor;
 $('sourceTag').textContent=live.source==='REPLAY'?'TEST REPLAY · NOT HARDWARE':'LIVE ESP32 · USB';
 $('sourceBadge').textContent=live.source==='REPLAY'?'TEST REPLAY':'LIVE ESP32';
 $('monitorSrc').textContent=live.source==='REPLAY'?'TEST REPLAY':'LIVE ESP32 USB';
 $('fileStatus').textContent=arr.length+' live samples / '+n(r.duration,1)+' seconds · '+(live.source==='REPLAY'?'TEST REPLAY':'ACTUAL USB')+' · '+r.events.length+' contact events';
 renderAll();updateLiveAnalysis();
}
function drawLive(){
 const f=state.kind==='live'?state.frames.at(-1):null;
 if(!f){$('liveFsrCards').innerHTML='<p class="recent-empty">Awaiting actual FSR sensor values…</p>';return;}
 $('liveFsrCards').innerHTML=[['Heel',f.heel],['Midfoot',f.midfoot],['Toe',f.toe]].map(([k,v])=>`<div class="live-sensor"><div><label>${k.toUpperCase()} · RAW ADC</label><b>${n(v,0)}</b></div><div class="track"><i style="width:${Math.min(100,v/4095*100)}%"></i></div></div>`).join('');
 $('liveImuCards').innerHTML=[['Accel X',f.ax],['Accel Y',f.ay],['Accel Z',f.az],['Gyro X',f.gx],['Gyro Y',f.gy],['Gyro Z',f.gz]].map(([k,v])=>`<div class="imu-tile"><small>${k}</small><b>${n(v,0)}</b></div>`).join('');
 if(state.results)drawChart($('liveChart'),'pressure');
 $('liveWindowLabel').textContent=live.frames.length+' LIVE SAMPLES';
}
function updateLiveAnalysis(){
 const r=state.results;if(!live.on||!r)return;
 const p=phase(state.frames.at(-1));
 $('livePhaseResult').textContent=p.label;
 $('liveCadenceResult').textContent=r.cadence!==null?n(r.cadence,0)+' steps/min':'Insufficient cycles';
 $('liveRhythmResult').textContent=r.consistency!==null?n(r.consistency,0)+' / 100':'Insufficient cycles';
 $('liveMLResult').textContent=state.ml?.valid?state.ml.label:'Insufficient gait features';
 $('liveFlagsResult').textContent=r.flags.length?r.flags.slice(0,2).join(' · '):'No rule flags';
 $('liveAnalysisTag').textContent=r.events.length<3?'NEED MORE CYCLES':state.ml?.valid?'EXPERIMENTAL ML':'RULE-BASED ONLY';
}
function liveStatus(z){
 live.status=z;live.bridge=true;live.source=z.source||'HARDWARE';if(live.on)state.source=live.source==='REPLAY'?'TEST REPLAY · NOT HARDWARE':'Live ESP32 USB';
 const fresh=Boolean(z.connected)&&z.last_age_s!==null&&z.last_age_s<3;
 const label=live.source==='REPLAY'?'TEST REPLAY · NOT HARDWARE':fresh?'LIVE ESP32 CONNECTED':z.port?'PORT OPEN / WAITING DATA':'ESP32 NOT CONNECTED';
 ['liveDot','navLiveDot'].forEach(k=>$(k).classList.toggle('on',fresh&&live.source==='HARDWARE'));
 $('liveTitle').textContent=label;$('liveSub').textContent=fresh?'Reading '+z.baud+' baud via Python USB serial bridge.':(z.error||'Waiting for real sensor readings.');
 $('livePort').textContent=z.port||z.requested_port||'—';$('liveSampleCount').textContent=(z.count||0).toLocaleString();
 $('liveAge').textContent=z.last_age_s===null?'—':z.last_age_s+'s';
 $('liveConnectionState').textContent=label;$('liveConnectionHelp').textContent=z.port||'No USB port chosen; refresh list or connect your ESP32';
 $('liveSourceKind').textContent=live.source==='REPLAY'?'REPLAY':'USB HARDWARE';
 $('liveBaud').textContent=z.baud||115200;$('liveTotal').textContent=(z.count||0).toLocaleString();$('liveBad').textContent=(z.bad||0).toLocaleString();
 $('liveLatency').textContent=z.last_age_s===null?'—':z.last_age_s+' sec';
 $('liveError').textContent=z.error||(fresh?'Receiving real sensor packets continuously.':'No fresh sensor packets yet.');
 $('liveError').classList.toggle('ok',fresh);
 $('liveRawLine').textContent=z.last_line||'Waiting for serial rows: time_s,heel,midfoot,toe,ax,ay,az,gx,gy,gz';
 if(live.on&&live.source==='HARDWARE'&&!fresh)$('sourceTag').textContent='ESP32 STREAM STALE';
 if(!live.on&&fresh)$('liveSub').textContent='ESP32 receiving; click "Resume live" to display actual data instead of current demo.';
}
async function refreshPorts(){
 try{const d=await (await fetch('/api/ports',{cache:'no-store'})).json();
 const el=$('livePortSelect');const old=el.value;
 el.innerHTML='<option value="">Auto-detect ESP32 USB</option>'+d.ports.map(v=>`<option value="${safe(v.device)}">${safe(v.device)} · ${safe(v.description)}</option>`).join('');
 el.value=[...el.options].some(o=>o.value===old)?old:(d.requested_port||'');
 }catch(e){toast('Local serial bridge not running — start START_LIVE_MAC.command',true)}
}
function handleLiveFrames(list){
 if(!live.on)return;
 for(const o of list){
   if(!o||!Number.isFinite(Number(o.heel))||!Number.isFinite(Number(o.midfoot))||!Number.isFinite(Number(o.toe)))continue;
   const f={t:Number(o.t),heel:Number(o.heel),midfoot:Number(o.midfoot),toe:Number(o.toe),
     ax:Number(o.ax)||0,ay:Number(o.ay)||0,az:Number(o.az)||0,gx:Number(o.gx)||0,gy:Number(o.gy)||0,gz:Number(o.gz)||0,imu:Math.abs(Number(o.ax)||0)+Math.abs(Number(o.ay)||0)+Math.abs(Number(o.az)||0)>0};
   if(live.frames.length&&f.t<live.frames.at(-1).t){live.frames=[];live.baseline=null;}
   live.frames.push(f);if(live.frames.length>1600)live.frames.splice(0,live.frames.length-1600);
 }
 live.lastFrameAt=Date.now();
 if(live.frames.length>=10&&Date.now()-live.lastAnalysis>850){live.lastAnalysis=Date.now();liveCalculation()}
 else if(live.frames.length&&Date.now()-live.lastRender>230){live.lastRender=Date.now();state.frames=live.frames;state.cursor=live.frames.length-1;renderFrame();}
}
async function bootLive(){
 try{
   const response=await fetch('/api/health',{cache:'no-store'});if(!response.ok)throw Error('No bridge');
   const z=await response.json();if(!z.ok)throw Error('No bridge');
   live.bridge=true;setLiveMode();liveStatus(z);await refreshPorts();
   if(live.stream)live.stream.close();
   live.stream=new EventSource('/api/stream');
   live.stream.addEventListener('status',e=>{try{liveStatus(JSON.parse(e.data))}catch(x){console.warn(x)}});
   live.stream.addEventListener('frames',e=>{try{handleLiveFrames(JSON.parse(e.data).frames||[])}catch(x){console.warn(x)}});
   live.stream.onerror=()=>{live.bridge=false;$('liveError').textContent='Bridge stream interrupted; reconnecting automatically...';$('liveTitle').textContent='USB STREAM RECONNECTING';};
 }catch(e){
   $('liveTitle').textContent='USB BRIDGE NOT RUNNING';$('liveSub').textContent='Launch START_LIVE_MAC.command for direct USB readings. Offline demo works separately.';
 }
}
$('liveRescanBtn').addEventListener('click',refreshPorts);
$('liveConnectBtn').addEventListener('click',async()=>{
 try{const response=await fetch('/api/port',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({port:$('livePortSelect').value})});
  const j=await response.json();if(!response.ok)throw Error(j.error||'Connection failed');setLiveMode();toast('Switching hardware port. Waiting for actual sensor rows...');
 }catch(e){toast('USB port error: '+e.message,true)}
});
$('liveResumeBtn').addEventListener('click',()=>{setLiveMode();toast('Live hardware mode activated — waiting for new ESP32 data.')});
$('liveCalibrateBtn').addEventListener('click',()=>{
 if(!live.on||live.frames.length<35){toast('Need at least 35 live sensor samples. Keep insole idle first.',true);return;}
 const a=live.frames.slice(-65);live.baseline=['heel','midfoot','toe'].map(k=>median(a.map(f=>f[k])));live.offset=live.baseline;
 $('liveCalibrationState').textContent='Baseline (ADC): Heel '+n(live.baseline[0],0)+' · Midfoot '+n(live.baseline[1],0)+' · Toe '+n(live.baseline[2],0)+' · keep the insole still during calibration.';
 liveCalculation();toast('Idle pressure offset calibrated from last '+a.length+' real readings.');
});
$('liveCsvBtn').addEventListener('click',()=>{if(!live.bridge){toast('Start local live bridge first.',true);return}location.href='/api/live.csv'});
$('liveResetBtn').addEventListener('click',async()=>{setLiveMode();try{await fetch('/api/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});toast('Live recording window reset.')}catch(e){toast('Bridge unavailable; local window cleared.',true)}});
// Desktop USB bridge auto activates when dashboard is served from its local API URL.
bootLive();

})();
