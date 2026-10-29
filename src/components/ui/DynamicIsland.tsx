import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Bell, CheckCircle2, ChevronDown, Clock, FileSpreadsheet, Info, Loader2, MapPin, Megaphone, WifiOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { useDynamicIsland } from '@/context/DynamicIslandContext';
import { Button } from '@/components/ui/button';
import { getEventCategoryIcon } from '@/lib/eventIcons';

const DynamicIsland = () => {
  const { state, payload, expanded, hide, toggleExpanded, pauseAutoHide, resumeAutoHide } = useDynamicIsland();
  const content = useRef<HTMLDivElement>(null);
  const startTouch = useRef<{ x: number; y: number } | null>(null);
  const [height, setHeight] = useState(48);
  const [snapshot, setSnapshot] = useState({ state, payload, expanded });
  const visible = state !== 'HIDDEN';
  // Keep the outgoing content intact while the capsule contracts.
  useEffect(() => { if (visible) setSnapshot({ state, payload, expanded }); }, [state, payload, expanded, visible]);
  const view = visible ? { state, payload, expanded } : snapshot;
  const busy = view.state === 'LOADING_ONLY' || view.state === 'EXCEL_IMPORT';
  const event = view.state === 'EVENT_ALERT';
  const broadcast = view.state === 'BROADCAST';
  const title = event ? view.payload.eventTitle : broadcast ? view.payload.message : view.state === 'OFFLINE' ? 'Немає зв’язку' : view.state === 'EXCEL_IMPORT' ? 'Імпорт таблиці' : view.state === 'LOADING_ONLY' ? 'Завантаження' : view.payload.title;
  const subtitle = view.state === 'OFFLINE' ? (view.payload.queued ? `${view.payload.queued} дій чекають на відправлення` : 'Зміни збережено на пристрої') : view.state === 'EXCEL_IMPORT' ? view.payload.fileName : broadcast ? view.payload.author : view.payload.subtitle;
  const Icon = event ? getEventCategoryIcon(view.payload.eventTitle ?? '', view.payload.category) : view.state === 'SUCCESS_TOAST' ? CheckCircle2 : view.state === 'ERROR_TOAST' ? AlertCircle : view.state === 'OFFLINE' ? WifiOff : broadcast ? Megaphone : view.state === 'EXCEL_IMPORT' ? FileSpreadsheet : Bell;
  const tone = view.state === 'ERROR_TOAST' || (broadcast && view.payload.color === 'red') ? 'danger' : view.state === 'SUCCESS_TOAST' ? 'success' : view.state === 'OFFLINE' ? 'warning' : 'neutral';
  const progress = Math.min(100, Math.max(0, view.payload.progress ?? 0));
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const measure = () => setHeight(Math.ceil(node.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view.state, view.payload, view.expanded]);
  useEffect(() => {
    if (!visible) return;
    const keydown = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [visible, hide]);

  return createPortal(
    <div className="dynamic-island-position" data-visible={visible}>
      <section aria-label="Сповіщення" aria-hidden={!visible} className="dynamic-island-capsule" data-visible={visible} data-expanded={view.expanded} data-busy={busy} data-tone={tone}
        style={{ height: visible ? height : 28 }}
        onMouseEnter={pauseAutoHide} onMouseLeave={() => { if (!expanded) resumeAutoHide(); }}
        onFocusCapture={pauseAutoHide} onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !expanded) resumeAutoHide(); }}
        onTouchStart={(e) => { const touch = e.touches[0]; if (touch) startTouch.current = { x: touch.clientX, y: touch.clientY }; pauseAutoHide(); }}
        onTouchCancel={() => { startTouch.current = null; if (!expanded) resumeAutoHide(); }}
        onTouchEnd={(e) => {
          const touch = e.changedTouches[0]; const start = startTouch.current;
          if (start && touch && start.y - touch.clientY > 36 && Math.abs(start.x - touch.clientX) < 48) hide();
          startTouch.current = null;
          if (!expanded) resumeAutoHide();
        }}>
        <div ref={content} className="dynamic-island-content">
          <div className="dynamic-island-row">
            <span className="dynamic-island-icon">{view.state === 'LOADING_ONLY' ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <Icon className="h-5 w-5" />}</span>
            <div className="min-w-0 flex-1" role={view.state === 'ERROR_TOAST' ? 'alert' : 'status'} aria-live={view.state === 'ERROR_TOAST' ? 'assertive' : 'polite'} aria-atomic="true">
              <p className={`dynamic-island-title ${view.expanded ? '' : 'line-clamp-1'}`}>{title}</p>
              {subtitle && <p className={`dynamic-island-subtitle ${view.expanded ? '' : 'line-clamp-1'}`}>{subtitle}</p>}
            </div>
            {view.state === 'EXCEL_IMPORT' ? <span className="dynamic-island-time">{progress}%</span> : !busy && <>
              <Button variant="ghost" size="icon" className="dynamic-island-control" tabIndex={visible ? 0 : -1} aria-label={view.expanded ? 'Згорнути сповіщення' : 'Розгорнути сповіщення'} title={view.expanded ? 'Згорнути' : 'Розгорнути'} aria-expanded={view.expanded} onClick={toggleExpanded}><ChevronDown className={view.expanded ? 'rotate-180 transition-transform' : 'transition-transform'} /></Button>
              <Button variant="ghost" size="icon" className="dynamic-island-control" tabIndex={visible ? 0 : -1} aria-label="Закрити сповіщення" title="Закрити" onClick={hide}><X /></Button>
            </>}
          </div>
          {view.state === 'EXCEL_IMPORT' && <div role="progressbar" aria-label="Імпорт таблиці" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="dynamic-island-progress"><div style={{ width: `${progress}%` }} /></div>}
          {view.expanded && (event || view.payload.errorDetails) && <div className="dynamic-island-details">
            {event && <>
              <p className="dynamic-island-subtitle">{view.payload.phase === 'pre' ? 'Незабаром' : 'Подія починається'}</p>
              {(view.payload.myTime || view.payload.range) && <p className="flex flex-wrap items-center gap-2"><Clock className="h-4 w-4" /><span className="dynamic-island-time">{view.payload.myTime ?? view.payload.range}</span>{view.payload.myTeams?.length ? <span className="dynamic-island-subtitle">Команда {view.payload.myTeams.join(', ')}</span> : null}</p>}
              {view.payload.myTime && view.payload.range && <p className="dynamic-island-subtitle">Загальний час: {view.payload.range}</p>}
              {view.payload.location && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" /><span>{view.payload.location}</span></p>}
            </>}
            {view.payload.errorDetails && <Button variant="ghost" className="dynamic-island-detail-action" onClick={() => toast.error('Деталі помилки', { description: view.payload.errorDetails })}><Info />Деталі помилки</Button>}
          </div>}
        </div>
      </section>
    </div>, document.body,
  );
};
export default DynamicIsland;
