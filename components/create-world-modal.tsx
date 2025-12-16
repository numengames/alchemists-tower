'use client';

import { cn } from '@/lib/utils';

import { useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface CreateWorldModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'name' | 'environment' | 'template' | 'version' | 'confirm';

const templates = [
  { id: 'blank', name: 'Blank Canvas', desc: 'Start from scratch' },
  { id: 'starter', name: 'Starter Kit', desc: 'Pre-configured world' },
  { id: 'advanced', name: 'Advanced', desc: 'Full-featured setup' },
];

const versions = ['v2.4.1', 'v2.4.0', 'v2.3.9', 'v2.3.8'];

export function CreateWorldModal({ isOpen, onClose }: CreateWorldModalProps) {
  const [step, setStep] = useState<Step>('name');
  const [formData, setFormData] = useState({
    name: '',
    environment: 'production',
    template: 'starter',
    version: 'v2.4.1',
  });

  if (!isOpen) return null;

  const handleNext = () => {
    const steps: Step[] = ['name', 'environment', 'template', 'version', 'confirm'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const handlePrev = () => {
    const steps: Step[] = ['name', 'environment', 'template', 'version', 'confirm'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const handleCreate = () => {
    // TODO: API call to create world
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-sidebar border border-sidebar-border rounded-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="border-b border-sidebar-border px-6 py-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Rebirth Cycle: Create World</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-sidebar-accent/30 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-foreground/60" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-8">
          {step === 'name' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">World Name</label>
              <Input
                placeholder="e.g., Genesis Prime"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-sidebar-accent/30 border-sidebar-border text-foreground placeholder:text-foreground/40"
                autoFocus
              />
              <p className="text-xs text-foreground/60 mt-2">Choose a unique name for your world</p>
            </div>
          )}

          {step === 'environment' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-4">Environment</label>
              <div className="space-y-2">
                {['production', 'staging', 'development'].map((env) => (
                  <button
                    key={env}
                    onClick={() => setFormData({ ...formData, environment: env })}
                    className={cn(
                      'w-full p-3 rounded-lg border text-left transition-colors',
                      formData.environment === env
                        ? 'border-solar-gold bg-solar-gold/10 text-foreground'
                        : 'border-sidebar-border text-foreground/70 hover:border-sidebar-border/50',
                    )}
                  >
                    <div className="font-medium capitalize">{env}</div>
                    <div className="text-xs text-foreground/50 mt-1">
                      {env === 'production' && 'Live environment'}
                      {env === 'staging' && 'Testing environment'}
                      {env === 'development' && 'Development sandbox'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'template' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-4">Template</label>
              <div className="space-y-2">
                {templates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => setFormData({ ...formData, template: tmpl.id })}
                    className={cn(
                      'w-full p-3 rounded-lg border text-left transition-colors',
                      formData.template === tmpl.id
                        ? 'border-solar-gold bg-solar-gold/10 text-foreground'
                        : 'border-sidebar-border text-foreground/70 hover:border-sidebar-border/50',
                    )}
                  >
                    <div className="font-medium">{tmpl.name}</div>
                    <div className="text-xs text-foreground/50 mt-1">{tmpl.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'version' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-4">Version</label>
              <div className="space-y-2">
                {versions.map((v) => (
                  <button
                    key={v}
                    onClick={() => setFormData({ ...formData, version: v })}
                    className={cn(
                      'w-full p-3 rounded-lg border text-left transition-colors font-mono text-sm',
                      formData.version === v
                        ? 'border-solar-gold bg-solar-gold/10 text-foreground'
                        : 'border-sidebar-border text-foreground/70 hover:border-sidebar-border/50',
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-sidebar-accent/20 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground/70">Name:</span>
                  <span className="font-medium text-foreground">{formData.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/70">Environment:</span>
                  <span className="font-medium text-foreground capitalize">
                    {formData.environment}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/70">Template:</span>
                  <span className="font-medium text-foreground">
                    {templates.find((t) => t.id === formData.template)?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground/70">Version:</span>
                  <span className="font-medium text-foreground font-mono">{formData.version}</span>
                </div>
              </div>
              <p className="text-xs text-foreground/60">
                Launching your world will trigger the rebirth cycle. This may take a few moments.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-sidebar-border px-6 py-4 flex gap-3">
          <Button
            onClick={step === 'name' ? onClose : handlePrev}
            variant="outline"
            className="flex-1 border-sidebar-border text-foreground hover:bg-sidebar-accent/20 bg-transparent"
          >
            {step === 'name' ? 'Cancel' : 'Back'}
          </Button>
          <Button
            onClick={step === 'confirm' ? handleCreate : handleNext}
            className="flex-1 bg-solar-gold text-sidebar-foreground hover:bg-solar-amber"
          >
            {step === 'confirm' ? 'Launch World' : 'Next'}
            {step !== 'confirm' && <ChevronRight className="w-4 h-4 ml-2" strokeWidth={2} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
