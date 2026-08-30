import { MatchGridSkeleton } from '@/components/skeletons';

export default function Loading() {
    return (
        <div className="space-y-6" role="status" aria-label="Loading the bet-slip builder">
            <div className="space-y-2">
                <span className="skeleton block h-6 w-48" />
                <span className="skeleton block h-4 w-full max-w-2xl" />
            </div>
            <MatchGridSkeleton />
        </div>
    );
}
