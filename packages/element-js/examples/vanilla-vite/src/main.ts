import { loadFilecheck } from '@filecheck/element-js';

const PUBLISHABLE_KEY = import.meta.env.VITE_FILECHECK_PK ?? 'pk_test123';
const WORKFLOW_ID = import.meta.env.VITE_FILECHECK_WORKFLOW ?? 'wf_demo';

const submit = document.querySelector<HTMLButtonElement>('#submit');
const jobInput = document.querySelector<HTMLInputElement>('#filecheck-job-id');

const fc = await loadFilecheck(PUBLISHABLE_KEY);
if (fc) {
  const intake = fc.elements.create('intake', {
    workflowId: WORKFLOW_ID,
    ui: { title: 'Check your files' },
  });

  intake.on('status', (status) => {
    // canProceed is authoritative — never re-derive it from status/files.
    if (submit) submit.disabled = !status.canProceed;
    if (jobInput) jobInput.value = status.jobId ?? '';
  });

  intake.on('error', ({ code, message }) => {
    console.error(`[filecheck] ${code}: ${message}`);
  });

  intake.mount('#filecheck-slot');
}
