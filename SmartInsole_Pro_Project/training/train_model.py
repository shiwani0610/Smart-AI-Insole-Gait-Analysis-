"""Demonstration RandomForest gait pattern model trained on SYNTHETIC data only.
It cannot establish medical validity or real-gait accuracy. Never label as clinical AI.
Requires: python -m pip install scikit-learn numpy
"""
from pathlib import Path
import json, subprocess
import joblib
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

HERE=Path(__file__).resolve().parent
subprocess.run(['node',str(HERE/'create_training_features.js')],check=True)
obj=json.loads((HERE/'synthetic_features.json').read_text())
X=np.array([r['features'] for r in obj['rows']],float)
y=np.array([1 if r['label']=='irregular' else 0 for r in obj['rows']],int)
Xtrain,Xtest,ytrain,ytest=train_test_split(X,y,test_size=.25,random_state=42,stratify=y)
model=RandomForestClassifier(n_estimators=36,max_depth=6,min_samples_leaf=3,random_state=42)
model.fit(Xtrain,ytrain)
pred=model.predict(Xtest)
acc=accuracy_score(ytest,pred)
cm=confusion_matrix(ytest,pred).tolist()
# sklearn uses class ordering [0,1]; each leaf stores class fractions.
trees=[]
for estimator in model.estimators_:
 t=estimator.tree_
 # Normalize leaf histograms because sklearn versions can differ in output convention.
 counts=t.value[:,0,:]
 p1=(counts[:,1]/np.maximum(1e-12,counts.sum(axis=1))).tolist()
 trees.append({'feature':t.feature.tolist(),'threshold':np.round(t.threshold,6).tolist(),'left':t.children_left.tolist(),'right':t.children_right.tolist(),'p1':np.round(p1,6).tolist()})
asset={'metadata':{'title':'Synthetic-trained Random Forest (EDUCATIONAL ONLY)','training_source':'440 algorithm-generated synthetic gait recordings; no human, patient or physical-sensor training data','feature_names':obj['featureNames'],'classes':['synthetic steady-like','synthetic irregular-like'],'synthetic_test_samples':len(ytest),'synthetic_holdout_accuracy':round(float(acc),4),'synthetic_confusion_matrix':cm,'limitation':'Synthetic split accuracy is NOT an estimate of real-world gait accuracy.'},'trees':trees}
joblib.dump(model,HERE/'smartinsole_synthetic_random_forest.joblib')
(HERE.parent/'js'/'ml_model.js').write_text('/* AUTO-GENERATED MODEL: trained on SYNTHETIC gait patterns; NOT clinical AI. */\nwindow.SyntheticGaitModel='+json.dumps(asset,separators=(',',':'))+';\n')
(HERE/'synthetic_model_evaluation.json').write_text(json.dumps(asset['metadata'],indent=2))
(HERE/'requirements.txt').write_text('numpy>=1.24\nscikit-learn>=1.2\n')
print(json.dumps(asset['metadata'],indent=2))
