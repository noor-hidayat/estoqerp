import { PartyManager } from "@/modules/purchasing/components/party-manager";
import { Users } from "lucide-react";

export default function CustomersPage() {
  return (
    <PartyManager
      kind="customers"
      title="Customers"
      singular="Customer"
      menu="supply.customers"
      icon={Users}
    />
  );
}