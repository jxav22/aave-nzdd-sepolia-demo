"use client";

import { useRef, useState } from "react";
import { ShieldExclamationIcon } from "@heroicons/react/24/outline";
import { getParsedError, notification } from "~~/utils/scaffold-eth";

type ExportPrivyWalletModalProps = {
  onConfirm: () => Promise<void>;
};

export const EXPORT_PRIVY_WALLET_MODAL_ID = "export-privy-wallet-modal";

export const ExportPrivyWalletModal = ({ onConfirm }: ExportPrivyWalletModalProps) => {
  const modalCheckboxRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const closeModal = () => {
    if (modalCheckboxRef.current) modalCheckboxRef.current.checked = false;
  };

  const handleConfirm = async () => {
    setIsExporting(true);
    try {
      // Privy's exportWallet promise resolves when the user exits their modal, so hand off
      // immediately, and keeping our warning open underneath would stack two overlays.
      closeModal();
      await onConfirm();
    } catch (e) {
      notification.error(getParsedError(e));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      <input type="checkbox" id={EXPORT_PRIVY_WALLET_MODAL_ID} className="modal-toggle" ref={modalCheckboxRef} />
      <label htmlFor={EXPORT_PRIVY_WALLET_MODAL_ID} className="modal cursor-pointer">
        <label className="modal-box relative">
          <input className="h-0 w-0 absolute top-0 left-0" />
          <label htmlFor={EXPORT_PRIVY_WALLET_MODAL_ID} className="btn btn-ghost btn-sm absolute right-3 top-3">
            ✕
          </label>
          <div>
            <p className="text-lg font-semibold m-0 p-0">Export wallet private key</p>
            <div role="alert" className="alert alert-warning mt-4">
              <ShieldExclamationIcon className="h-6 w-6" />
              <span className="font-semibold">
                Anyone with this private key has full control of your wallet and funds. Never share it.
              </span>
            </div>
            <p className="mt-3">
              Continue only if you are moving this wallet to another client (for example MetaMask). The key is shown in
              a secure Privy window. This app never sees it.
            </p>
            <div className="flex gap-2 mt-4">
              <label htmlFor={EXPORT_PRIVY_WALLET_MODAL_ID} className="btn btn-ghost">
                Cancel
              </label>
              <button
                className="btn btn-outline btn-error"
                type="button"
                onClick={handleConfirm}
                disabled={isExporting}
              >
                {isExporting ? "Opening…" : "Continue to export"}
              </button>
            </div>
          </div>
        </label>
      </label>
    </div>
  );
};
