import { loadFilecheck } from 'filecheck-js';
import { FilecheckIntake, FilecheckProvider } from 'filecheck-react';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

const filecheckPromise = loadFilecheck(import.meta.env.VITE_FILECHECK_PK ?? 'pk_test123');
const WORKFLOW_ID = import.meta.env.VITE_FILECHECK_WORKFLOW ?? 'wf_demo';

function App() {
  const [canProceed, setCanProceed] = useState(false);
  const [jobId, setJobId] = useState('');

  return (
    <FilecheckProvider filecheck={filecheckPromise}>
      <h1>Upload your artwork</h1>
      <FilecheckIntake
        workflowId={WORKFLOW_ID}
        ui={{ title: 'Check your files' }}
        onStatus={(status) => {
          // canProceed is authoritative — never re-derive it.
          setCanProceed(status.canProceed);
          setJobId(status.jobId ?? '');
        }}
        onError={({ code, message }) => console.error(`[filecheck] ${code}: ${message}`)}
      />
      <form method="post" action="/checkout">
        <input type="hidden" name="filecheck_job_id" value={jobId} readOnly />
        <button type="submit" disabled={!canProceed}>
          Add to cart
        </button>
      </form>
    </FilecheckProvider>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
