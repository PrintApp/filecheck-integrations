export { Filecheck, maskKey } from './client.js';
export type { FilecheckClientOptions } from './client.js';
export { Filecheck as default } from './client.js';

export {
  FilecheckError,
  AuthenticationError,
  InvalidRequestError,
  NotFoundError,
  RateLimitError,
  APIError,
  ConnectionError,
  WebhookSignatureError,
} from './errors.js';

export { webhooks, constructEvent, computeSignature } from './webhooks.js';
export type {
  WebhookEvent,
  JobCompletedPayload,
  JobCreatedPayload,
  ConstructEventOptions,
} from './webhooks.js';

export { resolveVerify } from './verify.js';
export type { VerifyOptions, VerifyResult, VerifyState, VerifyReason } from './verify.js';

export { TERMINAL_STATUSES, isTerminal } from './types/job.js';
export type {
  Job,
  JobStatus,
  Outcome,
  OnFailPolicy,
  StepType,
  FileType,
  Artifact,
  Step,
  Task,
  JobSummary,
  ValidateResult,
  ValidateProfileResult,
  PreflightResult,
  OptimizeResult,
  JobRuns,
  Run,
  JobPage,
  DeleteJobResult,
  OrderResult,
} from './types/job.js';

export type {
  SourceRef,
  JobStepInput,
  CreateJobSource,
  CreateJobParams,
  WebhookParam,
  ValidateProfileCode,
  ValidateSource,
  ValidateParams,
  PreflightSource,
  PreflightParams,
  FixSource,
  FixParams,
  PreviewsSource,
  PreviewsParams,
  OptimizeSource,
  OptimizeParams,
  WaitOptions,
  JobResult,
  ListJobsParams,
} from './types/params.js';

export type { UploadInput, UploadOptions, UploadResult } from './resources/uploads.js';
export type { LibraryItem } from './resources/library.js';
export type { HttpTransport, HttpRequest, HttpResponse } from './http/transport.js';
export type { FetchLike } from './http/fetch.js';
