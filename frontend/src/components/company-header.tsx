import { useCompanySettings } from "@/lib/api/query";

export function CompanyHeader({ className = "" }: { className?: string }) {
  const { data: company } = useCompanySettings();
  if (!company) return null;
  return (
    <div className={`flex items-center gap-3 border-b border-border pb-4 mb-4 print:pb-2 ${className}`}>
      {company.logo ? (
        <img src={company.logo} alt={company.companyName} className="h-10 w-10 object-contain rounded border border-border bg-white" />
      ) : (
        <div className="h-10 w-10 rounded border border-dashed flex items-center justify-center text-muted-foreground text-xs">Logo</div>
      )}
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-none">{company.companyName}</div>
        <div className="text-xs text-muted-foreground truncate">
          {company.companyCode} • {company.address ?? ""} {company.taxId ? `• ${company.taxId}` : ""}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {company.country} • {company.baseCurrency} • {company.timezone}
        </div>
      </div>
    </div>
  );
}
