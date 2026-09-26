import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, validateTask } from '../dist/benchmark/runner.js';

const task = {
  id:'t1', version:'1', family:'software', difficulty:8, mission:'real task',
  hardRequirements:['req'], evaluation:{evaluator:'external',requiredEvidence:['evidence']}
};

test('benchmark task validation rejects incomplete definitions',()=>{
  assert.throws(()=>validateTask({...task, hardRequirements:[]}));
});

test('benchmark report does not claim lift when baseline ERTS is zero',()=>{
  const runs=[
    {runId:'1',taskId:'t1',target:'single-model',success:false,costUsd:1,latencyMs:100,criticalFailure:true,requirementsSatisfied:0,requirementsTotal:1,metadata:{}},
    {runId:'2',taskId:'t1',target:'sheol',success:true,costUsd:2,latencyMs:200,criticalFailure:false,requirementsSatisfied:1,requirementsTotal:1,metadata:{}}
  ];
  const report=buildReport('v1',[task],runs);
  assert.equal(report.summaries.find(x=>x.target==='single-model')?.ertS,0);
  assert.equal(report.relativeLift,undefined);
});
