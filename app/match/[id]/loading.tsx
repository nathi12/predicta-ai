import { MatchDetailSkeleton } from '@/components/skeletons';

export default function Loading() {
    return (
        <div role="status" aria-label="Loading match analysis">
            <MatchDetailSkeleton />
        </div>
    );
}
