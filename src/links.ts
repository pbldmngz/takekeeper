import { lang } from './i18n';

// The support page: the mode asked for and the language, nothing else. No session data ever leaves the
// machine, not even in a query string. The portfolio and projects links live in the static landing footer.

const SITE = 'https://www.dominguezpablo.com';

/** The support page in bug or suggestion mode, in the language the interface is in right now. */
export const support = (type: 'bug' | 'suggestion') => `${SITE}/support/take-keeper?type=${type}&lang=${lang()}`;
