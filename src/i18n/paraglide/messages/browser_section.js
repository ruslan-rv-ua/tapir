/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_SectionInputs */

const uk_browser_section = /** @type {(inputs: Browser_SectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Браузер станцій`)
};

const en_browser_section = /** @type {(inputs: Browser_SectionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Station Browser`)
};

/**
* | output |
* | --- |
* | "Station Browser" |
*
* @param {Browser_SectionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_section = /** @type {((inputs?: Browser_SectionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_SectionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_section(inputs)
	return en_browser_section(inputs)
});