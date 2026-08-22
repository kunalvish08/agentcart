import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QueueControlsProps {
  total: number;
  offset: number;
  limit: number;
  onPageChange: (newOffset: number) => void;
}

export function QueueControls({ total, offset, limit, onPageChange }: QueueControlsProps) {
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  return (
    <div className="flex items-center justify-between py-2 border-t border-border/20">
      <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">
        Showing {start}–{end} of {total} <span className="opacity-30">| server-enforced queue</span>
      </p>
      
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={!canPrev}
          onClick={() => onPageChange(Math.max(0, offset - limit))}
          className="h-7 px-2 rounded-none text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-foreground"
        >
          <ChevronLeft className="size-3 mr-1" /> Prev
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canNext}
          onClick={() => onPageChange(offset + limit)}
          className="h-7 px-2 rounded-none text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-foreground"
        >
          Next <ChevronRight className="size-3 ml-1" />
        </Button>
      </div>
    </div>
  );
}
