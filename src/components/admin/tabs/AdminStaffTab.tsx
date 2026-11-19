import { lazyRetry } from '@/lib/lazyRetry';
import TelegramRequests from '@/components/telegram/TelegramRequests';

const AdminStaffAccounts = lazyRetry(() => import('@/components/admin/AdminStaffAccounts'));

/** Staff accounts, invite links and team assignments; in Telegram also bot registrations and child rebind requests. */
const AdminStaffTab = () => (
  <div className="space-y-4">
    <TelegramRequests mode="admin" />
    <AdminStaffAccounts />
  </div>
);

export default AdminStaffTab;
