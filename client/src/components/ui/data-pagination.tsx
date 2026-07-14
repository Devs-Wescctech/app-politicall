import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface DataPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export function DataPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 50, 100],
  className = "",
}: DataPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasNextPage = page < totalPages;
  const hasPreviousPage = page > 1;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={`flex items-center justify-between gap-3 flex-wrap pt-2 ${className}`} data-testid="data-pagination">
      <p className="text-xs text-muted-foreground" data-testid="pagination-info">
        {total === 0
          ? "Nenhum registro"
          : `${from.toLocaleString("pt-BR")}–${to.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} registros`}
      </p>

      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground hidden sm:inline">Por página</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger className="h-8 w-16 text-xs" data-testid="pagination-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((s) => (
                  <SelectItem key={s} value={String(s)} data-testid={`pagination-size-${s}`}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onPageChange(1)}
            disabled={!hasPreviousPage}
            data-testid="pagination-first"
            title="Primeira página"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPreviousPage}
            data-testid="pagination-prev"
            title="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <span className="text-xs text-muted-foreground px-2 whitespace-nowrap" data-testid="pagination-pages">
            {page} / {totalPages}
          </span>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNextPage}
            data-testid="pagination-next"
            title="Próxima página"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onPageChange(totalPages)}
            disabled={!hasNextPage}
            data-testid="pagination-last"
            title="Última página"
          >
            <ChevronsRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
