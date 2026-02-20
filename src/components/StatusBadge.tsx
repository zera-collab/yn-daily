import { ReportStatus } from '@/lib/types';

const statusConfig: Record<ReportStatus, { label: string; className: string }> = {
    submitted: { label: '提出済み', className: 'badge-submitted' },
    approved: { label: '承認済み', className: 'badge-approved' },
    rejected: { label: '差戻し', className: 'badge-rejected' },
    revision_requested: { label: '差戻し依頼中', className: 'badge-revision' },
};

export default function StatusBadge({ status }: { status: ReportStatus }) {
    const config = statusConfig[status];
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${config.className}`}>
            {config.label}
        </span>
    );
}
