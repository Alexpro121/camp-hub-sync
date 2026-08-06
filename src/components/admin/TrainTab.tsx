import { useState } from 'react';
import CoupeImport from '@/components/admin/CoupeImport';
import AdminTrainView from '@/components/coupes/AdminTrainView';
import TrainPublishStatus from '@/components/coupes/TrainPublishStatus';

/** Admin train tab: import a seating list, then review and edit what is stored. */
const TrainTab = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-4">
      <TrainPublishStatus editable />
      <CoupeImport onSaved={() => setRefreshKey((k) => k + 1)} />
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-1 mb-2">Збережене розселення</p>
        <AdminTrainView refreshKey={refreshKey} />
      </div>
    </div>
  );
};

export default TrainTab;
