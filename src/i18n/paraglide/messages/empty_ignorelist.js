/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Empty_IgnorelistInputs */

const uk_empty_ignorelist = /** @type {(inputs: Empty_IgnorelistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Список ігнорованих треків порожній`)
};

const en_empty_ignorelist = /** @type {(inputs: Empty_IgnorelistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Ignorelist is empty`)
};

/**
* | output |
* | --- |
* | "Ignorelist is empty" |
*
* @param {Empty_IgnorelistInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const empty_ignorelist = /** @type {((inputs?: Empty_IgnorelistInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Empty_IgnorelistInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_empty_ignorelist(inputs)
	return en_empty_ignorelist(inputs)
});