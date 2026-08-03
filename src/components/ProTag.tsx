// The one PRO badge. Marking a locked item used to be a 10px padlock glyph
// (`.ci-lock`) in the catalog and the literal word "PRO" in the openings flyout
// and Build sheet — and a padlock ALSO means "locked in place" on placed
// furniture (see FurnitureLockIcon / moveLock), so the catalog's marker was both
// faint and ambiguous. A tester read it as no marker at all: "the user has no
// idea it is a paid feature, only after clicking on it."
//
// A word can't be misread, so the catalog now says what the flyout already said.
// One component keeps the markup and the accessible name in a single place.
import { useI18n } from '../lib/i18n';

export default function ProTag() {
  const t = useI18n();
  return (
    <span className="pro-tag-corner" aria-label={t('Pro item')}>
      PRO
    </span>
  );
}
