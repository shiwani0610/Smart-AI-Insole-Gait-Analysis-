/* SmartInsole signal analysis engine. Educational, deterministic, no trained model. */
(function(root){'use strict';
 const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
 const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
 const stdev=a=>a.length?Math.sqrt(avg(a.map(x=>(x-avg(a))**2))):0;
 const round=(n,d=1)=>Number.isFinite(n)?+(n.toFixed(d)):null;
 const number=(v,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback;};
 const names={heel:['heel','h','fsr1','heelpressure','fsr_heel'],midfoot:['midfoot','mid','m','fsr2','midpressure','fsr_mid'],toe:['toe','t','fsr3','toepressure','fsr_toe'],ax:['ax','accelx','acc_x','accel_x'],ay:['ay','accely','acc_y','accel_y'],az:['az','accelz','acc_z','accel_z'],gx:['gx','gyrox','gyro_x'],gy:['gy','gyroy','gyro_y'],gz:['gz','gyroz','gyro_z']};
 function row(input,t){return {t:number(t,0),heel:Math.max(0,number(input.heel)),midfoot:Math.max(0,number(input.midfoot)),toe:Math.max(0,number(input.toe)),ax:number(input.ax),ay:number(input.ay),az:number(input.az),gx:number(input.gx),gy:number(input.gy),gz:number(input.gz),imu:Number.isFinite(Number(input.az))};}
 function simulate(type='steady'){
  const variable=type==='irregular'; const rate=36; const out=[];let start=0;
  const pulse=(v,mu,s)=>Math.exp(-0.5*((v-mu)/s)**2);
  for(let c=0;c<15;c++){
   const duration=(variable?1.03+(0.20*Math.sin(c*1.71))+(c===6?.20:0):1.035+0.021*Math.sin(c*1.2));
   const count=Math.max(20,Math.round(duration*rate));
   for(let i=0;i<count;i++){
    const p=i/count;const swing=p>.65;const reverse=variable&&[4,9,12].includes(c);
    const heel= swing?0: Math.round((reverse?680:1720)*pulse(p,reverse?.38:.145,.10)+200*pulse(p,.29,.22));
    const mid=swing?0:Math.round(1130*pulse(p,.36,.13));
    const toe=swing?0:Math.round((reverse?1600:1660)*pulse(p,reverse?.13:.51,.09));
    const noise=18*Math.sin(i*2.53+c*7.1);
    out.push(row({heel:Math.max(0,heel+noise),midfoot:Math.max(0,mid+noise*.7),toe:Math.max(0,toe+noise*.8),ax:Math.round(2500*Math.sin(p*Math.PI*2)),ay:Math.round(2000*Math.cos(p*Math.PI*2)),az:Math.round(16384+3500*Math.sin(p*Math.PI*4)+500*Math.sin(c*1.2)),gx:Math.round(3700*Math.sin(p*6.28)),gy:Math.round(8000*Math.sin(p*6.28+.6)),gz:Math.round(2400*Math.cos(p*6.28))},start+i/rate));
   }
   start+=count/rate;
  }
  return out;
 }
 function parseLine(line,headers=null,frequency=30,index=0){
  if(!line||!line.trim())return null;
  let raw=line.trim();let obj={};
  if(raw.startsWith('{')){try{let d=JSON.parse(raw);const s=d.sensors&&typeof d.sensors==='object'?d.sensors:d;obj=Object.assign({},d,s);}
   catch(e){return null;}}
  else {const p=raw.split(/[,;\t]/).map(x=>x.trim());
    if(headers){headers.forEach((key,i)=>{obj[key]=p[i]});}
    else {if(p.length<3||p.slice(0,3).some(v=>!Number.isFinite(Number(v))))return null;
      const keys=['heel','midfoot','toe','ax','ay','az','gx','gy','gz','sum','steps','cadence','phase','ok'];keys.forEach((key,i)=>{obj[key]=p[i]});}
  }
  const lookup={};Object.entries(obj).forEach(([k,v])=>{lookup[k.toLowerCase().replace(/[\s-]/g,'').replaceAll('_','')]=v});
  let parsed={};for(const [k,aliases] of Object.entries(names)){let val;
   for(const a of aliases){let key=a.toLowerCase().replaceAll('_','');if(Object.prototype.hasOwnProperty.call(lookup,key)){val=lookup[key];break;}}
   parsed[k]=val===undefined? (['heel','midfoot','toe'].includes(k)?0:undefined):Number(val);
  }
  if(['heel','midfoot','toe'].every(k=>parsed[k]===0)&&!['heel','midfoot','toe','fsr1','fsr2','fsr3'].some(x=>x in lookup))return null;
  if(['heel','midfoot','toe'].some(k=>!Number.isFinite(parsed[k])))return null;
  let time=null; let ms=false;
  for(const key of ['t','times','time','seconds','timestamp','elapsed','timems','timestampms','elapsedms','milliseconds']){
    if(Object.prototype.hasOwnProperty.call(lookup,key)){const v=Number(lookup[key]);if(Number.isFinite(v)){time=v;ms=key.endsWith('ms')||key==='milliseconds';break;}}
  }
  if(time===null)time=index/Math.max(1,frequency);else if(ms)time/=1000;
  return row(parsed,time);
 }
 function parseCSV(text,rate=30){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!lines.length)throw Error('CSV file is empty.');
  const first=lines[0].split(/[,;\t]/);const hasHeader=first.slice(0,3).some(s=>!Number.isFinite(Number(s.trim())));
  const headers=hasHeader?first.map(s=>s.trim()):null;const result=[];const rejected=[];
  for(let i=hasHeader?1:0;i<lines.length;i++){let row=parseLine(lines[i],headers,rate,result.length);if(row)result.push(row);else rejected.push(i+1);}
  if(result.length<10)throw Error('Not enough usable sensor rows (need at least 10 with heel, midfoot and toe).');
  result.sort((a,b)=>a.t-b.t);const t0=result[0].t;result.forEach((f,i)=>{f.t=Math.max(0,f.t-t0);if(i&&!Number.isFinite(f.t))f.t=i/rate;});
  return {frames:result,rejected};
 }
 function analyze(frames){
  let r={frames:frames.length,contacts:[],phase:'Waiting',cadence:null,cycle:null,stance:null,swing:null,cv:null,consistency:null,heelToToe:null,zones:[0,0,0],flags:[],movement:null,integrity:0,duration:0,threshold:75,latest:null,events:[],peak:0};
  if(!frames.length)return r;
  const vals=frames.map(f=>Math.max(0,f.heel+f.midfoot+f.toe));const positives=vals.filter(x=>x>0).sort((a,b)=>a-b);
  const high=positives.length?positives[Math.floor(positives.length*.9)]:0;
  const threshold=Math.max(65,high*.13);r.threshold=threshold;
  let active=false;let current=null;let lastStart=-Infinity;let valid=0,haveIMU=0;let ztot=[0,0,0];
  for(let i=0;i<frames.length;i++){
   const f=frames[i],sum=vals[i],isContact=sum>=threshold;
   if([f.heel,f.midfoot,f.toe].every(x=>Number.isFinite(x)&&x>=0))valid++;
   if(f.imu&&Number.isFinite(f.az))haveIMU++;
   if(isContact){ztot[0]+=f.heel;ztot[1]+=f.midfoot;ztot[2]+=f.toe;}
   if(isContact&&!active&&f.t-lastStart>.37){active=true;lastStart=f.t; current={start:f.t,end:null,maxH:-1,maxT:-1,heelAt:null,toeAt:null,first: f.heel>=f.midfoot&&f.heel>=f.toe?'Heel':f.toe>=f.midfoot?'Toe':'Midfoot'};}
   if(active&&isContact&&current){if(f.heel>current.maxH){current.maxH=f.heel;current.heelAt=f.t;}if(f.toe>current.maxT){current.maxT=f.toe;current.toeAt=f.t;}}
   if(active&&!isContact&&current){current.end=f.t;current.stance=f.t-current.start;r.events.push(current);current=null;active=false;}
  }
  if(current)r.events.push(current);
  const cycles=[];for(let i=1;i<r.events.length;i++){const v=r.events[i].start-r.events[i-1].start;if(v>=.4&&v<=3.5)cycles.push(v);}
  r.contacts=r.events;r.zones=ztot;r.peak=Math.max(...vals);r.latest=frames[frames.length-1];r.duration=frames.at(-1).t-frames[0].t;
  let total=ztot.reduce((a,b)=>a+b,0);r.zonePct=total?ztot.map(x=>100*x/total):[0,0,0];
  if(cycles.length>=2){r.cycle=avg(cycles);r.cadence=120/r.cycle;} // Assumes alternating steps between same-foot cycles.
  if(cycles.length>=3){r.cv=stdev(cycles)/avg(cycles)*100;r.consistency=clamp(100-r.cv*2,0,100);}
  const ratios=[];for(let i=0;i<r.events.length-1;i++){let e=r.events[i],interval=r.events[i+1].start-e.start;if(e.end!==null&&interval>.3&&interval<3.5)ratios.push(100*clamp(e.stance/interval,0,1));}
  if(ratios.length>=2){r.stance=avg(ratios);r.swing=100-r.stance;}
  const finished=r.events.filter(e=>e.end!==null&&e.maxH>Math.max(60,threshold*.24)&&e.maxT>Math.max(60,threshold*.24));
  if(finished.length>=3)r.heelToToe=finished.filter(e=>e.toeAt>e.heelAt+.025).length/finished.length*100;
  const f=frames.at(-1);const c=f.heel+f.midfoot+f.toe>=threshold;
  r.phase=!c?'SWING':f.heel>f.toe*1.2&&f.heel>=f.midfoot?'HEEL CONTACT':f.toe>f.heel*1.22&&f.toe>=f.midfoot?'TOE PUSH-OFF':'MID-STANCE';
  r.integrity=100*(.7*valid/frames.length+.3*haveIMU/frames.length);
  r.movement=frames.length?Math.max(...frames.map(f=>f.az))-Math.min(...frames.map(f=>f.az)):null;
  if(r.cv!==null&&r.cv>12)r.flags.push('Variable cycle timing');
  if(r.heelToToe!==null&&r.heelToToe<65)r.flags.push('Weak heel-to-toe progression');
  if(r.stance!==null&&(r.stance<34||r.stance>79))r.flags.push('Unusual contact duration');
  if(high===0)r.flags.push('No FSR pressure detected');
  if(!haveIMU)r.flags.push('IMU readings unavailable');
  return r;
 }
 root.GaitEngine={simulate,parseLine,parseCSV,analyze,round,clamp,avg};
})(window);
