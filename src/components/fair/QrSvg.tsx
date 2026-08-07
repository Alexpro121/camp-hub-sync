import { memo } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  value: string;
  size?: number;
  className?: string;
}

/**
 * Vector QR renderer — no canvas rasterisation, no imperative DOM work,
 * so re-renders stay off the main-thread hot path.
 */
const QrSvg = memo(({ value, size = 210, className }: Props) => (
  <QRCodeSVG
    value={value}
    size={size}
    level="M"
    marginSize={1}
    bgColor="#ffffff"
    fgColor="#0b0b0c"
    className={className}
    aria-label="QR-код оплати"
  />
));

QrSvg.displayName = 'QrSvg';

export default QrSvg;
