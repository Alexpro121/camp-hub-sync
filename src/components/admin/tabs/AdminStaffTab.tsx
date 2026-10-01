import { lazyRetry } from '@/lib/lazyRetry';

const AdminStaffAccounts = lazyRetry(() => import('@/components/admin/AdminStaffAccounts'));

/** Staff accounts, invite links and team assignments. */
const AdminStaffTab = () => <AdminStaffAccounts />;

export default AdminStaffTab;
