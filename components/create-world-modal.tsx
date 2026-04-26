'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, Copy, ExternalLink, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/toast-provider';
import { ORG_CONFIG, SUPPORTED_ORGS } from '@/lib/world-templates';
import { cn } from '@/lib/utils';

type Step = 'scope' | 'name' | 'confirm' | 'submitting' | 'result';
type Env = 'pre' | 'pro';

interface OrgOption {
  slug: string;
  domain: string;
}

// Static — orgs come from build-time config, no network needed.
const ORGS: OrgOption[] = SUPPORTED_ORGS.map((slug) => ({
  slug,
  domain: ORG_CONFIG[slug].domain,
}));

interface ProvisioningResult {
  prUrl: string | null;
  prNumber: number | null;
  branch: string;
  hostname: string;
  awsSecretId: string;
  adminCode: string | null;
  worldId: string;
  mode: 'pr' | 'direct';
  assets: { copied: number; envSegment: string; destPrefix: string };
  dns:
    | { skipped: true; reason: string }
    | { skipped: false; domain: string; recordName: string; target: string };
}

interface CreateWorldModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional callback fired after a successful creation so parents can refresh. */
  onWorldCreated?: () => void;
}

const WORLD_NAME_RE = /^[a-z][a-z0-9-]{1,28}[a-z0-9]$/;

const initialFormData = {
  org: ORGS[0]?.slug ?? '',
  env: 'pro' as Env,
  world: '',
  description: '',
  includeAi: false,
};

export function CreateWorldModal({ isOpen, onClose, onWorldCreated }: CreateWorldModalProps) {
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>('scope');
  const [formData, setFormData] = useState(initialFormData);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisioningResult | null>(null);

  const selectedOrg = useMemo(
    () => ORGS.find((o) => o.slug === formData.org),
    [formData.org],
  );

  const computedHostname = useMemo(() => {
    if (!selectedOrg || !formData.world) return null;
    return formData.env === 'pre'
      ? `pre.${formData.world}.${selectedOrg.domain}`
      : `${formData.world}.${selectedOrg.domain}`;
  }, [selectedOrg, formData.world, formData.env]);

  const computedSecretId = useMemo(() => {
    if (!formData.org || !formData.world) return null;
    return `hyperfy2-${formData.org}-${formData.world}-${formData.env}`;
  }, [formData.org, formData.world, formData.env]);

  const nameValid = WORLD_NAME_RE.test(formData.world);

  if (!isOpen) return null;

  const handleClose = () => {
    setFormData(initialFormData);
    setStep('scope');
    setSubmitError(null);
    setResult(null);
    onClose();
  };

  const handleNext = () => {
    if (step === 'scope') {
      if (!formData.org) return;
      setStep('name');
    } else if (step === 'name') {
      if (!nameValid) return;
      setStep('confirm');
    }
  };

  const handlePrev = () => {
    if (step === 'name') setStep('scope');
    else if (step === 'confirm') setStep('name');
  };

  const handleSubmit = async () => {
    setStep('submitting');
    setSubmitError(null);
    try {
      const res = await fetch('/api/worlds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          org: formData.org,
          world: formData.world,
          env: formData.env,
          description: formData.description,
          includeAi: formData.includeAi,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      const r = json as {
        world: { id: string };
        provisioning: {
          mode: 'pr' | 'direct';
          pr_url: string | null;
          pr_number: number | null;
          branch: string;
          aws_secret_id: string;
          hostname: string;
          adminCode: string | null;
          assets: { copied: number; envSegment: string; destPrefix: string };
          dns:
            | { skipped: true; reason: string }
            | { skipped: false; domain: string; recordName: string; target: string };
        };
      };
      setResult({
        worldId: r.world.id,
        mode: r.provisioning.mode,
        prUrl: r.provisioning.pr_url,
        prNumber: r.provisioning.pr_number,
        branch: r.provisioning.branch,
        awsSecretId: r.provisioning.aws_secret_id,
        hostname: r.provisioning.hostname,
        adminCode: r.provisioning.adminCode,
        assets: r.provisioning.assets,
        dns: r.provisioning.dns,
      });
      setStep('result');
      showToast(`World ${formData.world} (${formData.env}) provisioning started`, 'success');
      onWorldCreated?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setSubmitError(message);
      setStep('confirm');
      showToast(`Failed to create world: ${message}`, 'error');
    }
  };

  const copyToClipboard = (value: string, label: string) => {
    void navigator.clipboard
      .writeText(value)
      .then(() => showToast(`${label} copied`, 'success'))
      .catch(() => showToast(`Failed to copy ${label}`, 'error'));
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Create world"
    >
      <div className="bg-sidebar border border-sidebar-border rounded-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="border-b border-sidebar-border px-6 py-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Rebirth Cycle: Create World</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-sidebar-accent/30 rounded-lg transition-colors"
            aria-label="Close create-world modal"
          >
            <X className="w-5 h-5 text-foreground/60" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-8">
          {step === 'scope' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Organization</label>
                <div className="grid grid-cols-2 gap-2">
                  {ORGS.map((org) => (
                    <button
                      key={org.slug}
                      onClick={() => setFormData({ ...formData, org: org.slug })}
                      className={cn(
                        'p-3 rounded-lg border text-left transition-colors',
                        formData.org === org.slug
                          ? 'border-solar-gold bg-solar-gold/10 text-foreground'
                          : 'border-sidebar-border text-foreground/70 hover:border-sidebar-border/50',
                      )}
                    >
                      <div className="font-medium">{org.slug}</div>
                      <div className="text-xs text-foreground/50 mt-1 font-mono">{org.domain}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Environment</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['pre', 'pro'] as Env[]).map((env) => (
                    <button
                      key={env}
                      onClick={() => setFormData({ ...formData, env })}
                      className={cn(
                        'p-3 rounded-lg border text-left transition-colors',
                        formData.env === env
                          ? 'border-solar-gold bg-solar-gold/10 text-foreground'
                          : 'border-sidebar-border text-foreground/70 hover:border-sidebar-border/50',
                      )}
                    >
                      <div className="font-medium uppercase">{env}</div>
                      <div className="text-xs text-foreground/50 mt-1">
                        {env === 'pre' ? 'Staging / preview' : 'Production'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'name' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">World Name</label>
                <Input
                  placeholder="e.g., genesis-prime"
                  value={formData.world}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      world: e.target.value.trim().toLowerCase(),
                    })
                  }
                  className="bg-sidebar-accent/30 border-sidebar-border text-foreground placeholder:text-foreground/40 font-mono"
                  autoFocus
                />
                <p
                  className={cn(
                    'text-xs mt-2',
                    formData.world && !nameValid ? 'text-red-500' : 'text-foreground/60',
                  )}
                >
                  kebab-case, 3–30 chars, must start with a letter and end alphanumeric.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-3">
                  Description (optional)
                </label>
                <Input
                  placeholder="Short description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="bg-sidebar-accent/30 border-sidebar-border text-foreground placeholder:text-foreground/40"
                />
              </div>

              <label className="flex items-start gap-3 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={formData.includeAi}
                  onChange={(e) => setFormData({ ...formData, includeAi: e.target.checked })}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium text-foreground">Enable AI features</div>
                  <div className="text-xs text-foreground/60">
                    Adds AI_PROVIDER, AI_MODEL, AI_EFFORT, AI_API_KEY to the world secret.
                  </div>
                </div>
              </label>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-sidebar-accent/20 space-y-3 text-sm">
                <Row label="Organization" value={formData.org} />
                <Row label="World" value={formData.world} mono />
                <Row label="Environment" value={formData.env.toUpperCase()} />
                <Row label="Hostname" value={computedHostname ?? '—'} mono />
                <Row label="AWS Secret" value={computedSecretId ?? '—'} mono />
                <Row label="AI features" value={formData.includeAi ? 'enabled' : 'disabled'} />
              </div>
              <p className="text-xs text-foreground/60">
                Creates an AWS secret, opens a PR on the GitOps repo, and registers the world.
                Flux will reconcile within a few minutes after the PR is merged.
              </p>
              {submitError && (
                <div className="text-xs text-red-500 border border-red-500/30 bg-red-500/10 rounded px-3 py-2">
                  {submitError}
                </div>
              )}
            </div>
          )}

          {step === 'submitting' && (
            <div className="py-8 flex flex-col items-center gap-3 text-foreground/70">
              <Loader2 className="w-8 h-8 animate-spin text-solar-gold" />
              <p className="text-sm">Provisioning {formData.world}…</p>
              <p className="text-xs text-foreground/50">
                Creating secret, pushing manifests, registering world.
              </p>
            </div>
          )}

          {step === 'result' && result && (
            <div className="space-y-3 text-sm">
              <p className="text-foreground">
                ✅ World <span className="font-mono">{formData.world}</span> ({formData.env}) is
                provisioning.
              </p>
              <div className="p-4 rounded-lg bg-sidebar-accent/20 space-y-3">
                <Row label="Hostname" value={result.hostname} mono />
                <Row label="AWS Secret" value={result.awsSecretId} mono />
                <Row
                  label="S3 assets"
                  value={`${result.assets.copied} copied → ${result.assets.destPrefix}`}
                  mono
                />
                <Row
                  label="DNS"
                  value={
                    result.dns.skipped
                      ? `skipped (${result.dns.reason})`
                      : `${result.dns.recordName}.${result.dns.domain} → NLB`
                  }
                  mono={!result.dns.skipped}
                />
                {result.prUrl ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-foreground/70">Pull request:</span>
                    <a
                      href={result.prUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-solar-gold hover:underline inline-flex items-center gap-1 font-mono"
                    >
                      #{result.prNumber}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ) : (
                  <Row label="Branch" value={result.branch} mono />
                )}
                {result.adminCode && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-foreground/70">Admin code:</span>
                    <button
                      onClick={() => copyToClipboard(result.adminCode!, 'Admin code')}
                      className="text-solar-gold hover:underline inline-flex items-center gap-1 font-mono"
                      aria-label="Copy admin code"
                    >
                      {result.adminCode}
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-foreground/60">
                {result.prUrl
                  ? 'Merge the PR; Flux will reconcile and bring the world up within ~5 minutes.'
                  : 'Flux will reconcile and bring the world up within ~5 minutes.'}
              </p>
              <p className="text-xs text-amber-500/80">
                Save the admin code now — it is shown once.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-sidebar-border px-6 py-4 flex gap-3">
          {step === 'scope' && (
            <>
              <Button
                onClick={handleClose}
                variant="outline"
                className="flex-1 border-sidebar-border text-foreground hover:bg-sidebar-accent/20 bg-transparent"
              >
                Cancel
              </Button>
              <Button
                onClick={handleNext}
                className="flex-1 bg-solar-gold text-sidebar-foreground hover:bg-solar-amber"
                disabled={!formData.org}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" strokeWidth={2} />
              </Button>
            </>
          )}
          {step === 'name' && (
            <>
              <Button
                onClick={handlePrev}
                variant="outline"
                className="flex-1 border-sidebar-border text-foreground hover:bg-sidebar-accent/20 bg-transparent"
              >
                Back
              </Button>
              <Button
                onClick={handleNext}
                className="flex-1 bg-solar-gold text-sidebar-foreground hover:bg-solar-amber"
                disabled={!nameValid}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" strokeWidth={2} />
              </Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button
                onClick={handlePrev}
                variant="outline"
                className="flex-1 border-sidebar-border text-foreground hover:bg-sidebar-accent/20 bg-transparent"
              >
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1 bg-solar-gold text-sidebar-foreground hover:bg-solar-amber"
              >
                Launch World
              </Button>
            </>
          )}
          {step === 'submitting' && (
            <Button
              disabled
              className="flex-1 bg-solar-gold/40 text-sidebar-foreground"
            >
              Provisioning…
            </Button>
          )}
          {step === 'result' && (
            <Button
              onClick={handleClose}
              className="flex-1 bg-solar-gold text-sidebar-foreground hover:bg-solar-amber"
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-foreground/70">{label}:</span>
      <span
        className={cn('font-medium text-foreground text-right break-all', mono && 'font-mono')}
      >
        {value}
      </span>
    </div>
  );
}
