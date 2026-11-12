/* Reproducible synthetic augmentation for an EDUCATIONAL model only.
   No physical sensor recordings or clinical labels used. */
const fs=require('fs'),vm=require('vm');
const context={window:{}};vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/../js/analysis.js','utf8'),context);
const E=context.window.GaitEngine;
let seed=20261103;
const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296};
const rand=(lo,hi)=>lo+(hi-lo)*rng();
const featureNames=['cadence','cycle_s','stance_pct','consistency_index','timing_cv_pct','heel_to_toe_pct','heel_share','midfoot_share','toe_share','alerts'];
const feats=r=>[r.cadence,r.cycle,r.stance,r.consistency,r.cv,r.heelToToe,...(r.zonePct||[]),r.flags.length].map(x=>Number.isFinite(x)?x:0);
function augment(type){
 const base=E.simulate(type);const rateScale=rand(.82,1.22);const noise=rand(.01,.09);const hScale=rand(.75,1.25),mScale=rand(.78,1.2),tScale=rand(.75,1.3);
 const phase=rand(0,2*Math.PI);const local=[];
 for(const f of base){const period=Math.floor(f.t*1.00);const wiggle=type==='irregular'?Math.sin(period*1.23+phase)*.033:Math.sin(period*.71+phase)*.004;
  const t=f.t*rateScale+wiggle;
  const obj={...f,t,heel:Math.max(0,f.heel*hScale*(1+noise*Math.sin(f.t*9.1+phase))),midfoot:Math.max(0,f.midfoot*mScale*(1+noise*Math.sin(f.t*11.2+phase))),toe:Math.max(0,f.toe*tScale*(1+noise*Math.cos(f.t*8.6+phase)))};
  local.push(obj);
 }
 local.sort((a,b)=>a.t-b.t);
 const s=local[0].t;local.forEach(x=>x.t-=s);
 return E.analyze(local);
}
const rows=[];
for(const label of ['steady','irregular'])for(let i=0;i<220;i++){const analysis=augment(label);rows.push({label,features:feats(analysis)})}
fs.writeFileSync(__dirname+'/synthetic_features.json',JSON.stringify({featureNames,rows},null,0));
console.log('Created '+rows.length+' synthetic recordings; NO human subjects or real hardware data');
