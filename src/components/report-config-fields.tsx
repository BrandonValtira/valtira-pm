"use client";

import {
  ALWAYS_ON_SECTIONS,
  OPTIONAL_COMPONENTS,
  PERIOD_TYPE_OPTIONS,
  type ReportConfig,
  type ReportPeriodType,
} from "@/lib/report-config";

export function ReportConfigFields({
  config,
  onChange,
  showNarrativeFields = false,
  additionalInfoHint,
}: {
  config: ReportConfig;
  onChange: (next: ReportConfig) => void;
  showNarrativeFields?: boolean;
  additionalInfoHint?: string;
}) {
  function toggle(id: keyof ReportConfig["components"], checked: boolean) {
    onChange({
      ...config,
      components: { ...config.components, [id]: checked },
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-neutral-900">Always included</p>
        <ul className="mt-2 space-y-1.5">
          {ALWAYS_ON_SECTIONS.map((section) => (
            <li key={section.id} className="flex items-start gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked disabled className="mt-0.5" aria-label={section.label} />
              <span>
                <span className="font-medium text-neutral-900">{section.label}</span>
                <span className="block text-xs text-neutral-500">{section.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-sm font-medium text-neutral-900">Optional components</p>
        <ul className="mt-2 space-y-2">
          {OPTIONAL_COMPONENTS.map((section) => (
            <li key={section.id}>
              <label className="flex cursor-pointer items-start gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={config.components[section.id]}
                  onChange={(e) => toggle(section.id, e.target.checked)}
                />
                <span>
                  <span className="font-medium text-neutral-900">{section.label}</span>
                  <span className="block text-xs text-neutral-500">{section.description}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      {showNarrativeFields && config.components.additionalInfo && (
        <div>
          <label htmlFor="report-additional-info" className="block text-sm font-medium text-neutral-900">
            Additional information
          </label>
          <textarea
            id="report-additional-info"
            value={config.additionalInfoText}
            onChange={(e) => onChange({ ...config, additionalInfoText: e.target.value })}
            rows={4}
            placeholder="Risks, notes, or context for the client…"
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
          {additionalInfoHint ? <p className="mt-1 text-xs text-amber-700">{additionalInfoHint}</p> : null}
        </div>
      )}
      {showNarrativeFields && config.components.footer && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="report-footer-name" className="block text-sm font-medium text-neutral-900">
              Name
            </label>
            <input
              id="report-footer-name"
              type="text"
              value={config.footerName}
              onChange={(e) => onChange({ ...config, footerName: e.target.value })}
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="report-footer-title" className="block text-sm font-medium text-neutral-900">
              Title
            </label>
            <input
              id="report-footer-title"
              type="text"
              value={config.footerTitle}
              onChange={(e) => onChange({ ...config, footerTitle: e.target.value })}
              placeholder="Project Manager"
              className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function PeriodTypeFields({
  periodType,
  onChange,
  name,
}: {
  periodType: ReportPeriodType;
  onChange: (next: ReportPeriodType) => void;
  name: string;
}) {
  return (
    <div>
      <span className="block text-sm font-medium text-neutral-900">Cadence</span>
      <div className="mt-2 flex flex-wrap gap-4">
        {PERIOD_TYPE_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm text-neutral-900">
            <input
              type="radio"
              name={name}
              checked={periodType === opt.value}
              onChange={() => onChange(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
