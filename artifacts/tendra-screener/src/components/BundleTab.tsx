import { Clock } from "lucide-react";

export function BundleTab() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
      <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
        <Clock className="w-8 h-8 text-accent/60" />
      </div>
      <div>
        <h3 className="font-mono font-bold text-lg text-foreground">Bundle Analysis</h3>
        <p className="font-mono text-sm text-muted-foreground mt-2">Coming Soon</p>
        <p className="font-mono text-xs text-muted-foreground/60 mt-3 max-w-xs">
          Akan menampilkan hubungan on-chain antar wallet — transfer token &amp; USDT sebagai bukti koordinasi.
        </p>
      </div>
    </div>
  );
}
