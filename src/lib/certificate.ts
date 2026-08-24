import certificateAsset from '@/assets/certificate-template.pdf.asset.json';
import type { Child, IronTransaction } from '@/types/app';

export const CERTIFICATE_TEMPLATE = certificateAsset.url;

export const validateCertificateName = (orig: string, next: string): boolean => {
  return orig.trim().toLowerCase() === next.trim().toLowerCase();
};

export const renderCertificateCanvas = async (
  name: string,
  img: HTMLImageElement | null
): Promise<string | null> => {
  // Placeholder for future canvas rendering.
  void name;
  void img;
  return null;
};

export const saveChildArchiveSnapshot = (child: Child, txs?: IronTransaction[]) => {
  try {
    localStorage.setItem('zz_child_persistent_passport_v1', JSON.stringify({ child, txs: txs ?? [] }));
  } catch { /* storage unavailable */ }
};

export const getChildArchiveSnapshot = (): { child: Child; txs: IronTransaction[] } | null => {
  try {
    const raw = localStorage.getItem('zz_child_persistent_passport_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return { child: parsed.child as Child, txs: (parsed.txs ?? []) as IronTransaction[] };
  } catch { return null; }
};
