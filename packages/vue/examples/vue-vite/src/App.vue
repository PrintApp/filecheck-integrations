<script setup lang="ts">
import { FilecheckIntake } from '@filecheck/vue';
import { ref } from 'vue';

const WORKFLOW_ID = import.meta.env.VITE_FILECHECK_WORKFLOW ?? 'wf_demo';

const jobId = ref('');
const canProceed = ref(false);
</script>

<template>
  <h1>Upload your artwork</h1>
  <FilecheckIntake
    :workflow-id="WORKFLOW_ID"
    v-model:job-id="jobId"
    :ui="{ title: 'Check your files' }"
    @status="(s) => (canProceed = s.canProceed)"
    @error="(e) => console.error(`[filecheck] ${e.code}: ${e.message}`)"
  />
  <form method="post" action="/checkout">
    <input type="hidden" name="filecheck_job_id" :value="jobId" />
    <button type="submit" :disabled="!canProceed">Add to cart</button>
  </form>
</template>
