import { NetworkOptions } from "./NetworkOptions";
import { useDisconnect } from "wagmi";
import { ArrowLeftOnRectangleIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

type WrongNetworkDropdownProps = {
  onDisconnect?: () => void | Promise<void>;
};

export const WrongNetworkDropdown = ({ onDisconnect }: WrongNetworkDropdownProps) => {
  const { disconnect } = useDisconnect();

  const handleDisconnect = () => {
    if (onDisconnect) {
      void onDisconnect();
      return;
    }
    disconnect();
  };

  return (
    <div className="dropdown dropdown-end mr-2">
      <label tabIndex={0} className="btn btn-error btn-sm dropdown-toggle gap-1">
        <span>Wrong network</span>
        <ChevronDownIcon className="h-6 w-4 ml-2 sm:ml-0" />
      </label>
      <ul tabIndex={0} className="dropdown-content menu p-2 mt-1 shadow-lg bg-base-200 gap-1">
        <NetworkOptions />
        <li>
          <button className="menu-item text-error btn-sm flex gap-3 py-3" type="button" onClick={handleDisconnect}>
            <ArrowLeftOnRectangleIcon className="h-6 w-4 ml-2 sm:ml-0" />
            <span>Disconnect</span>
          </button>
        </li>
      </ul>
    </div>
  );
};
