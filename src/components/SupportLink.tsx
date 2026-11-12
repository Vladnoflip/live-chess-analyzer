import { useI18n } from '../hooks/useAnalysis';
import { SUPPORT_URL } from '../core/support';

/** Small, unobtrusive "❤️ Support" link; opens the Boosty donation page in a new tab. */
export function SupportLink() {
  const { t } = useI18n();
  return (
    <a className="support-link" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" title={t('support.coffee')}>
      <span aria-hidden>❤️</span> {t('support.project')}
    </a>
  );
}
