import account from './shots/account.png';
import job from './shots/job.png';
import jobs from './shots/jobs.png';
import listRequest from './shots/list-request.png';
import listsEdit from './shots/lists-edit.png';
import overview from './shots/overview.png';
import part from './shots/part.png';
import partsSelect from './shots/parts-select.png';
import parts from './shots/parts.png';
import phoneJob from './shots/phone-job.png';
import phoneJobs from './shots/phone-jobs.png';
import phoneNotes from './shots/phone-notes.png';
import phoneRequest from './shots/phone-request.png';
import requestNew from './shots/request-new.png';
import requestSent from './shots/request-sent.png';
import requests from './shots/requests.png';
import schedule from './shots/schedule.png';
import ticker from './shots/ticker.png';

export const intro = {
  title: 'How to use the Leemac portal',
  lede: "Welcome. The portal is your window into Leemac's shop. You can see where every job stands, open your drawings, leave notes for us, and ask for a quote without sending an email.",
  body: "Each guide below covers one task in a few short steps. Read the one you need and skip the rest. If you get stuck, email or call us and we'll walk you through it.",
  contact: 'Leemac · leemac@leemac.co · (650) 787-8483 · 1980 Hartog Drive, San Jose, CA 95131',
};

export const guides = [
  {
    id: 'invite',
    title: 'Accept your invite and set a password',
    steps: [
      "You can't sign up on your own. Leemac sets up your account and sends you an invite.",
      'Look for an email with the subject "Your Leemac client portal invite". It names Leemac Manufacturing as the sender.',
      'Click the link in the email. A page called Set your password opens.',
      'Type a password in Password, then type it again in Confirm password.',
      "Click Set password. You're signed in and land on your Overview.",
    ],
    tips: [
      'The link works once, and only for 24 hours. If it has run out, or you see "Invalid or expired link", ask Leemac to send a new invite.',
      'No picture: this page only appears from a fresh invite link.',
    ],
    shots: [],
  },
  {
    id: 'sign-in',
    title: 'Sign in',
    steps: [
      'Go to leemac.co and click Client Login.',
      'Type your email and password.',
      'Click Login.',
      "If you've turned on two-step sign-in, a page called Two-step check asks for a code. Type the 6-digit code from your authenticator app (or one of your backup codes) and click Verify.",
    ],
    tips: [
      'Five wrong passwords in a row lock the account for 15 minutes, and we email you when that happens. Wait, then try again, or reset your password.',
      "No picture: the sign-in pages only show when you're signed out.",
    ],
    shots: [],
  },
  {
    id: 'two-step',
    title: 'Turn on two-step sign-in',
    steps: [
      'Recommended. After this, signing in needs your password and a code from your phone.',
      'Click the round button with your initials, top right, and choose Account. On a phone, tap Account at the bottom. The Account page opens.',
      'Under Two-Factor Authentication, click Turn on.',
      "Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password or similar) and scan the QR code. If you can't scan, type the key shown under it instead.",
      'Type the 6-digit code the app shows into Code and click Enable.',
      "A list of backup codes appears. Save them somewhere safe now; they're shown only once. Each one lets you sign in if you lose your phone. Then click Done.",
      'To turn it off: on the same page, type your password and click Turn off.',
    ],
    tips: [],
    shots: [
      {
        src: account,
        alt: 'The Account page with Update password and Two-Factor Authentication',
        caption: 'The Account page: change your password at the top, two-step sign-in below.',
      },
    ],
  },
  {
    id: 'forgot',
    title: 'Reset a forgotten password',
    steps: [
      'On the sign-in page, click Forgot password?',
      'The menu at the top of the form already says Client. Leave it on Client.',
      'Type your email and click Send Reset Link. The page says "If that email exists, a link is on its way".',
      'Open the email titled "Reset your password" and click the link.',
      'Type your new password in New password, then again in Confirm new password, and click Reset Password.',
      'Click Log in and sign in with the new password.',
    ],
    tips: [
      'The link works once, for 24 hours. Resetting signs you out everywhere else, so sign in again on your other computers.',
      "No picture: these pages only show when you're signed out.",
    ],
    shots: [],
  },
  {
    id: 'change-password',
    title: 'Change your password',
    steps: [
      'Click your initials, top right, and choose Account (or tap Account on a phone).',
      'Under Update password, type your Current password and your New password.',
      'Type the new password again in Confirm new password.',
      'Click Update password.',
      'A message confirms it. Sign in again with the new password.',
      'See the Account page picture in the two-step sign-in guide.',
    ],
    tips: [],
    shots: [],
  },
  {
    id: 'sign-out',
    title: 'Sign out',
    steps: [
      'Click your initials, top right of any page, and choose Log out.',
      'Do this on shared computers. You return to the Leemac home page.',
    ],
    tips: [],
    shots: [],
  },
  {
    id: 'overview',
    title: 'Read the Overview',
    steps: [
      'Your home page on a computer. Everything at a glance, and it refreshes itself every minute.',
      'Click Overview in the top bar (or the Leemac logo).',
      'Read the four numbers at the top. Active jobs: jobs that have not shipped yet. Due soon: jobs due in the next 7 days, with the nearest date under Next due. Overdue: jobs past their due date and not shipped. On time: how many of your jobs shipped by their due date over the last 90 days.',
      'Scan the schedule. It covers four weeks. Each bar runs from the day a job was opened to its due date, and the red NOW line is today. Bars are grouped by stage. Your jobs are links; click one to open it. Other customers\' jobs show only a number, so you can see how busy the shop is.',
      'Watch the live strip along the bottom. Each entry is a stage change in the shop over the past 7 days: the day and time, the job, and the new stage. For your own jobs it also names the part.',
      'Use the Parts panel to see a drawing of each part. Click a drawing to open that part.',
      'Pick a list on the right to show only the parts on that list. Click All parts to show them all again. + New list makes a new one.',
    ],
    tips: [
      'The Overview is for computers. On a phone the portal opens on Jobs instead.',
    ],
    shots: [
      {
        src: overview,
        alt: 'The Overview page',
        caption: 'Left: your jobs and requests. Centre: the numbers, the schedule and your parts. Right: your lists. Bottom: the live strip.',
      },
      {
        src: schedule,
        alt: 'The schedule, with bars and the NOW line',
        caption: 'The schedule. Grey bars are quoted, blue is machining; the red line is today.',
      },
      {
        src: ticker,
        alt: 'The live strip at the bottom of the Overview',
        caption: 'The live strip: day and time, job, new stage.',
      },
    ],
  },
  {
    id: 'find-job',
    title: 'Find a job',
    steps: [
      'Click Your jobs in the top bar. It opens your newest job.',
      'To move to another job, click Switch job and pick one, or click a job in the list.',
      'Type a job number, your PO number or a part number into the search box. The list narrows as you type.',
      'Click the job to open it.',
      'Only your 20 newest jobs load at first. To see older ones, click the older jobs button at the bottom.',
    ],
    tips: [
      'The coloured bar under each job has one segment per part, coloured by that part\'s stage, so you can see at a glance when some parts are ahead of others. Shipped jobs are greyed out.',
    ],
    shots: [
      {
        src: jobs,
        alt: 'The Your jobs page with search box',
        caption: 'Each row shows the job number, its stage, a bar with one segment per part, the PO, the due date and the part count, such as "1 part".',
      },
    ],
  },
  {
    id: 'job-page',
    title: "Check a job's progress and files",
    steps: [
      'Open the job (see Find a job).',
      'At the top: the job number, its stage, the due date with the days left (or days late), your PO and the order date.',
      'On the right, Progress shows the five steps: Quoted, In the shop, Machining, Inspection, Ships. The blue dot is where the job is now.',
      'In the middle, Parts shows a card for each part with its drawing, revision, quantity, material, finish and stage. Click Table for a compact list instead of drawings.',
      'Click a part card to open that part and its full-size drawing. Click Back to job to return.',
      'Under Job files, click Open next to a file to download it, or click Download all files at the top to get every file at once.',
      'Your other jobs stay listed down the left, so you can hop between them.',
    ],
    tips: [
      'Your browser may ask once whether to allow several downloads when you click Download all files. Say yes.',
    ],
    shots: [
      {
        src: job,
        alt: 'A job page with parts, progress, files and notes',
        caption: 'A job page: your jobs on the left, parts in the middle, progress, files and notes on the right.',
      },
    ],
  },
  {
    id: 'notes',
    title: 'Pin a note for Leemac',
    steps: [
      'Notes are the quickest way to tell us something about a job or a part: a changed date, a question about a drawing, a delivery instruction. Leemac sees them straight away and can reply.',
      'On a job page: open the job and click Add note at the top (or click into the box under Notes on this job).',
      'Type your note. A Send button appears.',
      'Click Send. Your note joins the thread.',
      'On a job row: click the Notes button under the job number. A form opens with your latest note; change it and click Save, or type a first note and click Save.',
      'On a part card: on a computer, rest the mouse on it for a moment. A small note card opens beside it. Type in Add a note for Leemac… and click Send.',
      'On a phone, tap the round + next to a part, type, and tap Send. Tap Close when done.',
    ],
    tips: [
      'The Notes button on a row and the badge on a part card show how many notes there are. A note from Leemac is tagged LEEMAC; yours show your initials.',
    ],
    shots: [
      {
        src: phoneNotes,
        alt: 'The notes panel on a phone',
        caption: 'On a phone, tapping + opens the notes for that part.',
      },
    ],
  },
  {
    id: 'parts',
    title: 'Find a part',
    steps: [
      'The Parts page holds every part Leemac has made or quoted for you, across all your jobs.',
      'Click Parts in the top bar.',
      'Type in Search parts: a part number, a description, a material or a job number all work.',
      'Narrow it down if you like. All materials shows only parts in one material. Last ordered: newest / oldest changes the order. On a job now shows only parts that are on an open job.',
      'Switch between Drawings (cards with pictures) and Table (a compact list).',
      'Click a part to open it.',
    ],
    tips: [],
    shots: [
      {
        src: parts,
        alt: 'The Parts page',
        caption: "Each card shows the drawing, part number, revision, latest job, description, material and finish, the last quantity and how many times you've ordered it.",
      },
    ],
  },
  {
    id: 'drawings',
    title: "Open a part's drawings",
    steps: [
      'Open the part, from the Parts page, a job page or the Overview.',
      'The part page shows each drawing large, then the revision, material and finish.',
      'Click the drawing to open the full PDF in a new tab, where you can zoom and print.',
      'Under Past orders, click a job number to jump to that job.',
      'For the STEP model and other files, open a job with this part and use Job files.',
      'When you opened the part from a job, click Back to job to return to it.',
    ],
    tips: [
      '"No drawing" means we don\'t have a drawing on file for that part yet. Add one with your next quote request, or send it in a note.',
    ],
    shots: [
      {
        src: part,
        alt: 'A part page with a large drawing and past orders',
        caption: 'A part page: the drawing, its facts and every job it has been on.',
      },
    ],
  },
  {
    id: 'lists',
    title: 'Build part lists',
    steps: [
      'Lists group parts the way you think about them: by assembly, by project, by "order every quarter". A list makes repeat quote requests a two-click job.',
      'Make a list: on the Parts page, click + New list in the right-hand panel. (The Overview has the same button.) Type a name and click Create.',
      'Add parts to a list: tick the box at the top-left corner of each part you want. A bar shows how many you\'ve picked.',
      'Click Add to list ▾ and pick the list.',
      'Take parts off a list: tick the parts that are already on the list, click Add to list ▾ and pick that same list. The menu then reads Remove from that list, and clicking it takes them off.',
      'Rename or delete a list: in the right-hand panel, click Edit next to the list\'s name. Change the name and click Save.',
      'To delete it, click Delete, then Delete list to confirm, or Keep to back out. The parts stay in your portal; only the list goes.',
    ],
    tips: [
      'The panel\'s All parts tab lists every part by number, and Not on a list shows what you haven\'t sorted yet. The filter box searches both.',
    ],
    shots: [
      {
        src: partsSelect,
        alt: 'One part ticked, with Add to list menu open',
        caption: 'One part ticked. "Add to list" opens your lists; "Request a quote" skips the list and starts a request right away.',
      },
      {
        src: listsEdit,
        alt: 'The lists panel while editing a list',
        caption: 'The lists panel while editing, with a new list being named at the bottom.',
      },
    ],
  },
  {
    id: 'quote-repeat',
    title: "Request a quote for parts you've ordered before",
    steps: [
      'Your drawings are already on file, so you only need quantities.',
      'From a list: on the Parts page, click Request next to the list. (Or, on Your requests, click Request under Start from a list.)',
      'A form opens with a heading, a Need by date and Notes for Leemac for the whole request. Each part on the list follows with its description, rev, material and finish filled in. Change any of them if this order is different.',
      'Type a Quantity of 1 or more for each part you want quoted. Parts left blank are left out.',
      'Click Submit. You\'re taken to Your requests, where the new request shows as Sent.',
      'From parts you tick: on the Parts page, tick the parts you want.',
      'Click Request a quote. The portal saves them as a list named "Quote request" with today\'s date and opens the same form.',
      'Type quantities and click Submit.',
    ],
    tips: [],
    shots: [
      {
        src: listRequest,
        alt: 'The request form for a list',
        caption: 'Requesting from a list: fill in quantities, then Submit. Cancel (or the Esc key) backs out.',
      },
    ],
  },
  {
    id: 'quote-new',
    title: 'Request a quote for new parts',
    steps: [
      "For parts Leemac hasn't made for you before. Each line is one part; give us a PDF drawing and a STEP model for each.",
      'Click Your requests, then New request. (The Overview has a New request button too.)',
      "Click Name this request and give it a name you'll recognise, such as a project or PO.",
      'Optional: set Need by and add Notes for Leemac for the whole request.',
      'Add your drawings. Drag your files onto the dotted box, or click Browse files. A PDF and a STEP with the same name become one line by themselves, so dropping ten pairs makes ten lines.',
      'For each line, fill in the Part number, and if you like the description, rev, material and finish.',
      'Type a Qty of 1 or more on every line.',
      'Need another line? Click + Add line, then drop files onto its own Drop a PDF and STEP here box. Click Remove beside a file to take it off.',
      'Check the bar at the bottom: it counts your lines and warns if any line is missing its PDF or STEP.',
      'Click Submit request. You return to Your requests, where it shows as Sent.',
      'To save a draft and finish later: click Save draft at the top right at any point. Your lines and files are kept.',
      'To come back, open Your requests and click the request marked Draft.',
      'Files we accept: PDF, STEP (.step, .stp), IGES, DXF, DWG, Parasolid (.x_t), SolidWorks part (.sldprt), PNG and JPG.',
    ],
    tips: [
      'Every line needs a quantity of at least 1 before you can submit. If one is missing, the portal flags that line; fill it in or clear the line.',
      'If you type a part number we already have, the line says "Matches your part …" and when it was last made, so you know we have it on file.',
    ],
    shots: [
      {
        src: requestNew,
        alt: 'A new, empty request',
        caption: 'A new request. Drop drawings at the top; each line has a drawing slot, the part details and a quantity.',
      },
    ],
  },
  {
    id: 'follow',
    title: 'Follow your requests',
    steps: [
      'Click Your requests. Every request is listed on the left, newest activity first, with its number, name, line count and need-by date.',
      "Read the status on the right of each one. Draft: saved, not sent yet; only you can see it. Sent: Leemac has it. In review: we're working on your quote. Job created: it's become a job; find it under Your jobs.",
      'Click a request to see what you sent: each line\'s drawing, quantity and files, plus your need-by date and notes.',
      'The Overview also lists your recent requests with their status, under Requests.',
    ],
    tips: [],
    shots: [
      {
        src: requestSent,
        alt: 'A sent request',
        caption: 'A sent request. It can no longer be changed; for changes, pin a note or call us.',
      },
      {
        src: requests,
        alt: 'The Your requests page',
        caption: 'Your requests, with lists you can start a request from underneath.',
      },
    ],
  },
  {
    id: 'phone',
    title: 'Use the portal on your phone',
    steps: [
      'Everything except the Overview works on a phone, laid out for one hand.',
      'Sign in at leemac.co as usual. You land on Jobs.',
      'Use the bar at the bottom to move between Jobs, Parts, Requests and Account.',
      'On a job, your other jobs line up across the top; swipe to move between them.',
      'Tap the round + on any part to add a note, or use Add note at the top of a job.',
      'On the Parts page, switch between Parts and Lists at the top.',
      'In a new request, tap Add drawings · PDF + STEP to pick files from your phone or cloud drive.',
    ],
    tips: [],
    shots: [
      {
        src: phoneJobs,
        alt: 'Jobs on a phone',
        caption: 'Jobs on an iPhone.',
      },
      {
        src: phoneJob,
        alt: 'A job on a phone',
        caption: 'A job on an iPhone.',
      },
      {
        src: phoneRequest,
        alt: 'A new request on a phone',
        caption: 'A new request on an iPhone.',
      },
    ],
  },
];
