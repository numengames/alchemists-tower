'use client';

import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
import { LogoutModal } from '@/components/logout-modal';
import { Card } from '@/components/ui/card';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { useState } from 'react';

const faqs = [
  {
    id: 1,
    question: 'How do I create a new world?',
    answer:
      'Navigate to the Dashboard and click the "Create World" button in the top navigation bar. Follow the step-by-step wizard to configure your world settings, choose an environment, and deploy.',
  },
  {
    id: 2,
    question: 'What is the difference between environments?',
    answer:
      'Production environments are for live, user-facing worlds. Development is for experimental work and debugging.',
  },
  {
    id: 3,
    question: 'How do I pause or resume a world?',
    answer:
      'In your world card, click the "Pause" button to temporarily stop the world. Click "Resume" to restart it. Pausing preserves all data and settings.',
  },
  {
    id: 4,
    question: 'Can I rollback to a previous version?',
    answer:
      'Yes! Click on a world card, navigate to the version history, and select "Rollback" next to any previous version. This will restore the world to that state.',
  },
  {
    id: 5,
    question: 'How do I enable two-factor authentication?',
    answer:
      'Go to Settings > Two-Factor Authentication. Scan the QR code with your authenticator app, enter the 6-digit code, and click Verify & Enable.',
  },
  {
    id: 6,
    question: 'What happens when a world fails?',
    answer:
      'Failed worlds are automatically paused and notifications are sent to administrators. Check the Activity Log for error details and attempt to resume or rollback to a stable version.',
  },
];

export default function HelpPage() {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden flex-col md:flex-row">
      <div className="flex-1 overflow-auto">
        <div className="p-6 md:p-20 space-y-8">
          {/* Page Header */}
          <div>
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-2 flex items-center gap-3">
              <HelpCircle className="w-8 h-8 text-primary" strokeWidth={1.5} />
              Help & Support
            </h1>
            <p className="text-foreground/60">Frequently asked questions and guides</p>
          </div>

          {/* FAQ Section */}
          <div className="space-y-4">
            {faqs.map((faq) => (
              <Card
                key={faq.id}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                  className="w-full p-6 flex items-center justify-between text-left hover:bg-card/80 transition-colors cursor-pointer"
                >
                  <h3 className="text-lg font-semibold text-foreground pr-4">{faq.question}</h3>
                  {expandedId === faq.id ? (
                    <ChevronUp className="w-5 h-5 text-primary flex-shrink-0" strokeWidth={1.5} />
                  ) : (
                    <ChevronDown
                      className="w-5 h-5 text-foreground/40 flex-shrink-0"
                      strokeWidth={1.5}
                    />
                  )}
                </button>
                {expandedId === faq.id && (
                  <div className="px-6 pb-6 pt-0">
                    <div className="border-t border-border pt-4">
                      <p className="text-foreground/70 leading-relaxed">{faq.answer}</p>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Contact Support */}
          <Card className="p-6 bg-primary/5 border border-primary/20 rounded-xl">
            <h2 className="text-xl font-serif font-bold text-foreground mb-2">Still need help?</h2>
            <p className="text-foreground/60 mb-4">
              Can't find what you're looking for? Our support team is here to help.
            </p>
            <a
              href="mailto:gm@numengames.com"
              className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Contact Support →
            </a>
          </Card>
        </div>
      </div>
    </div>
  );
}
