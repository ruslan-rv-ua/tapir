/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_EmptyInputs */

const uk_browser_empty = /** @type {(inputs: Browser_EmptyInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Введіть запит або оберіть фільтри для пошуку радіостанцій`)
};

const en_browser_empty = /** @type {(inputs: Browser_EmptyInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Enter a query or select filters to search for radio stations`)
};

/**
* | output |
* | --- |
* | "Enter a query or select filters to search for radio stations" |
*
* @param {Browser_EmptyInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_empty = /** @type {((inputs?: Browser_EmptyInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_EmptyInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_empty(inputs)
	return en_browser_empty(inputs)
});