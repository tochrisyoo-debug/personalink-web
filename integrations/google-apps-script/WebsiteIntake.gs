/**
 * Persona Link website -> Gmail -> Google Sheets CRM intake.
 *
 * INSTALLATION (not active until an owner installs a time trigger):
 * 1. Open https://script.google.com while signed in as chris.yoo@personalink.me.
 * 2. Create a PRIVATE standalone Apps Script project.
 * 3. Paste this file into Code.gs.
 * 4. Set Script Properties: CRM_SPREADSHEET_ID = private CRM spreadsheet ID.
 * 5. Execute previewWebsiteIntake(), review logs, then installWebsiteIntakeTrigger().
 * 6. Verify with a consenting test candidate and employer submission, then audit Sheets.
 *
 * No credentials, private CRM IDs, or candidate files belong in the public GitHub repository.
 * The published website continues to submit via FormSubmit to annie@personalink.me.
 * The mailbox forwarding route to chris.yoo@personalink.me must remain in place.
 * No automatic outbound email, SMS, client submission, or job-board publication.
 */
const PL_INTAKE = Object.freeze({
  formSender: 'submissions@formsubmit.co',
  recipient: 'annie@personalink.me',
  intakeSheet: '웹사이트 접수함',
  candidatesSheet: 'CRM Automation',
  atsSheet: 'ATS 지원 현황',
  ordersSheet: '채용오더 상세',
  labelProcessed: 'PersonaLink/WebsiteIntake/Processed',
  maxMessages: 100,
  daysBack: 14,
  maxAttachmentBytes: 15 * 1024 * 1024
});

// Map public job IDs to internal CRM positions using PRIVATE Script Properties only.
// Never publish customer or order identifiers in the public GitHub repository.
function plJobMap_() {
  const props=PropertiesService.getScriptProperties();
  return {
    'PL-JOB-2026-ME01': {orderId:props.getProperty('ORDER_ID_MECH')||'',title:'Mechanical Field Engineer',discipline:'Mechanical'},
    'PL-JOB-2026-EE01': {orderId:props.getProperty('ORDER_ID_ELEC')||'',title:'Electrical Field Engineer',discipline:'Electrical'},
    'PL-JOB-2026-HSE01': {orderId:props.getProperty('ORDER_ID_SAFETY')||'',title:'Safety / HSE Manager',discipline:'Safety'}
  };
}

function plSheets_() {
  const id = PropertiesService.getScriptProperties().getProperty('CRM_SPREADSHEET_ID');
  if (!id) throw new Error('Set CRM_SPREADSHEET_ID in Script Properties; do not embed it in public source.');
  const ss = SpreadsheetApp.openById(id);
  const result = {};
  const required = {
    intake:PL_INTAKE.intakeSheet,
    candidates:PL_INTAKE.candidatesSheet,
    ats:PL_INTAKE.atsSheet,
    orders:PL_INTAKE.ordersSheet
  };
  Object.keys(required).forEach(function(key) {
    const sheet = ss.getSheetByName(required[key]);
    if (!sheet) throw new Error('Required CRM tab is missing: ' + required[key]);
    result[key] = sheet;
  });
  return result;
}

function plQuery_() {
  return 'from:' + PL_INTAKE.formSender + ' to:' + PL_INTAKE.recipient +
    ' newer_than:' + PL_INTAKE.daysBack + 'd -in:trash -in:spam';
}

function plKind_(subject) {
  if (/New Candidate Resume Application|Candidate Resume Application/i.test(subject)) return 'candidate';
  if (/New Employer Hiring Request|Employer Hiring Request/i.test(subject)) return 'employer';
  return null;
}

function plText_(x) {
  return String(x == null ? '' : x).trim().replace(/\u0000/g,'').slice(0,15000);
}
function plCell_(v) {
  const s = plText_(v);
  // SetValues treats a leading "=" as a formula, so explicitly store untrusted input as text.
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function plName_(n) { return plText_(n).toLowerCase().replace(/\s+/g,' '); }
function plEmail_(e) { return plText_(e).toLowerCase(); }
function plPhone_(p) { return plText_(p).replace(/[^\d]/g,''); }
function plDate_() { return Utilities.formatDate(new Date(), 'America/New_York','yyyy-MM-dd HH:mm'); }
function plDateOnly_() { return Utilities.formatDate(new Date(), 'America/New_York','yyyy-MM-dd'); }

function plParseFields_(body) {
  const keys = [
    'Candidate_Name','Candidate_Email','Candidate_Phone','Phone_Number',
    'Candidate_Location','Candidate_Specialty','Candidate_Notes','Applied_Position_ID','Candidate_Data_Consent',
    'Company_Name','Contact_Name','Business_Email','Job_Title_Needed',
    'Industry_Category','Number_of_Openings','Job_Location','Target_Salary_Range',
    'Hiring_Urgency','Bilingual_Requirement','Work_Authorization','Employer_Data_Consent',
    'Job_Details_Notes','Job_Details_/_Notes','Attached_Job_Description'
  ];
  const lines = plText_(body).split(/\r?\n/).map(function(x){ return x.trim(); }).filter(Boolean);
  const fields = {};
  const set = new Set(keys);
  for (let i=0; i<lines.length; i++) {
    const key = lines[i];
    if (!set.has(key)) continue;
    const next = lines[i+1] || '';
    fields[key] = (!set.has(next) && !/^Submitted at\b|^\[Sponsor\]/i.test(next)) ? plText_(next) : '';
  }
  return fields;
}

function plMessages_() {
  const threads = GmailApp.search(plQuery_(),0,PL_INTAKE.maxMessages);
  const unique = {};
  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(msg) {
      if (!plKind_(msg.getSubject())) return;
      if (!/submissions@formsubmit\.co/i.test(msg.getFrom())) return;
      if (!/annie@personalink\.me/i.test(msg.getTo())) return;
      unique[msg.getId()] = msg;
    });
  });
  return Object.keys(unique).map(function(k){ return unique[k]; })
    .sort(function(a,b){ return a.getDate().getTime()-b.getDate().getTime(); });
}

function previewWebsiteIntake() {
  const found = plMessages_();
  const report = found.slice(-15).map(function(m) {
    const f = plParseFields_(m.getPlainBody());
    return {
      gmailMessageId: m.getId(),
      kind: plKind_(m.getSubject()),
      subject: m.getSubject(),
      candidate: f.Candidate_Name || '',
      company: f.Company_Name || '',
      appliedPositionId: f.Applied_Position_ID || '',
      attachmentCount: m.getAttachments({includeInlineImages:false}).length
    };
  });
  Logger.log(JSON.stringify(report,null,2));
  return report; // Read-only preview. No CRM changes, no outgoing messages.
}

function plFindIntakeRow_(sheet, gmailId) {
  const last=sheet.getLastRow();
  if (last<2) return 0;
  const ids=sheet.getRange(2,2,last-1,1).getDisplayValues();
  for(let i=0;i<ids.length;i++) if(ids[i][0]===gmailId) return i+2;
  return 0;
}

function plSaveAttachments_(msg) {
  const attachments=msg.getAttachments({includeInlineImages:false});
  if (!attachments.length) return {urls:[], warnings:['No PDF or Word file attached; manual attachment verification needed.']};
  const props=PropertiesService.getScriptProperties();
  let fid=props.getProperty('INTAKE_PRIVATE_FOLDER_ID');
  let folder;
  if(fid) folder=DriveApp.getFolderById(fid);
  else {
    folder=DriveApp.createFolder('Persona Link Website Submissions PRIVATE');
    props.setProperty('INTAKE_PRIVATE_FOLDER_ID',folder.getId());
  }
  const urls=[], warnings=[];
  attachments.forEach(function(att){
    const original=plText_(att.getName()).replace(/[^a-zA-Z0-9._\-\u3131-\uD7A3 ]/g,'_').slice(0,110);
    const isFile=/\.(pdf|doc|docx)$/i.test(original);
    if(!isFile || att.getSize()>PL_INTAKE.maxAttachmentBytes){
      warnings.push('Attachment skipped: unsupported extension or over 15 MB ('+ original +')');
      return;
    }
    const safeName='web_'+msg.getId()+'_'+original;
    const matches=folder.getFilesByName(safeName);
    const file=matches.hasNext() ? matches.next() : folder.createFile(att.copyBlob().setName(safeName));
    // PRIVATE: never call setSharing(ANYONE,...) or publish the URL.
    urls.push(file.getUrl());
  });
  return {urls:urls,warnings:warnings};
}

function plEnsureRoom_(sheet,row) {
  if(row>sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),row-sheet.getMaxRows());
}

function plExistingCandidate_(sheet,name,email,phone) {
  const last=sheet.getLastRow();
  if(last<2) return {kind:'new',maxId:0};
  const values=sheet.getRange(2,1,last-1,7).getDisplayValues();
  const needleName=plName_(name), needleEmail=plEmail_(email), needlePhone=plPhone_(phone);
  let maxId=0; const firmMatches=[], collisions=[];
  values.forEach(function(row,i) {
    const id=plText_(row[0]), m=id.match(/^PL-(\d+)$/);
    if(m) maxId=Math.max(maxId,Number(m[1]));
    if(!id) return;
    const sameName=plName_(row[3])===needleName;
    const sameEmail=needleEmail && plEmail_(row[4])===needleEmail;
    const samePhone=needlePhone && plPhone_(row[5])===needlePhone;
    if((sameEmail||samePhone)&&sameName) firmMatches.push({id:id,row:i+2});
    else if(sameEmail||samePhone) collisions.push({id:id,row:i+2});
  });
  if(collisions.length || firmMatches.length>1) return {kind:'review',reason:'Conflicting or multiple email/phone matches'};
  if(firmMatches.length===1) return {kind:'matched',id:firmMatches[0].id,row:firmMatches[0].row};
  return {kind:'new',maxId:maxId};
}

function plAddCandidate_(sheet,fields,intakeRow,attachments) {
  const name=fields.Candidate_Name, email=fields.Candidate_Email;
  if (fields.Candidate_Data_Consent !== 'Yes') return {kind:'review',reason:'Applicant privacy consent not confirmed'};
  const phone=fields.Candidate_Phone || fields.Phone_Number || '';
  if(!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return {kind:'review',reason:'Name or valid email missing'};
  const found=plExistingCandidate_(sheet,name,email,phone);
  if(found.kind==='review') return found;
  if(found.kind==='matched') {
    // Existing record is preserved; add applicant's new source to the intake log only.
    return {kind:'matched',id:found.id,reason:'Existing candidate; original CRM data not overwritten'};
  }
  const last=sheet.getLastRow(), row=last+1;
  plEnsureRoom_(sheet,row);
  const id='PL-'+String(found.maxId+1).padStart(5,'0');
  const jobId=plText_(fields.Applied_Position_ID);
  const job=plJobMap_()[jobId];
  const values=Array(37).fill('');
  values[0]=id;
  values[1]='Persona Link website form';
  values[2]=String(intakeRow);
  values[3]=name;
  values[4]=email;
  values[5]=phone;
  values[6]=fields.Candidate_Location || '';
  values[8]=job?job.title:jobId;
  values[9]=job?job.discipline:'미확인';
  values[17]=attachments.urls[0] || '';
  values[20]='New';
  values[23]='NO';
  values[28]='NO';
  values[31]='NO';
  values[33]='Website candidate application received '+plDate_()+' ET; Job ID: '+jobId+
      '. Duplicate checked using exact name plus email/phone. Additional employer disclosure, candidate consent and recruiter approval needed before client submission.';
  sheet.getRange(row,1,1,37).setValues([values.map(plCell_)]);
  return {kind:'created',id:id,row:row};
}

function plCreateAts_(sheet,fields,candidateId) {
  const webId=plText_(fields.Applied_Position_ID);
  const job=plJobMap_()[webId];
  if(!job || !job.orderId) return {key:'',note:'Talent-network listing or missing private internal position ID: ATS entry deferred for review'};
  const last=sheet.getLastRow();
  if(last>3) {
    const existing=sheet.getRange(4,3,last-3,3).getDisplayValues(); // C position, D title, E candidate ID
    if(existing.some(function(r){return r[0]===job.orderId&&r[2]===candidateId;}))
      return {key:job.orderId+'-'+candidateId,note:'Existing ATS application retained, no duplicate'};
  }
  const ids=last>3 ? sheet.getRange(4,1,last-3,1).getDisplayValues() : [];
  let row=4;
  ids.forEach(function(value,i){ if(value[0]) row=5+i; });
  plEnsureRoom_(sheet,row);
  const vals=Array(14).fill('');
  vals[0]=job.orderId+'-'+candidateId;
  vals[2]=job.orderId;
  vals[3]=job.title;
  vals[4]=candidateId;
  vals[5]=fields.Candidate_Name || '';
  vals[6]='후보 검토';
  vals[7]=plDateOnly_();
  vals[8]='홈페이지 지원 이력서 확인, 사전 인터뷰 및 취업자격·근무지 확인';
  vals[10]='Chris Yoo';
  vals[11]='미획득';
  vals[12]='Website application; position '+webId;
  vals[13]='Applicant self-submitted on website. Do not disclose internal client name or submit resume to employer without informed consent and recruiter approval.';
  sheet.getRange(row,1,1,14).setValues([vals.map(plCell_)]);
  return {key:vals[0],note:'ATS review stage created'};
}

function plCreateOrder_(sheet,fields,msg,attachments) {
  const company=plText_(fields.Company_Name),title=plText_(fields.Job_Title_Needed);
  if (fields.Employer_Data_Consent !== 'Yes') return {kind:'review',reason:'Employer submission authorization not confirmed'};
  const email=plEmail_(fields.Business_Email);
  if(!company||!title||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return {kind:'review',reason:'Employer company, role or valid contact email missing'};
  const sourceKey='WEB-'+msg.getId();
  const existingIds=sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,1).getDisplayValues().map(function(x){return x[0];}):[];
  if(existingIds.indexOf(sourceKey)!==-1) return {kind:'matched',id:sourceKey,reason:'Same Gmail submission already in orders'};
  const row=sheet.getLastRow()+1;plEnsureRoom_(sheet,row);
  const vals=Array(28).fill('');
  vals[0]=sourceKey;
  vals[1]=company;
  vals[2]=email;
  vals[3]=plDateOnly_();
  vals[4]=attachments.urls[0] || 'Website hiring request form; Gmail message '+msg.getId();
  vals[5]=fields.Job_Details_Notes || fields['Job_Details_/_Notes'] || 'Job title: '+title;
  vals[6]='JD review required; do not invent missing requirements';
  vals[10]=fields.Job_Location || '';
  vals[14]=fields.Bilingual_Requirement || '';
  vals[15]=fields.Work_Authorization || '';
  vals[18]='확인 필요';
  vals[19]='미승인';
  vals[20]='미확인';
  vals[23]='Website submission; requested title: '+title+
    '; contact '+(fields.Contact_Name||'')+'; phone '+(fields.Phone_Number||'')+
    '; openings '+(fields.Number_of_Openings||'')+'; salary as submitted '+(fields.Target_Salary_Range||'')+
    '; urgency '+(fields.Hiring_Urgency||'')+'; industry '+(fields.Industry_Category||'')+
    '; Gmail ID '+msg.getId()+'. Verify company, contract and JD before approval.';
  vals[24]='신규 문의 · 확인 대기';
  vals[26]='고객사 권한·수수료 계약·원본 JD 확인 필요';
  vals[27]='게시 미승인; 공개 금지';
  sheet.getRange(row,1,1,28).setValues([vals.map(plCell_)]);
  return {kind:'created',id:sourceKey,row:row};
}

function syncWebsiteIntake() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(30000)) throw new Error('Another intake sync is in progress');
  const processed=GmailApp.getUserLabelByName(PL_INTAKE.labelProcessed) ||
    GmailApp.createLabel(PL_INTAKE.labelProcessed);
  try {
    const sheets=plSheets_();
    const messages=plMessages_();
    const result={processed:0,review:0,skipped:0,errors:0};
    messages.forEach(function(msg){
      const id=msg.getId();
      const kind=plKind_(msg.getSubject());
      if(!kind){result.skipped++;return;}
      if(msg.getThread().getLabels().some(function(l){return l.getName()===PL_INTAKE.labelProcessed;})) {
        // Still double-check intake ID: one thread can hold multiple submitted forms.
        if(plFindIntakeRow_(sheets.intake,id)){result.skipped++;return;}
      }
      let entry=plFindIntakeRow_(sheets.intake,id);
      let form=plParseFields_(msg.getPlainBody());
      if(!entry) {
        entry=sheets.intake.getLastRow()+1;plEnsureRoom_(sheets.intake,entry);
        const data=[
          'WEB-'+id,id,kind,plDate_(),form.Candidate_Name||form.Contact_Name||'',
          form.Company_Name||'',form.Candidate_Email||form.Business_Email||'',
          form.Candidate_Phone||form.Phone_Number||'',form.Applied_Position_ID||'',
          form.Job_Title_Needed||'','', '접수 · 처리 대기','','','', 'Gmail: '+msg.getSubject()
        ];
        sheets.intake.getRange(entry,1,1,16).setValues([data.map(plCell_)]);
        SpreadsheetApp.flush();
      }
      try {
        const authorized = kind==='candidate' ? form.Candidate_Data_Consent==='Yes' : form.Employer_Data_Consent==='Yes';
        const attachment=authorized ? plSaveAttachments_(msg) : {urls:[],warnings:['Consent or authorization requires review']};
        const urls=attachment.urls;
        let registration;
        let ats='';
        if(kind==='candidate') {
          registration=plAddCandidate_(sheets.candidates,form,entry,attachment);
          if(registration.id) {
            const atsRes=plCreateAts_(sheets.ats,form,registration.id);
            ats=atsRes.key;
          }
        } else {
          registration=plCreateOrder_(sheets.orders,form,msg,attachment);
        }
        const state=registration.kind==='review'?'검토 필요': 'CRM 연결됨 · 후속 검토';
        const comments=(registration.reason||'')+'; '+attachment.warnings.join('; ');
        sheets.intake.getRange(entry,11,1,6).setValues([[
          plCell_(urls.join(' | ')),state,plCell_(registration.id||''),
          plCell_(ats),plCell_(comments),plCell_('Gmail '+id+'; '+msg.getSubject())
        ]]);
        msg.getThread().addLabel(processed);
        if(registration.kind==='review') result.review++;
        else result.processed++;
      } catch(err) {
        sheets.intake.getRange(entry,12,1,4).setValues([[
          '처리 오류 · 재검토 필요','','',plCell_(String(err))
        ]]);
        result.errors++;
      }
    });
    Logger.log(JSON.stringify(result));
    return result;
  } finally {lock.releaseLock();}
}

function installWebsiteIntakeTrigger() {
  // Must be run explicitly by the CRM account owner, after preview and OAuth review.
  plSheets_();
  const triggers=ScriptApp.getProjectTriggers().filter(function(t){
    return t.getHandlerFunction()==='syncWebsiteIntake';
  });
  if (!triggers.length) ScriptApp.newTrigger('syncWebsiteIntake').timeBased().everyMinutes(15).create();
  return 'Installed/verified 15-minute Gmail-to-CRM intake trigger; check execution history after test submissions.';
}
