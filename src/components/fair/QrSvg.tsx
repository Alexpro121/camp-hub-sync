import { memo } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const DEFAULT_LOGO_URL = 'https://www.ironsquad.org.ua/img/logo-zz.svg';

interface Props {
  value: string;
  size?: number;
  className?: string;
  level?: 'L' | 'M' | 'Q' | 'H';
  bgColor?: string;
  fgColor?: string;
  includeMargin?: boolean;
  includeLogo?: boolean;
  logoSrc?: string;
}

/**
 * Оптимізований QR-рендер: використовує level="Q" (25%) замість "H", 
 * що робить крапки більшими, чистішими та естетичнішими.
 */
const QrSvg = memo(({ 
  value, 
  size = 230, 
  className,
  level = 'Q', // Оптимальний баланс: менше шуму, великі крапки, миттєве зчитування
  bgColor = '#ffffff',
  fgColor = '#090C15',
  includeMargin = true,
  includeLogo = true,
  logoSrc = DEFAULT_LOGO_URL,
}: Props) => {
  if (!value) return null;

  // Розмір логотипа та захисного вирізу
  const logoSize = Math.round(size * 0.20);

  const imageSettings = includeLogo ? {
    src: logoSrc,
    height: logoSize,
    width: logoSize,
    excavate: true, // Чистий захисний виріз навколо логотипа
  } : undefined;

  return (
    <div className="relative inline-flex items-center justify-center p-3 rounded-3xl bg-white shadow-2xl border border-slate-200/80 overflow-hidden select-none">
      <QRCodeSVG
        value={value}
        size={size}
        level={level}
        marginSize={includeMargin ? 1 : 0}
        bgColor={bgColor}
        fgColor={fgColor}
        className={className}
        imageSettings={imageSettings}
        aria-label="QR-код для сканування"
        role="img"
      />
    </div>
  );
});

QrSvg.displayName = 'QrSvg';

export default QrSvg;
