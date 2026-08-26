"use client";

import { PartyManager } from "@/components/supply/party-manager";
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
