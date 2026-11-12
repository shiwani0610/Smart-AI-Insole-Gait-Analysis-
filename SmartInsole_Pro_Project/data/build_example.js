// Optional dataset builder. Node.js is used only to regenerate the sample CSV files.
const fs=require('fs'),vm=require('vm'),path=require('path');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/analysis.js'),'utf8'),ctx);
for(const kind of ['steady','irregular']){
 const rows=ctx.window.GaitEngine.simulate(kind);
 const cols=['time_s','heel','midfoot','toe','ax','ay','az','gx','gy','gz'];
 const data=[cols.join(','),...rows.map(r=>cols.map(k=>k==='time_s'?r.t.toFixed(3):Math.round(r[k])).join(','))].join('\n');
 fs.writeFileSync(path.join(__dirname,kind+'_sensor_recording.csv'),data);
 console.log(kind,rows.length,ctx.window.GaitEngine.analyze(rows).consistency);
}
