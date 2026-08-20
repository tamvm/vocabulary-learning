import React from 'react';
import { Check, Loader2, Circle, X } from 'lucide-react';

export default function PrepareJobPanel({ job, className = '', compact = false }) {
  const steps = Array.isArray(job?.steps) ? job.steps : [];
  if (!steps.length) return null;

  return (
    <div
      className={`rounded-xl border border-primary-200 dark:border-primary-800 bg-white dark:bg-gray-800 ${
        compact ? 'p-3' : 'p-4'
      } ${className}`}
    >
      {!compact ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-700 dark:text-primary-300">
          Background job
        </p>
      ) : null}
      <ol className={compact ? 'space-y-2' : 'mt-3 space-y-3'}>
        {steps.map((step) => (
          <li key={step.id}>
            <div className="flex items-center gap-2 text-sm">
              <StepIcon state={step.state} />
              <span
                className={
                  step.state === 'running'
                    ? 'font-medium text-gray-900 dark:text-white'
                    : 'text-gray-600 dark:text-gray-300'
                }
              >
                {step.label}
                {step.progress && step.state === 'running' ? ` ${step.progress}` : ''}
              </span>
              <span className="ml-auto text-[11px] uppercase tracking-wide text-gray-400">
                {stepPercentLabel(step)}
              </span>
            </div>
            {step.state === 'running' || (step.percent > 0 && step.state !== 'queued') ? (
              <div className="mt-1 ml-6 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    step.state === 'failed' ? 'bg-red-400' : 'bg-primary-500'
                  }`}
                  style={{ width: `${Math.max(step.state === 'running' ? 8 : 0, step.percent || 0)}%` }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {job.error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{job.error}</p>
      ) : null}
    </div>
  );
}

function stepPercentLabel(step) {
  if (step.state === 'done') return '100%';
  if (step.state === 'queued') return 'queued';
  if (step.state === 'failed') return 'failed';
  const percent = Number(step.percent) || 0;
  const eta = step.etaLabel || '';
  if (percent > 0 && eta) return `${percent}% · ${eta} left`;
  if (percent > 0) return `${percent}%`;
  if (eta) return `${eta} left`;
  return 'running';
}

function StepIcon({ state }) {
  if (state === 'done') {
    return <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />;
  }
  if (state === 'running') {
    return <Loader2 className="w-4 h-4 text-primary-600 animate-spin flex-shrink-0" />;
  }
  if (state === 'failed') {
    return <X className="w-4 h-4 text-red-500 flex-shrink-0" />;
  }
  return <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />;
}
