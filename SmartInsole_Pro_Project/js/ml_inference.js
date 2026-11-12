/* Synthetic-trained RandomForest inference; fully local, no Python server required at runtime. */
(function(root){'use strict';
 function features(r){return [r.cadence,r.cycle,r.stance,r.consistency,r.cv,r.heelToToe,...(r.zonePct||[0,0,0]),r.flags.length].map(v=>Number.isFinite(v)?v:0)}
 function predict(r){const M=root.SyntheticGaitModel;
 if(!M||!M.trees?.length)return {valid:false,reason:'Trained model file missing. Keep js/ml_model.js inside project.'};
 if(!r||r.events.length<4||!Number.isFinite(r.cv)||!Number.isFinite(r.heelToToe))return {valid:false,reason:'Need at least four detected contacts and usable cycle timing to classify this recording.'};
 const x=features(r),ps=M.trees.map(t=>{let i=0,guard=0;while(t.feature[i]>=0&&guard++<256)i=x[t.feature[i]]<=t.threshold[i]?t.left[i]:t.right[i];return Math.max(0,Math.min(1,t.p1[i]))});
 const irregular=ps.reduce((a,b)=>a+b,0)/ps.length,cls=irregular>=.5?'Synthetic irregular-like':'Synthetic steady-like';
 const vote=100*(irregular>=.5?irregular:1-irregular);
 return {valid:true,label:cls,irregularProbability:irregular,modelScore:vote,features:x,trees:M.trees.length,source:'Model trained exclusively on simulated gait recordings',note:'Score is an ensemble class score, not calibrated real-world confidence or clinical accuracy.'};
 }
 root.GaitML={predict,features};
})(window);
