import { SLA_STATUS_TEXT, type SlaStatus } from "@/lib/domain/tickets";

// Pill showing the SLA indicator (on time / due soon / breached / paused).
export default function SlaPill({ slaStatus, text }: { slaStatus: SlaStatus; text?: string }) {
  const m = SLA_STATUS_TEXT[slaStatus] ?? SLA_STATUS_TEXT.na;
  return <span className={`insignia ${m.tone}`}>{text ?? m.text}</span>;
}
