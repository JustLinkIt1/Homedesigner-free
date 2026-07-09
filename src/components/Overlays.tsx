import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useToasts, useConfirm, type ToastKind } from '../lib/ui';

const ICON: Record<ToastKind, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
};

export function Toaster() {
  const { toasts, dismiss, pause, resume } = useToasts();
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.kind];
        return (
          <div
            key={t.id}
            className={`toast ${t.kind}`}
            role="status"
            onMouseEnter={() => pause(t.id)}
            onMouseLeave={() => resume(t.id)}
            onTouchStart={() => pause(t.id)}
            onTouchEnd={() => resume(t.id)}
          >
            <Icon className="icon" />
            <span>{t.message}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <X className="icon" style={{ width: 15, height: 15 }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ConfirmHost() {
  const { req, answer } = useConfirm();
  if (!req) return null;
  return (
    <div className="modal-backdrop" onMouseDown={() => answer(false)}>
      <div className="confirm" onMouseDown={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <h3>{req.title}</h3>
        <p>{req.message}</p>
        <div className="confirm-foot">
          <button className="btn" onClick={() => answer(false)}>
            Cancel
          </button>
          <button
            className={`btn ${req.danger ? 'danger-solid' : 'primary'}`}
            onClick={() => answer(true)}
          >
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
