# Persona Link: Website Intake → Recruiting CRM

**Implementation status (2026-11-23): SOURCE PREPARED; NOT LIVE UNTIL THE OWNER INSTALLS THE SCRIPT.**

This integration reuses the **existing personalink.me website**, **FormSubmit**, and the **existing Annie → Chris Gmail forwarding**. It does **not** replace `annie@personalink.me` or change Google Workspace forwarding rules. No API keys or client names belong in this public GitHub repository.

## How the system is intended to work

1. Candidate submits their name, email, optional phone/location, job ID and PDF/DOC/DOCX through [Careers](https://personalink.me/#jobs). The candidate must agree to the privacy consent box.
2. Employer submits a hiring request and optionally attaches a JD through [Employer Request](https://personalink.me/#request-talent), with an authorization checkbox.
3. FormSubmit emails **annie@personalink.me** (existing form endpoint). Existing Workspace forwarding delivers these messages to **chris.yoo@personalink.me**.
4. When installed, the Apps Script owned by Chris scans *only* matching FormSubmit submission emails (not arbitrary Gmail), checks consent, saves supported files in a private Google Drive folder and logs the original Gmail message ID to the **웹사이트 접수함** tab.
5. For candidate resumes, it matches **exact normalized full name AND email or phone**. Ambiguous matches are flagged for manual review; existing candidate records are not overwritten. New valid candidates enter `CRM Automation` with status `New`; active job IDs can enter `ATS 지원 현황` with stage `후보 검토` and client-submission consent `미획득`. Talent-network listings remain prospect registrations, not confirmed vacancies.
6. For employer JDs, it writes a **new inquiry** in `채용오더 상세` with `공고 게시 승인 = 미승인`, leaving employer identity internal-only.
7. It never automatically sends outbound Gmail/SMS, publicly posts a client JD or submits candidate resumes to a client.

## One-time installation (owner action required)

1. Sign in to **Google Apps Script** as `chris.yoo@personalink.me` at https://script.google.com and create a **private standalone project** named `Persona Link Website Intake`. This is required because the current connected tools cannot grant Google Apps Script execution permissions.
2. Copy [WebsiteIntake.gs](./WebsiteIntake.gs) into `Code.gs`.
3. Open **Project Settings → Script properties**, and add these keys:
   - `CRM_SPREADSHEET_ID`: the spreadsheet ID from your private Persona Link Recruiting CRM Google Sheet URL.
   - `ORDER_ID_MECH`: exact **채용오더 상세** position ID for Mechanical (column A).
   - `ORDER_ID_ELEC`: exact **채용오더 상세** position ID for Electrical.
   - `ORDER_ID_SAFETY`: exact **채용오더 상세** position ID for Safety / HSE.
   - Optional `INTAKE_PRIVATE_FOLDER_ID`: ID of a **private** Google Drive folder for website application/JD uploads. If blank, a new private owner-only folder is created in Chris's Drive on first attachment.
4. In Apps Script select `previewWebsiteIntake` and press **Run**. Review OAuth access to Gmail, Drive and Sheets; review **Executions/Logs**. Preview only lists potential form emails; it never inserts records or sends messages.
5. Verify your spreadsheet has these exact tabs: **웹사이트 접수함**, **CRM Automation**, **ATS 지원 현황**, **채용오더 상세**.
6. In a **test copy of the CRM** (not your production candidate list), submit consented test candidate and employer form data, run `syncWebsiteIntake`, and verify matching, attachments, duplicate detection and private permissions. Do not create fake candidates in the production CRM.
7. After testing with the production CRM ID, run `installWebsiteIntakeTrigger`. It installs a 15-minute scheduled check in **your own Google account**. Confirm the trigger is enabled on the Apps Script **Triggers** page and review the first executions for errors.
8. To stop ingestion, disable/delete the `syncWebsiteIntake` trigger in Apps Script. This does not affect FormSubmit or normal email forwarding.

## Source, permissions and deployment

- The original website uses the existing `action="https://formsubmit.co/annie@personalink.me"`. No external URL or forwarding rule is changed by this integration.
- The website has been updated in GitHub with optional candidate phone/location and consent fields, plus employer authorization and a privacy disclosure. Changes are **not guaranteed live** until your website host deploys the latest GitHub commit.
- The parser accepts `Candidate_Data_Consent=Yes` and `Employer_Data_Consent=Yes`. Submissions without the new checkbox values are **manual-review only**. Do not auto-process legacy forms lacking consent.
- Internal customer/position identifiers are read from private Apps Script **Script Properties**, not published in GitHub.
- Folder and Google Sheet links are accessible only to users with appropriate Google permissions; do not make the upload folder public. Individual files remain private.
- FormSubmit is a third-party processor handling the initial form submission. Review its privacy/security and attachment limits before production use.
- The code was **syntax-checked and the parser and name+email/phone matching were unit-tested using synthetic text**, but **Google OAuth, timed execution, real-form submission, Drive uploads, production CRM writes and hosting deployment have NOT yet been tested/activated**.

## Email templates

- [Mechanical Engineer branded HTML](../../email-templates/candidate-mechanical.html)
- [Electrical Engineer branded HTML](../../email-templates/candidate-electrical.html)
- [Employer hiring inquiry branded HTML](../../email-templates/employer-intake.html)

The email signature includes both **Chris Yoo / chris.yoo@personalink.me** and **Applications & Hiring Requests / annie@personalink.me**, the existing logo-style P monogram, plus links to Careers and Employer Request. The files are templates; they do **not** configure an account-wide Gmail signature. Outbound messages always require explicit approval.

## Operational checks after go-live

- Search Gmail for genuine website submissions and compare their Gmail message IDs to **웹사이트 접수함**; make sure no duplicate candidates/jobs were created.
- Check that candidate uploads exist in the private folder and are connected to the intended person/job.
- Confirm a public talent-network listing did not create a fictitious active job.
- Confirm every employer order is `미승인` and no client name was published.
- Confirm no automatic email or SMS was transmitted.
