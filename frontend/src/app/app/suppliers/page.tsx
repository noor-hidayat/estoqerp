import { PartyManager } from "@/modules/purchasing/components/party-manager";
import { Truck } from "lucide-react";

export default function SuppliersPage() {
  return (
    <PartyManager
      kind="suppliers"
      title="Suppliers"
      singular="Supplier"
      menu="supply.suppliers"
      icon={Truck}
    />
  );
}