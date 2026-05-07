import { Skeleton } from "@/components/ui/skeleton";

interface PeladaCardSkeletonProps {
  index?: number;
  featured?: boolean;
}

export function PeladaCardSkeleton({ index = 0, featured = false }: PeladaCardSkeletonProps) {
  return (
    <div
      className={[
        "animate-fade-in rounded-xl border p-5",
        featured
          ? "border-primary/30 border-l-4 border-l-primary/50 bg-card"
          : "border-border bg-card",
      ].join(" ")}
      style={{ animationDelay: `${index * 90}ms`, opacity: 0, animationFillMode: "forwards" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2.5">
          {featured && <Skeleton className="mb-1 h-5 w-16 rounded-sm" />}
          <Skeleton className="h-5 w-3/5" />

          <div className="flex gap-3 pt-0.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
          </div>

          <div className="pt-0.5">
            <div className="mb-1.5 flex justify-between">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-7" />
            </div>
            <Skeleton className="h-1 w-full rounded-full" />
          </div>

          <div className="flex gap-1.5 pt-0.5">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>

        <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
      </div>

      {featured && (
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      )}
    </div>
  );
}

export function PeladaCardSkeletonList({ count = 3, showFeatured = false }: { count?: number; showFeatured?: boolean }) {
  return (
    <div className="space-y-3">
      {showFeatured && (
        <>
          <Skeleton className="h-8 w-full rounded-lg" />
          <PeladaCardSkeleton index={0} featured />
        </>
      )}
      {Array.from({ length: showFeatured ? count - 1 : count }).map((_, i) => (
        <PeladaCardSkeleton key={i} index={showFeatured ? i + 1 : i} />
      ))}
    </div>
  );
}
