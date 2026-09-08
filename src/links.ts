import { lang } from './i18n';

// Outbound links to the author's site. The support page takes the mode and the language, nothing else:
// no session data ever leaves the machine, not even in a query string.

const SITE = 'https://www.dominguezpablo.com';

export const PORTFOLIO = `${SITE}/`;
export const PROJECTS = `${SITE}/projects`;

/** The support page in bug or suggestion mode, in the language the interface is in right now. */
export const support = (type: 'bug' | 'suggestion') => `${SITE}/support/take-keeper?type=${type}&lang=${lang()}`;
