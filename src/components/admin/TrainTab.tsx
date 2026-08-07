import { useState } from 'react';
import CoupeImport from '@/components/admin/CoupeImport';
import AdminTrainView from '@/components/coupes/AdminTrainView';
import TrainPublishStatus from '@/components/coupes/TrainPublishStatus';
import TripSelector from '@/components/coupes/TripSelector';
import CoupeSwapSettings from '@/components/coupes/CoupeSwapSettings';
import { tripName } from '@/lib/trips';

/** Admin train tab: one seating list per trip, plus swap controls. */
const TrainTab = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [trip, setTrip] = useState(1);
  return (
    <div className="space-y-4">
      <TrainPublishStatus editable />
      <TripSelector value={trip} onChange={setTrip} />
      <CoupeSwapSettings myTeam={null} />
      <CoupeImport trip={trip} onSaved={() => setRefreshKey((k) => k + 1)} />
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground px-1 mb-2">
          Збережене розселення · {tripName(trip)}
        </p>
        <AdminTrainView refreshKey={refreshKey} trip={trip} />
      </div>
    </div>
  );
};

export default TrainTab;
