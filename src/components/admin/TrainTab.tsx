import { useState } from 'react';
import CoupeImport from '@/components/admin/CoupeImport';
import AdminTrainView from '@/components/coupes/AdminTrainView';
import TrainPublishStatus from '@/components/coupes/TrainPublishStatus';
import CoupeSwapSettings from '@/components/coupes/CoupeSwapSettings';
import { TRAIN_TITLE } from '@/lib/trips';

/** Admin train tab: one single seating list for the whole shift, plus swap controls. */
const TrainTab = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-4">
      <TrainPublishStatus editable />
      <CoupeSwapSettings myTeam={null} />
      <CoupeImport onSaved={() => setRefreshKey((k) => k + 1)} />
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-1 mb-2">
          Збережене розселення · {TRAIN_TITLE}
        </p>
        <AdminTrainView refreshKey={refreshKey} />
      </div>
    </div>
  );
};

export default TrainTab;
