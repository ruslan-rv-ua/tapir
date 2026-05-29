/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Column_NameInputs */

const uk_browser_column_name = /** @type {(inputs: Browser_Column_NameInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Назва`)
};

const en_browser_column_name = /** @type {(inputs: Browser_Column_NameInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Name`)
};

/**
* | output |
* | --- |
* | "Name" |
*
* @param {Browser_Column_NameInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_column_name = /** @type {((inputs?: Browser_Column_NameInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Column_NameInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_column_name(inputs)
	return en_browser_column_name(inputs)
});