'use client';
import { useAlerts } from '@/contexts/AlertsContext';
import TransactionModal from '@/components/TransactionModal';

/** Renders TransactionModal globally using the selectedTx from AlertsContext.
 *  This allows any component (alerts, cards on any page) to open the modal
 *  by calling selectTx() without needing local state. */
export default function GlobalModal() {
  const { selectedTx, selectTx } = useAlerts();
  return <TransactionModal tx={selectedTx} onClose={() => selectTx(null)} />;
}
